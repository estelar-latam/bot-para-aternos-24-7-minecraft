/**
 * Bot para servidor Aternos con mineflayer + PANEL DE CONTROL web.
 *
 * MODOS (variable de entorno MOVEMENT):
 *   - "off": modo ESTABLE. No se mueve (physics off). Fiable en versiones muy
 *     nuevas (ej. MC 26.2) que rechazan el movimiento. Solo mantiene la conexión.
 *   - "on" : modo ACTIVO. Camina, lucha contra mobs, huye con poca vida y
 *     recoge/equipa armas. Requiere versión compatible (1.20.x / 1.21.x).
 *
 * PANEL: este proceso levanta un servidor web (Express) en el puerto de Render.
 *   - GET  /            -> panel de control (panel.html)
 *   - GET  /health      -> para UptimeRobot
 *   - GET  /api/status  -> estado del bot (JSON)
 *   - POST /api/action  -> controlar el bot
 *   - POST /api/login   -> validar el token del panel
 * Si defines PANEL_TOKEN, /api/status y /api/action exigen ese token.
 *
 * AVISO: los bots AFK van contra los Términos de Servicio de Aternos y pueden
 * provocar el baneo de tu cuenta. Úsalo bajo tu propia responsabilidad.
 */

require('dotenv').config();
const path = require('path');
const express = require('express');
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { plugin: pvp } = require('mineflayer-pvp');

const HOST = process.env.SERVER_HOST || 'realityapp.aternos.me';
const PORT = parseInt(process.env.SERVER_PORT || '40706', 10);
const USERNAME = process.env.BOT_USERNAME || 'AFKBot';
const RAW_VERSION = process.env.MC_VERSION || 'auto';
const VERSION = RAW_VERSION.toLowerCase() === 'auto' ? false : RAW_VERSION;

const MOVEMENT = (process.env.MOVEMENT || 'off').toLowerCase() === 'on';

const AFK_INTERVAL = parseInt(process.env.AFK_INTERVAL || '30', 10) * 1000;
const RECONNECT_DELAY = parseInt(process.env.RECONNECT_DELAY || '15', 10) * 1000;

// Puerto del panel web (Render lo inyecta como PORT).
const WEB_PORT = parseInt(process.env.PORT || '8080', 10);
const PANEL_TOKEN = process.env.PANEL_TOKEN || '';

// Ajustes que se pueden cambiar EN CALIENTE desde el panel.
const settings = {
  fleeHealth: parseInt(process.env.FLEE_HEALTH || '8', 10),
  detectRange: parseInt(process.env.DETECT_RANGE || '16', 10),
  roamRadius: parseInt(process.env.ROAM_RADIUS || '16', 10),
};

// Mobs que el bot SÍ ataca (cuerpo a cuerpo, seguros de pelear).
const ATTACK_NAMES = new Set([
  'slime', 'magma_cube', 'zombie', 'husk', 'drowned', 'zombie_villager',
  'skeleton', 'stray', 'wither_skeleton', 'bogged', 'spider', 'cave_spider',
  'witch', 'pillager', 'vindicator', 'evoker', 'ravager',
  'zombified_piglin', 'piglin', 'piglin_brute', 'hoglin', 'zoglin',
  'silverfish', 'endermite', 'guardian', 'elder_guardian', 'breeze',
]);

// Mobs de los que el bot HUYE en vez de atacar:
//  - creeper: explota y lo mata/echa del servidor.
//  - enderman: se enfada si lo atacas/miras -> mejor no provocarlo.
//  - warden: demasiado peligroso.
const AVOID_NAMES = new Set(['creeper', 'enderman', 'warden']);

// Distancia (bloques) a la que empieza a alejarse de un mob peligroso.
const AVOID_RANGE = parseInt(process.env.AVOID_RANGE || '10', 10);

// Jugador que atacó al bot (para defenderse solo si le pegan primero).
let aggressor = null;
let aggressorUntil = 0;

// ----- Estado global compartido con el panel -----
let currentBot = null;
let connected = false; // true solo mientras el bot está realmente dentro del servidor
let paused = false;
let combatEnabled = true;
let currentState = 'desconectado';
let lastMessage = '';
const startedAt = Date.now();

function log(msg) {
  console.log(`[AFK-BOT] ${new Date().toISOString()} ${msg}`);
}

// Blindaje: ningún error suelto debe tumbar el proceso.
process.on('uncaughtException', (err) => log(`uncaughtException (ignorado): ${err && err.message}`));
process.on('unhandledRejection', (err) => log(`unhandledRejection (ignorado): ${err && err.message ? err.message : err}`));

function describeReason(reason) {
  if (!reason) return 'sin motivo';
  try {
    if (typeof reason === 'string') return reason;
    if (reason.toString && reason.toString() !== '[object Object]') return reason.toString();
    return JSON.stringify(reason);
  } catch (e) {
    return String(reason);
  }
}

function createBot() {
  log(`Conectando a ${HOST}:${PORT} como "${USERNAME}" (version: ${VERSION || 'auto'}, movimiento: ${MOVEMENT ? 'on' : 'off'})...`);

  let reconnected = false;
  const bot = mineflayer.createBot({
    host: HOST,
    port: PORT,
    username: USERNAME,
    version: VERSION,
    auth: 'offline',
    hideErrors: false,
  });
  currentBot = bot;

  if (MOVEMENT) {
    bot.loadPlugin(pathfinder);
    bot.loadPlugin(pvp);
  }

  function stopTimers() {
    if (bot.__brain) {
      clearInterval(bot.__brain);
      bot.__brain = null;
    }
  }

  function scheduleReconnect(where) {
    if (reconnected) return;
    reconnected = true;
    connected = false;
    stopTimers();
    currentState = 'desconectado';
    log(`Reconectando en ${RECONNECT_DELAY / 1000}s (motivo: ${where})...`);
    setTimeout(createBot, RECONNECT_DELAY);
  }

  bot.once('login', () => log('Login aceptado. Esperando spawn...'));

  bot.once('spawn', () => {
    connected = true;
    if (!MOVEMENT) {
      bot.physicsEnabled = false;
      currentState = 'estable';
      log('DENTRO (modo estable, sin movimiento). Conectado 24/7.');
      startArmSwing(bot);
      return;
    }

    // --- Modo activo ---
    try {
      const movements = new Movements(bot);
      movements.allowParkour = false;     // sin saltos raros (anti-cheat)
      movements.allowSprinting = false;   // movimiento suave, evita kicks
      movements.maxDropDown = 3;          // NO se deja caer más de 3 bloques (evita caídas/daño)
      movements.infiniteLiquidDropdownDistance = false;
      movements.canDig = true;            // puede romper bloques para subir a zona segura...
      movements.digCost = 10;             // ...pero le "cuesta" -> solo si de verdad hace falta
      movements.allow1by1towers = true;   // puede pilarear (poner bloques) para salir de hoyos
      movements.canOpenDoors = true;
      bot.pathfinder.setMovements(movements);
      bot.pvp.movements = movements;
      bot.pathfinder.thinkTimeout = 2000;
      bot.pathfinder.tickTimeout = 20;
    } catch (e) {
      log(`No se pudieron configurar movimientos: ${e.message}`);
    }
    currentState = 'quieto';
    log('DENTRO (modo activo). Empiezo a patrullar en 3s.');
    setTimeout(() => startBrain(bot), 3000);
  });

  bot.on('death', () => {
    log('El bot murió. Reaparecerá automáticamente y seguirá dentro.');
    bot.__state = 'idle';
    try { bot.pvp.stop(); } catch (e) { /* */ }
    try { bot.pathfinder.setGoal(null); } catch (e) { /* */ }
  });

  bot.on('respawn', () => log('Reapareció. Retomando la actividad.'));

  // Defensa propia: si el bot recibe daño y hay un JUGADOR pegado a él
  // (y ningún mob más cerca), lo marca como agresor para contraatacar.
  let lastHealth = 20;
  bot.on('health', () => {
    const h = bot.health;
    if (h < lastHealth - 0.01 && bot.entity) {
      try {
        const player = bot.nearestEntity(
          (e) => e.type === 'player' && e.username && e.username !== USERNAME && dist(bot, e) <= 5
        );
        if (player) {
          // Solo culpa al jugador si NO hay un mob peligroso/atacable más cerca.
          const mob = bot.nearestEntity(
            (e) => (isDanger(e) || isAttackable(e)) && dist(bot, e) < dist(bot, player)
          );
          if (!mob) {
            aggressor = player;
            aggressorUntil = Date.now() + 12000; // se defiende durante 12s
            log(`Me atacó ${player.username}. Me defiendo.`);
          }
        }
      } catch (e) { /* */ }
    }
    lastHealth = h;
  });

  bot.on('kicked', (reason, loggedIn) => log(`EXPULSADO (loggedIn=${loggedIn}): ${describeReason(reason)}`));
  bot.on('error', (err) => log(`Error: ${err.code || err.message}`));
  bot.on('end', (reason) => {
    log(`Desconectado: ${describeReason(reason)}`);
    scheduleReconnect('end');
  });
}

// ----- Modo estable: solo mueve el brazo -----
function startArmSwing(bot) {
  if (bot.__brain) return;
  bot.__brain = setInterval(() => {
    try { bot.swingArm('right'); } catch (e) { /* desconectado */ }
  }, AFK_INTERVAL);
}

// ----- Modo activo: cerebro de comportamiento -----
function startBrain(bot) {
  if (bot.__brain) return;
  bot.__state = 'idle';
  log('Comportamiento activo: patrulla, combate, huida y recogida de armas.');

  bot.__brain = setInterval(() => {
    try { think(bot); } catch (e) { log(`think() error: ${e.message}`); }
  }, 2000);
}

function isAttackable(e) {
  return e && ATTACK_NAMES.has(e.name);
}

function isDanger(e) {
  return e && AVOID_NAMES.has(e.name);
}

function isItemDrop(e) {
  return e && e.name === 'item';
}

function dist(bot, e) {
  return e.position.distanceTo(bot.entity.position);
}

function equipBestWeapon(bot) {
  const weapons = bot.inventory.items().filter(
    (i) => i.name.includes('sword') || i.name.includes('_axe')
  );
  if (!weapons.length) return;
  const rank = ['netherite', 'diamond', 'iron', 'stone', 'golden', 'wooden'];
  const score = (n) => {
    const idx = rank.findIndex((r) => n.includes(r));
    const base = idx === -1 ? 99 : idx;
    return base + (n.includes('sword') ? 0 : 0.5);
  };
  weapons.sort((a, b) => score(a.name) - score(b.name));
  const best = weapons[0];
  if (!bot.heldItem || bot.heldItem.name !== best.name) {
    bot.equip(best, 'hand').catch(() => {});
  }
}

function fleeFrom(bot, threat) {
  try { bot.pvp.stop(); } catch (e) { /* */ }
  const p = bot.entity.position;
  let dx = 1, dz = 0;
  if (threat) {
    dx = p.x - threat.position.x;
    dz = p.z - threat.position.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
  }
  const tx = Math.floor(p.x + dx * 24);
  const tz = Math.floor(p.z + dz * 24);
  bot.pathfinder.setGoal(new goals.GoalNear(tx, Math.floor(p.y), tz, 1), true);
}

function roam(bot) {
  const p = bot.entity.position;
  const x = Math.floor(p.x + (Math.random() * 2 - 1) * settings.roamRadius);
  const z = Math.floor(p.z + (Math.random() * 2 - 1) * settings.roamRadius);
  bot.pathfinder.setGoal(new goals.GoalNear(x, Math.floor(p.y), z, 1));
}

function think(bot) {
  if (!bot.entity) return;

  // Pausado desde el panel: se queda quieto.
  if (paused) {
    try { bot.pvp.stop(); } catch (e) { /* */ }
    try { bot.pathfinder.setGoal(null); } catch (e) { /* */ }
    currentState = 'pausado';
    return;
  }

  const health = typeof bot.health === 'number' ? bot.health : 20;

  // 1) VIDA BAJA -> huir del peligro más cercano
  if (health <= settings.fleeHealth) {
    if (bot.__state !== 'flee') {
      log(`Vida baja (${health}). Huyendo...`);
      bot.__state = 'flee';
    }
    currentState = 'huida';
    const near = bot.nearestEntity((e) => (isDanger(e) || isAttackable(e)) && dist(bot, e) <= settings.detectRange);
    fleeFrom(bot, near);
    return;
  }

  // 2) MOB PELIGROSO cerca (creeper / enderman / warden) -> HUIR, nunca atacar
  const danger = bot.nearestEntity((e) => isDanger(e) && dist(bot, e) <= AVOID_RANGE);
  if (danger) {
    if (bot.__state !== 'avoid') {
      log(`Peligro cerca (${danger.name}). Me alejo, no lo ataco.`);
      bot.__state = 'avoid';
    }
    currentState = 'huida';
    fleeFrom(bot, danger);
    return;
  }

  // 3) DEFENSA PROPIA: contraatacar a un jugador que me golpeó
  if (combatEnabled && aggressor && aggressor.isValid && Date.now() < aggressorUntil
      && dist(bot, aggressor) <= settings.detectRange) {
    equipBestWeapon(bot);
    if (bot.pvp.target !== aggressor) {
      bot.__state = 'fight';
      bot.pvp.attack(aggressor);
    }
    currentState = 'combate';
    return;
  }
  if (aggressor && (!aggressor.isValid || Date.now() >= aggressorUntil)) {
    aggressor = null; // se acabó la defensa
  }

  // 4) ATACAR mobs hostiles seguros (NO jugadores, NO creepers/endermen)
  const threat = combatEnabled
    ? bot.nearestEntity((e) => isAttackable(e) && dist(bot, e) <= settings.detectRange)
    : null;
  if (threat) {
    equipBestWeapon(bot);
    if (bot.pvp.target !== threat) {
      log(`Enemigo cerca: ${threat.name}. Atacando.`);
      bot.__state = 'fight';
      bot.pvp.attack(threat);
    }
    currentState = 'combate';
    return;
  }
  if (bot.__state === 'fight') {
    try { bot.pvp.stop(); } catch (e) { /* */ }
    bot.__state = 'idle';
  }

  // 5) RECOGER objetos
  const drop = bot.nearestEntity((e) => isItemDrop(e) && dist(bot, e) <= settings.detectRange);
  if (drop) {
    if (bot.__state !== 'collect') {
      log('Objeto en el suelo: voy a recogerlo.');
      bot.__state = 'collect';
    }
    currentState = 'recogiendo';
    bot.pathfinder.setGoal(new goals.GoalNear(drop.position.x, drop.position.y, drop.position.z, 0));
    return;
  }

  // 6) PATRULLAR
  const moving = bot.pathfinder.isMoving && bot.pathfinder.isMoving();
  if (bot.__state !== 'roam' || !moving) {
    bot.__state = 'roam';
    currentState = 'patrulla';
    roam(bot);
    equipBestWeapon(bot);
  }
}

// =================== PANEL WEB ===================

function buildStatus() {
  const s = {
    online: false,
    username: USERNAME,
    server: `${HOST}:${PORT}`,
    version: RAW_VERSION,
    movement: MOVEMENT ? 'on' : 'off',
    state: currentState,
    paused,
    combat: combatEnabled,
    health: null,
    maxHealth: 20,
    food: null,
    position: null,
    dimension: null,
    players: [],
    lastMessage,
    settings,
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
  };
  const bot = currentBot;
  try {
    if (connected && bot && bot.entity) {
      s.online = true;
      s.health = Math.round((bot.health || 0) * 10) / 10;
      s.food = Math.round(bot.food || 0);
      const p = bot.entity.position;
      s.position = { x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z) };
      s.dimension = (bot.game && bot.game.dimension) || null;
      s.players = Object.keys(bot.players || {}).sort();
    }
  } catch (e) { /* estado incompleto durante reconexión */ }
  return s;
}

function handleAction(action, value) {
  const bot = currentBot;
  switch (action) {
    case 'say':
      if (bot && value) { bot.chat(String(value).slice(0, 240)); return 'Mensaje enviado'; }
      return 'Sin mensaje o bot desconectado';
    case 'pause':
      paused = true; return 'Bot pausado';
    case 'resume':
      paused = false; return 'Bot reanudado';
    case 'combat_on':
      combatEnabled = true; return 'Combate activado';
    case 'combat_off':
      combatEnabled = false;
      if (bot && bot.pvp) { try { bot.pvp.stop(); } catch (e) { /* */ } }
      return 'Combate desactivado';
    case 'jump':
      if (bot) {
        try {
          bot.setControlState('jump', true);
          setTimeout(() => { try { bot.setControlState('jump', false); } catch (e) { /* */ } }, 500);
        } catch (e) { /* */ }
      }
      return 'Salto';
    case 'goto_player': {
      if (!MOVEMENT) return 'Requiere modo movimiento (MOVEMENT=on)';
      if (!bot || !bot.entity) return 'Bot desconectado';
      const pl = bot.players[value];
      if (!pl || !pl.entity) return `No veo al jugador "${value}"`;
      paused = false;
      try { bot.pathfinder.setGoal(new goals.GoalFollow(pl.entity, 2), true); } catch (e) { return 'Error al ir'; }
      return `Yendo hacia ${value}`;
    }
    case 'reconnect':
      if (bot) { try { bot.quit('panel: reconectar'); } catch (e) { /* */ } }
      return 'Reconectando...';
    case 'set_flee': {
      const v = parseInt(value, 10);
      if (!isNaN(v) && v >= 0 && v <= 20) { settings.fleeHealth = v; return `Huir con vida <= ${v}`; }
      return 'Valor inválido (0-20)';
    }
    case 'set_detect': {
      const v = parseInt(value, 10);
      if (!isNaN(v) && v >= 4 && v <= 64) { settings.detectRange = v; return `Rango de detección = ${v}`; }
      return 'Valor inválido (4-64)';
    }
    case 'set_roam': {
      const v = parseInt(value, 10);
      if (!isNaN(v) && v >= 4 && v <= 64) { settings.roamRadius = v; return `Radio de patrulla = ${v}`; }
      return 'Valor inválido (4-64)';
    }
    default:
      return 'Acción desconocida';
  }
}

function startPanel() {
  const app = express();
  app.use(express.json());

  function requireToken(req, res, next) {
    if (!PANEL_TOKEN) return next(); // sin token configurado -> abierto
    const t = req.get('x-panel-token') || (req.body && req.body.token) || req.query.token;
    if (t === PANEL_TOKEN) return next();
    return res.status(401).json({ ok: false, error: 'Token inválido' });
  }

  app.get('/health', (req, res) => res.json({ ok: true, state: currentState }));

  app.post('/api/login', (req, res) => {
    const t = (req.body && req.body.token) || '';
    if (!PANEL_TOKEN || t === PANEL_TOKEN) return res.json({ ok: true });
    return res.status(401).json({ ok: false, error: 'Token inválido' });
  });

  app.get('/api/status', requireToken, (req, res) => res.json(buildStatus()));

  app.post('/api/action', requireToken, (req, res) => {
    const { action, value } = req.body || {};
    const msg = handleAction(action, value);
    log(`[PANEL] acción "${action}" -> ${msg}`);
    res.json({ ok: true, message: msg, status: buildStatus() });
  });

  app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'panel.html')));

  app.listen(WEB_PORT, '0.0.0.0', () => {
    log(`Panel web escuchando en el puerto ${WEB_PORT}.`);
    if (!PANEL_TOKEN) log('AVISO: PANEL_TOKEN no definido -> el panel está ABIERTO (sin contraseña).');
  });
}

startPanel();
createBot();

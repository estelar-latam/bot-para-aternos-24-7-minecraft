/**
 * Bot para servidor Aternos con mineflayer.
 *
 * MODOS (variable de entorno MOVEMENT):
 *   - "off": modo ESTABLE. No se mueve (physics off). Fiable en versiones muy
 *     nuevas (ej. MC 26.2) que rechazan el movimiento. Solo mantiene la conexión.
 *   - "on" : modo ACTIVO. El bot CAMINA por el mapa, LUCHA contra mobs enemigos,
 *     HUYE cuando le quedan pocos corazones y RECOGE/EQUIPA armas.
 *     Requiere una versión compatible con mineflayer (ej. 1.20.x / 1.21.x).
 *
 * AVISO: los bots AFK van contra los Términos de Servicio de Aternos y pueden
 * provocar el baneo de tu cuenta. Úsalo bajo tu propia responsabilidad.
 */

require('dotenv').config();
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

// Comportamiento del modo activo
const FLEE_HEALTH = parseInt(process.env.FLEE_HEALTH || '8', 10); // corazones*2; huye si <= esto
const DETECT_RANGE = parseInt(process.env.DETECT_RANGE || '16', 10); // radio para detectar mobs/objetos
const ROAM_RADIUS = parseInt(process.env.ROAM_RADIUS || '16', 10); // radio para pasear

// Mobs considerados enemigos (además de la categoría "Hostile mobs" de minecraft-data)
const HOSTILE_NAMES = new Set([
  'slime', 'magma_cube', 'zombie', 'husk', 'drowned', 'zombie_villager',
  'skeleton', 'stray', 'wither_skeleton', 'bogged', 'spider', 'cave_spider',
  'creeper', 'witch', 'pillager', 'vindicator', 'evoker', 'ravager',
  'blaze', 'ghast', 'zombified_piglin', 'piglin', 'piglin_brute', 'hoglin',
  'zoglin', 'phantom', 'silverfish', 'endermite', 'guardian', 'elder_guardian',
  'warden', 'breeze',
]);

function log(msg) {
  console.log(`[AFK-BOT] ${new Date().toISOString()} ${msg}`);
}

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
    stopTimers();
    log(`Reconectando en ${RECONNECT_DELAY / 1000}s (motivo: ${where})...`);
    setTimeout(createBot, RECONNECT_DELAY);
  }

  bot.once('login', () => log('Login aceptado. Esperando spawn...'));

  bot.once('spawn', () => {
    if (!MOVEMENT) {
      bot.physicsEnabled = false;
      log('DENTRO (modo estable, sin movimiento). Conectado 24/7.');
      startArmSwing(bot);
      return;
    }

    // --- Modo activo ---
    try {
      const movements = new Movements(bot);
      movements.canDig = false;           // no rompe bloques (no griefea)
      movements.allow1by1towers = false;  // no hace torres
      movements.allowParkour = false;     // sin saltos "raros" (anti-cheat)
      movements.allowSprinting = false;   // sin correr -> movimiento suave, evita el kick
      bot.pathfinder.setMovements(movements);
      // El plugin de combate usa los mismos movimientos suaves.
      bot.pvp.movements = movements;
    } catch (e) {
      log(`No se pudieron configurar movimientos: ${e.message}`);
    }
    log('DENTRO (modo activo). Empiezo a patrullar en 3s.');
    setTimeout(() => startBrain(bot), 3000);
  });

  bot.on('death', () => {
    log('El bot murió. Reapareciendo...');
    bot.__state = 'idle';
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
  }, 1000);
}

function isHostile(bot, e) {
  if (!e || e === bot.entity) return false;
  if (e.kind && String(e.kind).toLowerCase().includes('hostile')) return true;
  return HOSTILE_NAMES.has(e.name);
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
    return base + (n.includes('sword') ? 0 : 0.5); // prefiere espada sobre hacha a igualdad
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
  const x = Math.floor(p.x + (Math.random() * 2 - 1) * ROAM_RADIUS);
  const z = Math.floor(p.z + (Math.random() * 2 - 1) * ROAM_RADIUS);
  bot.pathfinder.setGoal(new goals.GoalNear(x, Math.floor(p.y), z, 1));
}

function think(bot) {
  if (!bot.entity) return;
  const health = typeof bot.health === 'number' ? bot.health : 20;
  const threat = bot.nearestEntity((e) => isHostile(bot, e) && dist(bot, e) <= DETECT_RANGE);

  // 1) HUIR si vida baja
  if (health <= FLEE_HEALTH) {
    if (bot.__state !== 'flee') {
      log(`Vida baja (${health}). Huyendo...`);
      bot.__state = 'flee';
    }
    fleeFrom(bot, threat);
    return;
  }

  // 2) LUCHAR contra el mob enemigo más cercano
  if (threat) {
    equipBestWeapon(bot);
    if (bot.pvp.target !== threat) {
      log(`Enemigo cerca: ${threat.name}. Atacando.`);
      bot.__state = 'fight';
      bot.pvp.attack(threat);
    }
    return;
  }
  if (bot.__state === 'fight') {
    try { bot.pvp.stop(); } catch (e) { /* */ }
    bot.__state = 'idle';
  }

  // 3) RECOGER objetos/armas cercanos (caminar encima los recoge)
  const drop = bot.nearestEntity((e) => isItemDrop(e) && dist(bot, e) <= DETECT_RANGE);
  if (drop) {
    if (bot.__state !== 'collect') {
      log('Objeto en el suelo: voy a recogerlo.');
      bot.__state = 'collect';
    }
    bot.pathfinder.setGoal(new goals.GoalNear(drop.position.x, drop.position.y, drop.position.z, 0));
    return;
  }

  // 4) PATRULLAR: si no está caminando, elige un nuevo destino
  const moving = bot.pathfinder.isMoving && bot.pathfinder.isMoving();
  if (bot.__state !== 'roam' || !moving) {
    bot.__state = 'roam';
    roam(bot);
    equipBestWeapon(bot); // por si recogió un arma mientras paseaba
  }
}

createBot();

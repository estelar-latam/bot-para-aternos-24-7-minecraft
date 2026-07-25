/**
 * Bot AFK con mineflayer.
 *
 * Se conecta al servidor y se MANTIENE dentro para que Aternos no lo apague
 * (a Aternos le basta con que haya 1 jugador conectado; no hace falta que se
 * mueva). Se reconecta solo y registra el motivo de cada desconexión.
 *
 * MODOS (variable de entorno MOVEMENT):
 *   - "off" (por defecto): modo ESTABLE. Desactiva la física para NO enviar
 *     paquetes de movimiento. Esto evita el kick "Invalid move player packet
 *     received" que ocurre en versiones muy nuevas de Minecraft (ej. 26.2),
 *     donde mineflayer aún no traduce bien el movimiento. El bot solo mueve
 *     el brazo de vez en cuando. Es la opción fiable para 24/7.
 *   - "on": intenta caminar/girar/saltar. Solo úsalo si el servidor corre una
 *     versión que mineflayer soporta bien (ej. 1.20.x / 1.21.x). En versiones
 *     nuevas provoca el kick por movimiento.
 *
 * AVISO: los bots AFK van contra los Términos de Servicio de Aternos y pueden
 * provocar el baneo de tu cuenta. Úsalo bajo tu propia responsabilidad.
 */

require('dotenv').config();
const mineflayer = require('mineflayer');

const HOST = process.env.SERVER_HOST || 'realityapp.aternos.me';
const PORT = parseInt(process.env.SERVER_PORT || '40706', 10);
const USERNAME = process.env.BOT_USERNAME || 'AFKBot';
const RAW_VERSION = process.env.MC_VERSION || 'auto';
// mineflayer usa version:false para autodetectar la versión del servidor.
const VERSION = RAW_VERSION.toLowerCase() === 'auto' ? false : RAW_VERSION;

// Modo de movimiento: "off" (estable, por defecto) u "on" (caminar/saltar).
const MOVEMENT = (process.env.MOVEMENT || 'off').toLowerCase() === 'on';

const AFK_INTERVAL = parseInt(process.env.AFK_INTERVAL || '30', 10) * 1000;
const RECONNECT_DELAY = parseInt(process.env.RECONNECT_DELAY || '15', 10) * 1000;

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[AFK-BOT] ${ts} ${msg}`);
}

// Convierte cualquier "reason" (string, JSON de chat, objeto) en texto legible.
function describeReason(reason) {
  if (!reason) return 'sin motivo';
  try {
    if (typeof reason === 'string') return reason;
    if (reason.toString && reason.toString() !== '[object Object]') {
      return reason.toString();
    }
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
    auth: 'offline', // servidores Aternos suelen aceptar cracked/offline
    hideErrors: false,
  });

  function stopTimers() {
    if (bot.__afkTimer) {
      clearInterval(bot.__afkTimer);
      bot.__afkTimer = null;
    }
  }

  function scheduleReconnect(where) {
    if (reconnected) return; // evita reconectar dos veces por el mismo corte
    reconnected = true;
    stopTimers();
    log(`Reconectando en ${RECONNECT_DELAY / 1000}s (motivo: ${where})...`);
    setTimeout(createBot, RECONNECT_DELAY);
  }

  bot.once('login', () => {
    log('Login aceptado por el servidor. Esperando spawn...');
  });

  bot.once('spawn', () => {
    if (!MOVEMENT) {
      // Clave: apagar la física evita que mineflayer envíe paquetes de
      // movimiento que las versiones nuevas rechazan ("Invalid move packet").
      bot.physicsEnabled = false;
      log('DENTRO del servidor (modo estable, sin movimiento). El bot permanecerá conectado 24/7.');
      startArmSwing(bot);
    } else {
      log('DENTRO del servidor (modo movimiento). Empiezo a moverme en 5s.');
      setTimeout(() => startAntiAfk(bot), 5000);
    }
  });

  bot.on('kicked', (reason, loggedIn) => {
    log(`EXPULSADO (loggedIn=${loggedIn}): ${describeReason(reason)}`);
  });

  bot.on('error', (err) => {
    // ECONNREFUSED/ETIMEDOUT es normal cuando el servidor aún no está online.
    log(`Error: ${err.code || err.message}`);
  });

  bot.on('end', (reason) => {
    log(`Desconectado: ${describeReason(reason)}`);
    scheduleReconnect('end');
  });
}

// Modo estable: solo mueve el brazo (paquete de animación, NO de movimiento).
function startArmSwing(bot) {
  if (bot.__afkTimer) return;
  bot.__afkTimer = setInterval(() => {
    try {
      bot.swingArm('right');
    } catch (e) {
      /* desconectado */
    }
  }, AFK_INTERVAL);
}

// Modo movimiento: camina, gira y salta (solo en versiones compatibles).
function startAntiAfk(bot) {
  if (bot.__afkTimer) return;
  const DIRECTIONS = ['forward', 'back', 'left', 'right'];
  log('Anti-AFK activo: caminando, girando y saltando.');

  bot.__afkTimer = setInterval(() => {
    try {
      const yaw = Math.random() * Math.PI * 2;
      const pitch = (Math.random() - 0.5) * 0.6;
      bot.look(yaw, pitch, false);

      const dir = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
      bot.setControlState(dir, true);
      const jump = Math.random() < 0.5;
      if (jump) bot.setControlState('jump', true);

      setTimeout(() => {
        try {
          bot.setControlState(dir, false);
          bot.setControlState('jump', false);
        } catch (e) {
          /* desconectado a mitad del movimiento */
        }
      }, 1200);
    } catch (e) {
      log(`No se pudo ejecutar el movimiento: ${e.message}`);
    }
  }, AFK_INTERVAL);
}

createBot();

/**
 * Bot AFK con mineflayer.
 *
 * Se conecta al servidor de Minecraft, se MANTIENE dentro y se mueve
 * (camina, gira y salta) de forma periódica para que Aternos no lo apague
 * por inactividad. Se reconecta solo si se cae o si el servidor todavía no
 * está online. Registra el motivo exacto de cada desconexión para diagnóstico.
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
  log(`Conectando a ${HOST}:${PORT} como "${USERNAME}" (version: ${VERSION || 'auto'})...`);

  let reconnected = false;
  const bot = mineflayer.createBot({
    host: HOST,
    port: PORT,
    username: USERNAME,
    version: VERSION,
    auth: 'offline', // servidores Aternos suelen aceptar cracked/offline
    hideErrors: false,
  });

  function stopMovement() {
    if (bot.__afkTimer) {
      clearInterval(bot.__afkTimer);
      bot.__afkTimer = null;
    }
    try {
      bot.clearControlStates();
    } catch (e) {
      /* el bot ya está desconectado */
    }
  }

  function scheduleReconnect(where) {
    if (reconnected) return; // evita reconectar dos veces por el mismo corte
    reconnected = true;
    stopMovement();
    log(`Reconectando en ${RECONNECT_DELAY / 1000}s (motivo: ${where})...`);
    setTimeout(createBot, RECONNECT_DELAY);
  }

  bot.once('login', () => {
    log('Login aceptado por el servidor. Esperando spawn...');
  });

  bot.once('spawn', () => {
    log('Bot DENTRO del servidor. Espero 5s y empiezo a moverme.');
    // Pequeña espera: entrar y moverse en el mismo instante a veces provoca
    // kicks por parte de plugins anti-cheat/anti-bot.
    setTimeout(() => startAntiAfk(bot), 5000);
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

function startAntiAfk(bot) {
  if (bot.__afkTimer) return; // no apilar timers
  const DIRECTIONS = ['forward', 'back', 'left', 'right'];
  log('Anti-AFK activo: caminando, girando y saltando periódicamente.');

  bot.__afkTimer = setInterval(() => {
    try {
      // 1) Mira en una dirección aleatoria (giro suave).
      const yaw = Math.random() * Math.PI * 2;
      const pitch = (Math.random() - 0.5) * 0.6;
      bot.look(yaw, pitch, false);

      // 2) Camina en una dirección aleatoria durante ~1.2s.
      const dir = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
      bot.setControlState(dir, true);

      // 3) A veces salta mientras camina.
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

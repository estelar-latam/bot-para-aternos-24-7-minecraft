/**
 * Bot AFK con mineflayer.
 *
 * Se conecta al servidor de Minecraft y hace micro-movimientos periódicos
 * para que Aternos no lo apague por inactividad. Se reconecta solo si se cae
 * o si el servidor todavía no está online.
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

function createBot() {
  log(`Conectando a ${HOST}:${PORT} como "${USERNAME}" (version: ${VERSION || 'auto'})...`);

  const bot = mineflayer.createBot({
    host: HOST,
    port: PORT,
    username: USERNAME,
    version: VERSION,
    auth: 'offline', // servidores Aternos suelen aceptar cracked/offline
  });

  let afkTimer = null;

  bot.once('spawn', () => {
    log('Bot conectado y dentro del servidor. Iniciando anti-AFK.');
    startAntiAfk(bot);
    afkTimer = bot.__afkTimer;
  });

  bot.on('kicked', (reason) => {
    log(`Expulsado del servidor: ${reason}`);
  });

  bot.on('error', (err) => {
    // ECONNREFUSED/ETIMEDOUT es normal cuando el servidor aún no está online.
    log(`Error de conexión: ${err.code || err.message}`);
  });

  bot.on('end', (reason) => {
    if (afkTimer) clearInterval(afkTimer);
    if (bot.__afkTimer) clearInterval(bot.__afkTimer);
    log(`Desconectado (${reason || 'sin motivo'}). Reintentando en ${RECONNECT_DELAY / 1000}s...`);
    setTimeout(createBot, RECONNECT_DELAY);
  });
}

function startAntiAfk(bot) {
  const timer = setInterval(() => {
    try {
      // Mira en una dirección aleatoria.
      const yaw = Math.random() * Math.PI * 2;
      const pitch = (Math.random() - 0.5) * Math.PI * 0.5;
      bot.look(yaw, pitch, false);

      // Da un pequeño salto para registrar actividad.
      bot.setControlState('jump', true);
      setTimeout(() => bot.setControlState('jump', false), 300);
    } catch (e) {
      log(`No se pudo ejecutar el movimiento anti-AFK: ${e.message}`);
    }
  }, AFK_INTERVAL);

  // Guardamos el timer en el bot para limpiarlo al desconectar.
  bot.__afkTimer = timer;
}

createBot();

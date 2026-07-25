# Bot para Aternos 24/7 (Minecraft)

Bot para intentar mantener encendido un servidor de **Aternos** el mayor tiempo posible.
Combina tres piezas:

1. **Auto-encendido** (`aternos_starter.py`) — inicia sesión en aternos.org, revisa el estado del servidor y pulsa **Start** cuando está apagado.
2. **Bot AFK** (`afk_bot.js`) — se conecta al servidor con [mineflayer](https://github.com/PrismarineJS/mineflayer) y hace micro-movimientos para que Aternos no lo apague por inactividad.
3. **Keep-alive** (`keep_alive.py`) — un pequeño servidor web que **UptimeRobot** pinguea para que el host gratuito no se duerma.

Servidor de ejemplo configurado: `realityapp.aternos.me:40706` (PaperMC).

---

## ⚠️ Aviso importante (léelo antes de usar)

- **Esto viola los Términos de Servicio de Aternos.** Aternos prohíbe expresamente los bots AFK y la automatización para mantener servidores encendidos 24/7. **Pueden banear tu cuenta.** Úsalo bajo tu propia responsabilidad.
- **UptimeRobot NO enciende el servidor de Aternos.** Es un error muy común. UptimeRobot solo hace *pings*; su única función aquí es mantener **despierto el host** donde corre este bot (Replit/Render se duermen sin tráfico). **Quien enciende Aternos es `aternos_starter.py`.**
- **Fiabilidad limitada.** Aternos usa protección Cloudflare/captcha y cambia su web a menudo, así que el login automático puede romperse. Si eso pasa, actualiza la librería (`pip install --upgrade python-aternos`).
- Si buscas algo estable de verdad y sin riesgo de baneo, considera un hosting de pago barato en lugar de Aternos.

---

## ¿Cómo funciona?

```
                 ┌────────────────────┐   pings cada 5 min
   UptimeRobot ──►  keep_alive.py     │◄───────────────────  (mantiene el HOST despierto)
                 │  (Flask /health)   │
                 └────────────────────┘
                 ┌────────────────────┐   login + Start
                 │  aternos_starter   ├────────────►  aternos.org  (enciende el servidor)
                 │  .py               │
                 └────────────────────┘
                 ┌────────────────────┐   se conecta y se mueve
                 │  afk_bot.js        ├────────────►  realityapp.aternos.me:40706
                 │  (mineflayer)      │              (evita el apagado por inactividad)
                 └────────────────────┘
```

---

## Requisitos

- Una cuenta de **aternos.org** con tu servidor ya creado.
- **Python 3.11+** y **Node.js 18+**.
- (Para 24/7) una cuenta gratuita en **Replit** o **Render**, y una cuenta gratuita en **UptimeRobot**.

---

## Configuración

1. Copia `.env.example` a `.env` y rellena tus datos:

   ```bash
   cp .env.example .env
   ```

2. Edita `.env`:

   | Variable | Descripción |
   |---|---|
   | `ATERNOS_USER` / `ATERNOS_PASSWORD` | Credenciales de tu cuenta de Aternos. |
   | `ATERNOS_SERVER` | Índice (`0` = primer servidor) o nombre exacto del servidor. |
   | `SERVER_HOST` / `SERVER_PORT` | `realityapp.aternos.me` / `40706`. |
   | `MC_VERSION` | Versión **real** de Minecraft de tu Paper (ej. `1.21.4`) o `auto`. |
   | `BOT_USERNAME` | Nombre del bot dentro del juego. |
   | `CHECK_INTERVAL` | Cada cuántos segundos se revisa el estado en Aternos. |
   | `PORT` | Puerto del endpoint de keep-alive. |

   > **Sobre la "Versión: 26.2 (71)"**: eso **no es un número de versión de Minecraft** (las versiones son tipo `1.21.x`). Pon en `MC_VERSION` la versión real de MC que corre tu servidor Paper, o deja `auto` para que el bot la detecte solo.

---

## Uso en local (para probar)

```bash
# 1) Dependencias de Python
pip install -r requirements.txt

# 2) Dependencias de Node
npm install

# 3) Arrancar todo junto
bash start.sh
```

O cada pieza por separado:

```bash
python aternos_starter.py   # auto-encendido + keep-alive
node afk_bot.js             # bot AFK
python keep_alive.py        # solo el endpoint web (para probar UptimeRobot)
```

En los logs deberías ver la secuencia:

```
[ATERNOS] Estado actual: offline
[ATERNOS] Servidor apagado -> enviando START...
[ATERNOS] Estado actual: starting
[ATERNOS] Estado actual: online
[AFK-BOT] ... Bot conectado y dentro del servidor. Iniciando anti-AFK.
```

---

## Despliegue 24/7

### Opción A — Replit

1. Sube este repositorio a Replit (Import from GitHub).
2. En la pestaña **Secrets** (🔒) añade las mismas variables del `.env`.
3. Pulsa **Run** (usa `start.sh` automáticamente).
4. Copia la **URL pública** que te da Replit (algo como `https://tu-repl.usuario.repl.co`).

### Opción B — Render

1. Crea un **Web Service** apuntando a tu repo de GitHub.
2. Build command: `pip install -r requirements.txt && npm install`
3. Start command: `bash start.sh`
4. Añade las variables de entorno en **Environment**.
5. Copia la URL pública `https://tu-servicio.onrender.com`.

### Configurar UptimeRobot (mantiene el host despierto)

1. Entra en [uptimerobot.com](https://uptimerobot.com/) y crea un monitor:
   - **Monitor Type:** HTTP(s)
   - **URL:** la URL pública de tu host + `/health` (ej. `https://tu-repl.usuario.repl.co/health`)
   - **Monitoring Interval:** 5 minutos
2. Guarda. UptimeRobot pingueará ese endpoint y evitará que Replit/Render se duerman.

> Recuerda: esto mantiene despierto **el bot**, no el servidor de Aternos. El encendido de Aternos lo sigue haciendo `aternos_starter.py`.

---

## Solución de problemas

| Problema | Causa probable | Solución |
|---|---|---|
| El login de Aternos falla | Aternos cambió su web / Cloudflare | `pip install --upgrade python-aternos` |
| Pide verificación / 2FA | Cuenta con 2FA activo | Desactiva 2FA o usa una cuenta sin él |
| El bot AFK no entra | El servidor aún no está `online` | Es normal; se reintenta solo cada pocos segundos |
| `Unsupported version` en mineflayer | `MC_VERSION` incorrecta | Pon la versión real de MC o `auto` |
| El host se sigue durmiendo | UptimeRobot mal configurado | Revisa que la URL `/health` responde 200 |

---

## Archivos del proyecto

| Archivo | Función |
|---|---|
| `aternos_starter.py` | Auto-encendido del servidor + lanza el keep-alive |
| `afk_bot.js` | Bot AFK con mineflayer |
| `keep_alive.py` | Endpoint web para UptimeRobot |
| `config.py` | Carga y valida la configuración |
| `start.sh` | Lanza los dos procesos juntos |
| `.env.example` | Plantilla de configuración |
| `Procfile` / `.replit` / `replit.nix` | Config de despliegue |

---

## Licencia

MIT — ver [LICENSE](LICENSE).

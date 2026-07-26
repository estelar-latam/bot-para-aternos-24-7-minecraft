# 🤖 Bot para Aternos 24/7 (Minecraft)

Bot para mantener un servidor de **Aternos** encendido el mayor tiempo posible, con **bot AFK inteligente** (camina, lucha, huye y recoge armas) y un **panel de control web** para manejarlo desde el navegador.

Servidor de ejemplo configurado: `realityapp.aternos.me:40706` — PaperMC.

🎮 **Panel en vivo de este proyecto:** [bot-para-aternos-24-7-minecraft.onrender.com](https://bot-para-aternos-24-7-minecraft.onrender.com/) *(protegido con contraseña)*

---

## ✨ Funciones y mejoras implementadas

Un repaso de todo lo que hace el bot a día de hoy:

**🟢 Mantener el servidor 24/7**
- Bot AFK que se conecta y se **mantiene dentro** para que Aternos no se apague.
- **Auto-encendido** del servidor con `python-aternos` cuando está apagado (best-effort).
- Endpoint `/health` + **UptimeRobot** para que el host (Render) no se duerma.
- **Reconexión automática** si se cae, y **blindaje anti-crash** (ningún error tumba el proceso).

**🤖 Bot inteligente (modo activo, `MOVEMENT=on`)**
- **Camina y patrulla** el mapa (con `mineflayer-pathfinder`).
- **Lucha** contra mobs hostiles y **auto-equipa** la mejor espada/hacha (`mineflayer-pvp`).
- **Huye** cuando le quedan pocos corazones.
- **Recoge y equipa armas/objetos** del suelo.
- **Revive al morir** y sigue dentro (no abandona el servidor).
- **Evita caídas** (no se deja caer de más de 3 bloques) y puede **cavar/pilarear con cuidado** para subir a zona segura.
- **Huye de creepers, endermen y wardens** (no los provoca).
- **Solo ataca jugadores en defensa propia** (si le pegan primero).
- Modo **estable** (`MOVEMENT=off`) para versiones nuevas de Minecraft que rechazan el movimiento.

**🖥️ Panel de control web** (protegido con `PANEL_TOKEN`)
- 📊 **Estado en vivo**: vida, comida, posición, actividad, tiempo conectado.
- 👥 **Jugadores** conectados (con botón *Ir* para mandar el bot hacia uno).
- 🎮 **Controles**: Pausar/Reanudar, Combate ON/OFF, Saltar, Reconectar, **Decir** en el chat.
- 🎒 **Visor de inventario** estilo Minecraft (armadura, mano secundaria, crafteo, inventario y hotbar).
- ⚙️ **Ajustes en caliente**: cuándo huye, rango de detección y radio de patrulla, sin reiniciar.

---

## ⚠️ Aviso importante (léelo antes de usar)

- **Esto va contra los Términos de Servicio de Aternos.** Aternos prohíbe los bots AFK y la automatización para mantener servidores 24/7, y **puede banear tu cuenta**. Úsalo bajo tu propia responsabilidad.
- **UptimeRobot NO enciende Aternos.** Solo hace *pings*; su función real es mantener **despierto el host** (Render se duerme sin tráfico). Quien mantiene el servidor encendido es el **bot AFK** (mientras haya un jugador conectado, Aternos no se apaga).
- **Fiabilidad limitada.** Aternos usa Cloudflare/captcha, así que el auto-encendido por login web puede fallar (no es crítico: el bot AFK mantiene el server encendido igual).

---

## 🧩 ¿Cómo funciona?

Son **dos procesos** que corren juntos (ver [`start.sh`](start.sh)):

```
                       ┌───────────────────────────────┐
 Navegador  ◄────────► │  afk_bot.js  (Node + Express)  │
 (panel de control)    │                               │
 UptimeRobot ─ /health►│  · Bot AFK con mineflayer     ├──► realityapp.aternos.me:40706
                       │  · Panel web + API de control │      (se conecta y mantiene vivo)
                       └───────────────────────────────┘
                       ┌───────────────────────────────┐
                       │  aternos_starter.py (Python)  ├──► aternos.org (login + "Start")
                       │  · Auto-encendido (best-effort)│      cuando el server está apagado
                       └───────────────────────────────┘
```

- **`afk_bot.js` (Node):** se conecta al servidor de Minecraft, se mantiene dentro 24/7, y en modo activo **camina, lucha contra mobs, huye con poca vida y recoge/equipa armas**. Además **sirve el panel web** y el endpoint `/health`.
- **`aternos_starter.py` (Python):** inicia sesión en aternos.org y pulsa **Start** cuando el servidor está apagado (best-effort; Cloudflare puede bloquearlo).

---

## 🌐 Plataformas y páginas que se usan

| Plataforma | Para qué sirve |
|---|---|
| **[Aternos](https://aternos.org/)** | Aloja tu servidor gratuito de Minecraft |
| **[GitHub](https://github.com/estelar-latam/bot-para-aternos-24-7-minecraft)** | Guarda el código de este bot |
| **[Render](https://render.com/)** | 🔑 Ejecuta el bot 24/7 (Node + Python, gratis con Docker) |
| **[UptimeRobot](https://uptimerobot.com/)** | Pinguea el bot cada 5 min para que Render no se duerma |

---

## 🚀 Despliegue paso a paso (Render)

El repo incluye `Dockerfile` y `render.yaml`, así que Render lo despliega solo.

### 1) Cuenta bot en Aternos (si entraste con Google)
Si tu cuenta de Aternos es de Google, no tiene contraseña y el bot no puede iniciar sesión. Crea una **cuenta normal** (usuario + contraseña) en aternos.org y **comparte el acceso** a tu servidor con ella (panel → **Acceso** → añadir usuario con permiso de *Iniciar*).

### 2) Modo offline en el servidor
Para que el bot (cuenta no premium) pueda entrar, el servidor debe estar en **modo craqueado**:
- Aternos → **Opciones** → activa **"Craqueado"** (`online-mode=false`), **o** edita `server.properties` → `online-mode=false`.
- **Reinicia** el servidor. En el log debe aparecer `SERVER IS RUNNING IN OFFLINE/INSECURE MODE`.

### 3) Desplegar en Render
1. [render.com](https://render.com) → **New +** → **Web Service** → conecta este repo.
2. Render detecta `render.yaml` (runtime **Docker**, plan **Free**). Acepta.
3. En **Environment** rellena las variables (ver tabla abajo). Mínimo obligatorio: `ATERNOS_USER`, `ATERNOS_PASSWORD` y `PANEL_TOKEN`.
4. **Deploy**. Al terminar copia tu URL pública: `https://tu-servicio.onrender.com`.

### 4) UptimeRobot (para el 24/7 real)
El plan Free de Render se duerme a los ~15 min sin visitas. Evítalo:
1. [uptimerobot.com](https://uptimerobot.com) → **New monitor** → **HTTP(s)**.
2. **URL:** `https://tu-servicio.onrender.com/health`
3. **Intervalo:** 5 minutos → **Create monitor**.

### 5) (Solo modo activo) Anti-cheat de movimiento
Si el bot va a **caminar/luchar** (`MOVEMENT=on`), relaja el anti-trampas de Paper o te lo echará por `invalid_player_movement`:
- Aternos → **Archivos** → `spigot.yml` → en `settings:` pon:
  ```yaml
  moved-wrongly-threshold: 100.0
  moved-too-quickly-multiplier: 100.0
  ```
- Guarda y **reinicia** el servidor.

---

## 🎮 Panel de control web

Abre tu URL de Render en el navegador. Si definiste `PANEL_TOKEN`, te pedirá esa contraseña.
- **Panel en vivo de este proyecto:** [https://bot-para-aternos-24-7-minecraft.onrender.com/](https://bot-para-aternos-24-7-minecraft.onrender.com/)
- En tu despliegue será `https://tu-servicio.onrender.com`

Desde el panel:
- 📊 **Estado**: vida, comida, posición, actividad (patrulla/combate/huida), tiempo conectado.
- 👥 **Jugadores** en el servidor (con botón *Ir* para mandar el bot hacia uno).
- 🎮 **Controles**: Pausar/Reanudar, Combate ON/OFF, Saltar, Reconectar, **Decir** un mensaje en el chat.
- 🎒 **Inventario**: ventana estilo Minecraft con la armadura, mano secundaria, crafteo, inventario y hotbar del bot (se actualiza sola).
- ⚙️ **Ajustes en caliente**: cuándo huye, rango de detección y radio de patrulla (inmediato, sin reiniciar).

> El panel es accesible desde la URL pública. **Define siempre `PANEL_TOKEN`** con una clave fuerte para que nadie más pueda controlar el bot.

---

## 🕹️ Modos del bot (`MOVEMENT`)

| Modo | Qué hace | Cuándo usarlo |
|---|---|---|
| **`off`** (estable) | Solo se queda conectado (sin moverse) | Versiones muy nuevas (ej. **MC 26.2**) que rechazan el movimiento de mineflayer |
| **`on`** (activo) | **Camina, lucha, huye con poca vida y recoge/equipa armas** | Versiones compatibles con mineflayer: **1.20.x / 1.21.x** (recomendado **1.21.4**) |

> **Versión de Minecraft:** mineflayer va unos meses por detrás de la última versión. Para el modo activo usa **1.21.4** (o 1.20.x). No conviertas un mundo de 26.2 a 1.21.4 (se corrompería): usa un **servidor o mundo nuevo**.

---

## 🔧 Variables de entorno

| Variable | Descripción | Por defecto |
|---|---|---|
| `ATERNOS_USER` | Usuario de tu cuenta de Aternos (la del bot) | — (obligatorio) |
| `ATERNOS_PASSWORD` | Contraseña de esa cuenta | — (obligatorio) |
| `ATERNOS_SERVER` | Índice (`0` = primero) o nombre del servidor | `0` |
| `SERVER_HOST` | Host del servidor | `realityapp.aternos.me` |
| `SERVER_PORT` | Puerto del servidor | `40706` |
| `MC_VERSION` | Versión de Minecraft (`auto` o ej. `1.21.4`) | `auto` |
| `BOT_USERNAME` | Nombre del bot en el juego | `AFKBot` |
| `MOVEMENT` | `off` (estable) u `on` (camina/lucha) | `off` |
| `FLEE_HEALTH` | Vida (0-20) por debajo de la cual huye | `8` |
| `DETECT_RANGE` | Radio (bloques) para detectar mobs/objetos | `16` |
| `ROAM_RADIUS` | Radio (bloques) de patrulla | `16` |
| `CHECK_INTERVAL` | Segundos entre chequeos del auto-encendido | `60` |
| `AFK_INTERVAL` | Segundos entre acciones anti-AFK (modo estable) | `30` |
| `RECONNECT_DELAY` | Segundos antes de reconectar si se cae | `15` |
| `PANEL_TOKEN` | Contraseña del panel web (¡ponla!) | — (vacío = abierto) |
| `PORT` | Puerto web (Render lo asigna solo) | `8080` |

---

## 📁 Archivos del proyecto

| Archivo | Función |
|---|---|
| `afk_bot.js` | Bot AFK (mineflayer) + panel web + API de control (Express) |
| `panel.html` | Interfaz del panel de control |
| `aternos_starter.py` | Auto-encendido del servidor (python-aternos) |
| `config.py` | Carga y valida la configuración de Python |
| `start.sh` | Lanza los dos procesos (Node + Python) |
| `Dockerfile` / `render.yaml` | Despliegue en Render con Docker |
| `Procfile` / `.replit` / `replit.nix` | Despliegue alternativo |
| `requirements.txt` / `package.json` | Dependencias de Python / Node |
| `.env.example` | Plantilla de configuración |

---

## 🩺 Solución de problemas

| Problema | Causa | Solución |
|---|---|---|
| `Failed to verify username` / `invalid session` | Servidor en modo premium | Activa **Craqueado** (`online-mode=false`) y reinicia |
| `invalid_player_movement` (entra y sale) | Anti-cheat de movimiento | Sube los valores en `spigot.yml` (ver despliegue) |
| Entra/sale en MC 26.2 | mineflayer no soporta el movimiento de esa versión | Usa `MOVEMENT=off`, o un servidor 1.21.4 |
| `CloudflareError` en los logs | python-aternos no pasa Cloudflare | No crítico: el bot AFK mantiene el server encendido |
| El bot se cae por "Timed out" | Render Free tiene poca CPU | Ya mitigado (movimiento suave); reconecta solo |
| El login de Aternos falla | Aternos cambió su web | `pip install --upgrade python-aternos` |

---

## 📜 Licencia

MIT — ver [LICENSE](LICENSE).

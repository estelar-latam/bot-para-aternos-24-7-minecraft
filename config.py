"""Carga y validación de la configuración desde variables de entorno / .env."""

import os
import sys

from dotenv import load_dotenv

# Carga el archivo .env si existe (en producción se usan variables reales).
load_dotenv()


def _get(name, default=None, required=False):
    value = os.getenv(name, default)
    if required and (value is None or str(value).strip() == ""):
        print(f"[CONFIG] Falta la variable de entorno obligatoria: {name}", flush=True)
        sys.exit(1)
    return value


def _get_int(name, default):
    raw = os.getenv(name, str(default))
    try:
        return int(raw)
    except (TypeError, ValueError):
        print(f"[CONFIG] {name}='{raw}' no es un número; usando {default}.", flush=True)
        return default


# Credenciales de Aternos
ATERNOS_USER = _get("ATERNOS_USER", required=True)
ATERNOS_PASSWORD = _get("ATERNOS_PASSWORD", required=True)
# Nombre del servidor o índice numérico dentro de la cuenta.
ATERNOS_SERVER = _get("ATERNOS_SERVER", default="0")

# Datos de conexión del servidor de Minecraft
SERVER_HOST = _get("SERVER_HOST", default="realityapp.aternos.me")
SERVER_PORT = _get_int("SERVER_PORT", 40706)
MC_VERSION = _get("MC_VERSION", default="auto")
BOT_USERNAME = _get("BOT_USERNAME", default="AFKBot")

# Comportamiento
CHECK_INTERVAL = _get_int("CHECK_INTERVAL", 60)
AFK_INTERVAL = _get_int("AFK_INTERVAL", 30)
RECONNECT_DELAY = _get_int("RECONNECT_DELAY", 15)

# Servidor web de keep-alive
PORT = _get_int("PORT", 8080)

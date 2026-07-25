"""Servidor web mínimo para que UptimeRobot mantenga despierto el host.

IMPORTANTE: UptimeRobot NO enciende el servidor de Aternos. Lo que hace es
pingear este endpoint cada pocos minutos para que el host gratuito
(Replit / Render, etc.) no se duerma por inactividad. Quien enciende el
servidor es aternos_starter.py.
"""

import threading
import time

from flask import Flask, jsonify

import config

app = Flask(__name__)

# Estado compartido que aternos_starter.py va actualizando.
_state = {
    "aternos_status": "desconocido",
    "last_check": None,
    "started_at": time.time(),
}
_lock = threading.Lock()


def set_status(status):
    """Actualiza el último estado conocido del servidor de Aternos."""
    with _lock:
        _state["aternos_status"] = status
        _state["last_check"] = time.strftime("%Y-%m-%d %H:%M:%S")


@app.route("/")
def index():
    return "Bot Aternos 24/7 activo. El host esta despierto."


@app.route("/health")
def health():
    with _lock:
        uptime = int(time.time() - _state["started_at"])
        return jsonify(
            {
                "ok": True,
                "aternos_status": _state["aternos_status"],
                "last_check": _state["last_check"],
                "uptime_seconds": uptime,
            }
        )


def _run():
    # threaded=True permite atender los pings de UptimeRobot sin bloquear.
    app.run(host="0.0.0.0", port=config.PORT, threaded=True)


def start_in_background():
    """Arranca el servidor Flask en un hilo daemon y devuelve el hilo."""
    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
    print(f"[KEEP-ALIVE] Servidor web escuchando en el puerto {config.PORT}.", flush=True)
    return thread


if __name__ == "__main__":
    # Permite probar el endpoint por separado: python keep_alive.py
    _run()

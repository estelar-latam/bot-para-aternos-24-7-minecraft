"""Auto-encendido del servidor de Aternos.

Inicia sesión en aternos.org con python-aternos, revisa el estado del
servidor cada CHECK_INTERVAL segundos y, si está apagado, lo enciende.
También arranca el servidor de keep-alive (para UptimeRobot).

AVISO: mantener un servidor de Aternos encendido 24/7 con automatización
va contra los Términos de Servicio de Aternos y puede provocar el baneo de
tu cuenta. Úsalo bajo tu propia responsabilidad.
"""

import time
import traceback

from python_aternos import Client

import config
import keep_alive

# Estados en los que NO hay que hacer nada (el servidor ya está arriba o subiendo).
BUSY_STATES = {"online", "starting", "loading", "preparing", "saving", "queueing", "in_queue"}


def pick_server(servers):
    """Selecciona el servidor por índice numérico o por nombre exacto."""
    target = str(config.ATERNOS_SERVER).strip()

    if target.isdigit():
        index = int(target)
        if index < 0 or index >= len(servers):
            raise IndexError(
                f"ATERNOS_SERVER={index} fuera de rango; la cuenta tiene {len(servers)} servidor(es)."
            )
        return servers[index]

    for srv in servers:
        if srv.subdomain == target or srv.domain == target or srv.servid == target:
            return srv

    nombres = ", ".join(s.domain for s in servers)
    raise ValueError(f"No se encontró el servidor '{target}'. Disponibles: {nombres}")


def connect():
    """Inicia sesión en Aternos y devuelve el servidor seleccionado."""
    print("[ATERNOS] Iniciando sesión...", flush=True)
    atclient = Client()
    atclient.login(config.ATERNOS_USER, config.ATERNOS_PASSWORD)

    servers = atclient.account.list_servers()
    if not servers:
        raise RuntimeError("La cuenta no tiene servidores.")

    srv = pick_server(servers)
    print(f"[ATERNOS] Servidor seleccionado: {srv.domain}", flush=True)
    return srv


def monitor_loop():
    backoff = config.CHECK_INTERVAL
    srv = None

    while True:
        try:
            if srv is None:
                srv = connect()
                backoff = config.CHECK_INTERVAL  # reset tras reconectar

            srv.fetch()  # refresca el estado desde Aternos
            status = (srv.status or "").lower()
            keep_alive.set_status(status)
            print(f"[ATERNOS] Estado actual: {status or 'desconocido'}", flush=True)

            if status == "offline" or status == "crashed":
                print("[ATERNOS] Servidor apagado -> enviando START...", flush=True)
                try:
                    srv.start()
                    print("[ATERNOS] Orden de arranque enviada.", flush=True)
                except Exception as start_err:  # noqa: BLE001
                    # Errores típicos: ya arrancando, cola llena, confirmación pendiente.
                    print(f"[ATERNOS] No se pudo iniciar (se reintentará): {start_err}", flush=True)
            elif status in BUSY_STATES:
                print("[ATERNOS] El servidor ya está arriba o arrancando. Sin acción.", flush=True)

            time.sleep(config.CHECK_INTERVAL)

        except KeyboardInterrupt:
            print("[ATERNOS] Detenido por el usuario.", flush=True)
            break

        except Exception as err:  # noqa: BLE001
            # Login/red/Cloudflare. El auto-encendido es "best-effort": el bot AFK
            # ya mantiene el servidor encendido 24/7, así que esto NO es crítico.
            # Registramos un mensaje corto (sin traceback) para no ensuciar los logs.
            srv = None
            keep_alive.set_status("error")
            print(
                f"[ATERNOS] Auto-encendido no disponible ({type(err).__name__}). "
                f"El bot AFK mantiene el server encendido. Reintento en {backoff}s.",
                flush=True,
            )
            time.sleep(backoff)
            backoff = min(backoff * 2, 600)  # backoff exponencial, máx 10 min


def main():
    keep_alive.start_in_background()
    monitor_loop()


if __name__ == "__main__":
    main()

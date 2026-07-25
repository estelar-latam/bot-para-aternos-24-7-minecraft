#!/usr/bin/env bash
# Lanza los dos procesos del bot en paralelo:
#   1) aternos_starter.py -> auto-encendido + keep-alive web (UptimeRobot)
#   2) afk_bot.js         -> bot AFK de Minecraft
# Si cualquiera de los dos muere, se termina todo para que el host lo reinicie.

set -euo pipefail

echo "[START] Iniciando aternos_starter.py (auto-start + keep-alive)..."
python3 aternos_starter.py &
PY_PID=$!

echo "[START] Iniciando afk_bot.js (bot AFK)..."
node afk_bot.js &
NODE_PID=$!

# Si uno de los procesos termina, matamos al otro y salimos.
trap 'kill $PY_PID $NODE_PID 2>/dev/null || true' EXIT
wait -n $PY_PID $NODE_PID

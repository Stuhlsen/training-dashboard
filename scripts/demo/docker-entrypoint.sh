#!/bin/sh
# Fahrplan 31 E6 — Loop des Dienstes "demo-seed" (Vorbild:
# scripts/docker-entrypoint.sh des Syncs). Einmal sofort, danach alle 24 h:
#   1. demo:generate → rides-demo*.json nach /demo/data-demo (Volume demo_data)
#   2. demo:seed     → Accounts + Zeilen in die Demo-DB (ergänzt nur, Q15)
# Bewusst kein `set -e`: ein fehlgeschlagener Lauf soll die Schleife
# fortsetzen, nicht den Container beenden.
#
# Der erste Lauf startet direkt nach dem Proxy; PostgREST hat keinen
# Healthcheck (s. docker-compose.selfhost.yml), ein früher 502 ist möglich.
# Darum wird ein fehlgeschlagener Lauf nach RETRY_SECS wiederholt, bis zu
# RETRIES Mal, bevor der 24-h-Takt greift.

INTERVAL_SECS=86400
RETRY_SECS=15
RETRIES=8

# PID 1 ist diese Shell — ohne Trap verpufft SIGTERM (compose down) bis
# zum harten SIGKILL nach der Grace-Period (wie im Sync-Loop).
CHILD_PID=""
terminate() {
  echo "[demo-seed] Beende (Signal empfangen)" >&2
  [ -n "$CHILD_PID" ] && kill -TERM "$CHILD_PID" 2>/dev/null
  exit 143
}
trap terminate TERM INT

# Kindprozess im Hintergrund + wait, damit der Trap sofort greift.
run_child() {
  "$@" &
  CHILD_PID=$!
  wait "$CHILD_PID"
  status=$?
  CHILD_PID=""
  return $status
}

run_once() {
  echo "[demo-seed] Start: $(date +"%Y-%m-%dT%H:%M:%S%z")"
  run_child node scripts/demo/generate.js || return 1
  run_child node scripts/demo/seed.js || return 1
  echo "[demo-seed] Ende: $(date +"%Y-%m-%dT%H:%M:%S%z")"
}

while true; do
  attempt=0
  until run_once; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge "$RETRIES" ]; then
      echo "[demo-seed] Lauf fehlgeschlagen — nächster Versuch in 24 h" >&2
      break
    fi
    echo "[demo-seed] Lauf fehlgeschlagen — neuer Versuch in ${RETRY_SECS}s ($attempt/$RETRIES)" >&2
    run_child sleep "$RETRY_SECS"
  done
  run_child sleep "$INTERVAL_SECS"
done

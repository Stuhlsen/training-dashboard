#!/bin/sh
# Zeitsteuerung im Container statt System-Cron auf dem Host (Fahrplan 3,
# DKR2 Punkt 2) — Intervall ueber SYNC_INTERVAL_HOURS (Default 6h, wie
# bisher sync-data.yml). SYNC_ONESHOT=true fuer den manuellen Auslöser
# (docker compose run), bewusst kein `set -e`: ein fehlgeschlagener Lauf
# soll die Schleife fortsetzen, nicht den Container beenden.

INTERVAL_HOURS="${SYNC_INTERVAL_HOURS:-6}"

run_once() {
  start_ts=$(date +%s)
  echo "[sync] Start: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  node scripts/generate-data.js
  status=$?
  end_ts=$(date +%s)
  echo "[sync] Ende: $(date -u +"%Y-%m-%dT%H:%M:%SZ") (exit $status, $((end_ts - start_ts))s)"
  return $status
}

if [ "${SYNC_ONESHOT:-false}" = "true" ]; then
  run_once
  exit $?
fi

while true; do
  run_once
  if [ $? -ne 0 ]; then
    echo "[sync] Lauf fehlgeschlagen — naechster Versuch in ${INTERVAL_HOURS}h" >&2
  fi
  sleep $(( INTERVAL_HOURS * 3600 ))
done

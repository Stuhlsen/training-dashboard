#!/bin/sh
# Zeitsteuerung im Container statt System-Cron auf dem Host (Fahrplan 3,
# DKR2 Punkt 2) — Intervall ueber SYNC_INTERVAL_HOURS (Default 6h, wie
# bisher sync-data.yml). SYNC_ONESHOT=true fuer den manuellen Auslöser
# (docker compose run), bewusst kein `set -e`: ein fehlgeschlagener Lauf
# soll die Schleife fortsetzen, nicht den Container beenden.

INTERVAL_HOURS="${SYNC_INTERVAL_HOURS:-6}"

# Ungueltiger Wert (Tippfehler, Einheit wie "6h") wuerde sonst die
# Arithmetik-Expansion weiter unten mit einem Syntaxfehler abbrechen lassen —
# genau der Dauerbetrieb-Killer, den das fehlende "set -e" oben eigentlich
# verhindern soll.
case "$INTERVAL_HOURS" in
  ''|*[!0-9]*)
    echo "[sync] SYNC_INTERVAL_HOURS='$INTERVAL_HOURS' ist keine gueltige Ganzzahl — falle auf 6h zurueck" >&2
    INTERVAL_HOURS=6
    ;;
esac

# PID 1 ist diese Shell (kein "exec" moeglich, da danach noch geschlafen/
# geloopt wird) — ohne Trap wuerde SIGTERM (docker stop/compose down) hier
# folgenlos verpuffen, bis Docker nach der vollen Grace-Period hart mit
# SIGKILL nachhilft. Trap beendet den laufenden Kindprozess sofort.
CHILD_PID=""
terminate() {
  echo "[sync] Beende (Signal empfangen)" >&2
  [ -n "$CHILD_PID" ] && kill -TERM "$CHILD_PID" 2>/dev/null
  exit 143
}
trap terminate TERM INT

run_once() {
  start_ts=$(date +%s)
  echo "[sync] Start: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  node scripts/generate-data.js &
  CHILD_PID=$!
  wait "$CHILD_PID"
  status=$?
  CHILD_PID=""
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
  # "10#" erzwingt Dezimal-Interpretation — ohne das behandelt POSIX-
  # Arithmetik eine fuehrende Null als Oktalzahl: "08"/"09" waeren dann
  # ungueltige Oktalziffern (Syntaxfehler), "010" wuerde still zu 8 statt 10
  # Stunden werden. Empirisch geprueft (Alpine/BusyBox sh).
  sleep "$(( 10#$INTERVAL_HOURS * 3600 ))" &
  CHILD_PID=$!
  wait "$CHILD_PID"
  CHILD_PID=""
done

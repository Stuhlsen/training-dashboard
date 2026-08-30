#!/bin/sh
# Zeitsteuerung im Container statt System-Cron auf dem Host (Fahrplan 3,
# DKR2 Punkt 2) — Intervall ueber SYNC_INTERVAL_MINUTES oder
# SYNC_INTERVAL_HOURS (Minuten hat Vorrang, falls beide gesetzt sind;
# Default bleibt 6h wie bisher sync-data.yml). SYNC_ONESHOT=true fuer den
# manuellen Ausloeser (docker compose run), bewusst kein `set -e`: ein
# fehlgeschlagener Lauf soll die Schleife fortsetzen, nicht den Container
# beenden.

# SYNC_INTERVAL_MINUTES statt SYNC_INTERVAL_HOURS, wenn gesetzt - erlaubt
# Sub-Stunden-Intervalle. POSIX-Arithmetik in `$(( ))` kann keine
# Kommazahlen (SYNC_INTERVAL_HOURS=0.25 waere ein Syntaxfehler), ein
# eigener Minuten-Wert umgeht das sauberer als eine Nachkomma-Klammer um
# SYNC_INTERVAL_HOURS zu bauen.
if [ -n "${SYNC_INTERVAL_MINUTES:-}" ]; then
  INTERVAL_MINUTES="$SYNC_INTERVAL_MINUTES"
  case "$INTERVAL_MINUTES" in
    ''|*[!0-9]*)
      echo "[sync] SYNC_INTERVAL_MINUTES='$INTERVAL_MINUTES' ist keine gueltige Ganzzahl — falle auf 360min (6h) zurueck" >&2
      INTERVAL_MINUTES=360
      ;;
  esac
  # "10#": s. Kommentar bei der Sleep-Berechnung unten - gleicher Grund.
  INTERVAL_SECS=$(( 10#$INTERVAL_MINUTES * 60 ))
  INTERVAL_LABEL="${INTERVAL_MINUTES}min"
else
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
  INTERVAL_SECS=$(( 10#$INTERVAL_HOURS * 3600 ))
  INTERVAL_LABEL="${INTERVAL_HOURS}h"
fi

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
    echo "[sync] Lauf fehlgeschlagen — naechster Versuch in ${INTERVAL_LABEL}" >&2
  fi
  # INTERVAL_SECS ist oben schon fertig berechnet (inkl. "10#" gegen
  # fuehrende Nullen als Oktalzahl - "08"/"09" waeren sonst ungueltige
  # Oktalziffern, "010" wuerde still zu 8 statt 10 werden. Empirisch
  # geprueft, Alpine/BusyBox sh).
  sleep "$INTERVAL_SECS" &
  CHILD_PID=$!
  wait "$CHILD_PID"
  CHILD_PID=""
done

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

# Gibt $1 als positive Dezimal-Ganzzahl aus, sonst nichts (leer, nicht-
# numerisch oder numerisch 0 -> ungueltig). "10#" erzwingt Dezimal-
# Interpretation: sonst liest die Arithmetik eine fuehrende Null als
# Oktalzahl — "08"/"09" waeren ungueltige Oktalziffern (Syntaxfehler,
# der Dauerbetrieb-Killer, den das fehlende "set -e" verhindern soll),
# "010" wuerde still zu 8 statt 10. Empirisch geprueft (Alpine/BusyBox sh).
# Laeuft in $( ) — die Hilfsvariable _n leakt nicht in den Aufrufer.
clean_positive_int() {
  case "$1" in
    ''|*[!0-9]*) return 1 ;;
  esac
  _n=$(( 10#$1 ))
  [ "$_n" -ge 1 ] && echo "$_n"
}

# Minuten haben Vorrang. Ist SYNC_INTERVAL_MINUTES gesetzt, aber ungueltig
# (Tippfehler, Einheit wie "15m", oder 0 -> waere sleep 0, also Dauer-
# schleife), wird NICHT hart auf 6h gesprungen, sondern auf
# SYNC_INTERVAL_HOURS zurueckgefallen — ein bewusst gesetzter Stunden-Wert
# bleibt so erhalten.
INTERVAL_MINUTES=$(clean_positive_int "${SYNC_INTERVAL_MINUTES:-}")
if [ -n "$INTERVAL_MINUTES" ]; then
  INTERVAL_SECS=$(( INTERVAL_MINUTES * 60 ))
  INTERVAL_LABEL="${INTERVAL_MINUTES}min"
else
  if [ -n "${SYNC_INTERVAL_MINUTES:-}" ]; then
    echo "[sync] SYNC_INTERVAL_MINUTES='${SYNC_INTERVAL_MINUTES}' ist keine positive Ganzzahl — ignoriere, nutze SYNC_INTERVAL_HOURS" >&2
  fi
  INTERVAL_HOURS=$(clean_positive_int "${SYNC_INTERVAL_HOURS:-6}")
  if [ -z "$INTERVAL_HOURS" ]; then
    echo "[sync] SYNC_INTERVAL_HOURS='${SYNC_INTERVAL_HOURS:-}' ist keine positive Ganzzahl — falle auf 6h zurueck" >&2
    INTERVAL_HOURS=6
  fi
  INTERVAL_SECS=$(( INTERVAL_HOURS * 3600 ))
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
  # INTERVAL_SECS ist oben schon validiert + berechnet (>= 60, dezimal,
  # s. clean_positive_int).
  sleep "$INTERVAL_SECS" &
  CHILD_PID=$!
  wait "$CHILD_PID"
  CHILD_PID=""
done

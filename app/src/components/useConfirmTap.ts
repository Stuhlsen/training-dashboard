/* ============================================================
   COMPONENTS/USECONFIRMTAP.TS — Zwei-Tap-Konfirmation (E7b extrahiert)
   Für Timer-Reset: erster Tap zeigt Konfirmation, zweiter Tap
   innerhalb von CONFIRM_MS führt die Aktion aus.
   Verwendet von RunningTimersBar und dem Kochen-Dialog.

   Die Konstante CONFIRM_MS (3 Sekunden) lebt in EINER Datei.
   ============================================================ */

import { useCallback, useEffect, useRef, useState } from "react";

/** Timeout für die Zwei-Tap-Konfirmation (Eigenes Ermessen, Issue #27). */
export const CONFIRM_MS = 3000;

/**
 * Hook für eine zweistufige Bestätigung: erster Aufruf von trigger() zeigt
 * "bestätigen" an (pending = true), zweiter Aufruf innerhalb von CONFIRM_MS
 * ruft onConfirm() auf. Läuft die Frist ab, wird pending wieder false.
 *
 * @returns {{ pending: boolean, trigger: () => void }}
 *   pending — true zwischen erstem und zweitem Tap (zeige "Wirklich?")
 *   trigger — rufe bei jedem Tap auf
 */
export function useConfirmTap(
  onConfirm: () => void,
): { pending: boolean; trigger: () => void } {
  const [pending, setPending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Beim Unmount aufräumen
  useEffect(() => {
    return () => {
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const trigger = useCallback(() => {
    if (pending) {
      // Zweiter Klick innerhalb des Zeitfensters → ausführen
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setPending(false);
      onConfirm();
    } else {
      // Erster Klick → Konfirmation anzeigen
      setPending(true);
      timerRef.current = setTimeout(() => {
        setPending(false);
        timerRef.current = null;
      }, CONFIRM_MS);
    }
  }, [pending, onConfirm]);

  return { pending, trigger };
}
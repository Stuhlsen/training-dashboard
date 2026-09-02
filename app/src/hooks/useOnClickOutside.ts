import { useEffect, type RefObject } from "react";

/** Schließt ein Overlay bei einem `mousedown` außerhalb von `ref` — Gegenstück
 *  zu `useEscapeToClose`. Nur aktiv, solange `active` true ist (kein Listener
 *  am Dokument, wenn das Overlay zu ist).
 *
 *  Dasselbe Muster steckt unverändert auch in `WeekGridDetailRow.tsx`
 *  (Export-Menü) — dort bewusst nicht angefasst (committetes Feature,
 *  außerhalb dieser Änderung), kann später hierauf umgestellt werden.
 *
 *  `onClose` sollte stabil sein (`useCallback`), sonst re-abonniert der
 *  Effekt bei jedem Render. */
export function useOnClickOutside(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  active: boolean,
) {
  useEffect(() => {
    if (!active) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [ref, onClose, active]);
}

import { useEffect } from "react";

/** Schließt einen Dialog per Escape-Taste — gemeinsamer Baustein für die
 *  Inline-Overlay-Dialoge (`ExportPanel.tsx`/`ImportDialog.tsx`; dasselbe
 *  6-zeilige Muster steckt unverändert auch in `EventForm.tsx`/
 *  `PlanCardForm.tsx`, dort bewusst nicht angefasst — außerhalb dieser
 *  Etappe).
 *
 *  `active` (Default true — bestehende Aufrufer unverändert): bei dauerhaft
 *  gemounteten Auslösern (z. B. die Konto-Pille in der Kopfzeile) auf den
 *  Offen-Zustand setzen, damit nicht die ganze Session ein Dokument-Listener
 *  läuft — analog `useOnClickOutside`. */
export function useEscapeToClose(onClose: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  }, [onClose, active]);
}

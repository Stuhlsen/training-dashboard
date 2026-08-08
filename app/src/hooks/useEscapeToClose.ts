import { useEffect } from "react";

/** Schließt einen Dialog per Escape-Taste — gemeinsamer Baustein für die
 *  Inline-Overlay-Dialoge (`ExportPanel.tsx`/`ImportDialog.tsx`; dasselbe
 *  6-zeilige Muster steckt unverändert auch in `EventForm.tsx`/
 *  `PlanCardForm.tsx`, dort bewusst nicht angefasst — außerhalb dieser
 *  Etappe). */
export function useEscapeToClose(onClose: () => void) {
  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  }, [onClose]);
}

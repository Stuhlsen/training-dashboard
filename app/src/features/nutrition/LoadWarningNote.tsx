/* ============================================================
   FEATURES/NUTRITION/LOADWARNINGNOTE.TSX — ruhiger Hinweis
   „Defizit und hohe Last in derselben Woche“ (Fahrplan 43, E6, Idee N)

   Sachlich und schließbar, kein Popup, kein Countdown. Geschlossen wird je
   Woche (Montag als Schlüssel) im localStorage. Ohne localStorage bleibt
   „Schließen“ für die Sitzung wirksam.
   ============================================================ */

import { useMemo, useState } from "react";
import { GlassCard } from "../../components/GlassCard";
import { loadWarningStorageKey, type LoadWarning } from "./nutrition-goal-model";
import { TAP_BUTTON_STYLE, TEXT_STYLE } from "./nutrition-styles";

export function LoadWarningNote({ warning, userId }: { warning: LoadWarning; userId: string }) {
  const key = loadWarningStorageKey(userId, warning.weekKey);
  // localStorage beim Rendern lesen (kein Effekt + setState, Lint-Regel react-hooks/set-state-in-effect)
  const storedDismissed = useMemo(() => {
    try {
      return !!localStorage.getItem(key);
    } catch {
      return false;
    }
  }, [key]);
  const [sessionDismissed, setSessionDismissed] = useState(false);

  if (storedDismissed || sessionDismissed) return null;

  function dismiss() {
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* ignorieren — nur eine Bequemlichkeit */
    }
    setSessionDismissed(true);
  }

  return (
    <GlassCard style={{ padding: "16px 24px", marginBottom: 20 }}>
      <div role="note" aria-label="Hinweis zu Defizit und Trainingslast">
        <p style={TEXT_STYLE}>{warning.text}</p>
        <button type="button" style={TAP_BUTTON_STYLE} onClick={dismiss}>
          Schließen
        </button>
      </div>
    </GlassCard>
  );
}

/* ============================================================
   FEATURES/SETTINGS/CHECKINSECTION.TSX — Schalter „Morgen-Check-in"
   (Settings → Training). Rein lokal (localStorage), kein Backend — s.
   app/src/hooks/useCheckinEnabled.ts.
   ============================================================ */

import { useCheckinEnabled } from "../../hooks/useCheckinEnabled";
import { ToggleSwitch } from "./ToggleSwitch";
import { HEADING_STYLE, SECTION_STYLE } from "./section-styles";

export function CheckinSection() {
  const { enabled, setEnabled } = useCheckinEnabled();

  return (
    <div style={SECTION_STYLE}>
      <div style={HEADING_STYLE}>Morgen-Check-in</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: ".65rem", color: "var(--ink-3)", lineHeight: 1.5 }}>
          Täglich nach dem Befinden fragen (Energie, Muskelgefühl, Stimmung).
          Aus = kein Popup und keine „Befinden heute"-Kachel im Hero.
        </span>
        <ToggleSwitch
          on={enabled}
          onChange={() => setEnabled(!enabled)}
          label="Morgen-Check-in aktiv"
        />
      </div>
    </div>
  );
}

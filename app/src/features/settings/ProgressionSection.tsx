/* ============================================================
   FEATURES/SETTINGS/PROGRESSIONSECTION.TSX — Schalter „Stufenvorschlag
   (Auto-Progression)" (Athleten).

   Stand bis zur Settings-Neuordnung: ein Schalter in ProfileSection, obwohl
   er das Training betrifft. Jetzt ein eigener Abschnitt unter „Training".
   ============================================================ */

import { useSessionProfile } from "../../api/hooks/useSession";
import { useUpdateLadderProgressionEnabled } from "../../api/hooks/useProfile";
import { ToggleSwitch } from "./ToggleSwitch";
import { HEADING_STYLE, SECTION_DESC_STYLE, SECTION_STYLE } from "./section-styles";

export function ProgressionSection() {
  const profile = useSessionProfile();
  const { update: updateLadderProgression } = useUpdateLadderProgressionEnabled();

  if (!profile) return null;

  return (
    <div style={SECTION_STYLE}>
      <div style={HEADING_STYLE}>Stufenvorschlag</div>
      <p style={SECTION_DESC_STYLE}>Schlägt dir automatisch die nächste Stufe der Qualitätseinheiten vor.</p>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: ".65rem", color: "var(--ink-3)", lineHeight: 1.5 }}>
          Stufenvorschlag (Auto-Progression)
        </span>
        <ToggleSwitch
          on={profile.ladderProgressionEnabled}
          onChange={() => void updateLadderProgression(!profile.ladderProgressionEnabled)}
          label="Stufenvorschlag aktiv"
        />
      </div>
    </div>
  );
}

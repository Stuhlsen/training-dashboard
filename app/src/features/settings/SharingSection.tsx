/* ============================================================
   FEATURES/SETTINGS/SHARINGSECTION.TSX — Sichtbarkeit für Trainer und
   Besucher: „Befinden öffentlich" und „FTP öffentlich" (Athleten).

   Bis zur Settings-Neuordnung standen die Schalter unter „Profil"
   (ProfileSection). Sie gehören zu „Datenschutz & Freigaben": es geht um
   Zugriff, nicht um Stammdaten.
   ============================================================ */

import { useSessionProfile } from "../../api/hooks/useSession";
import { useUpdateWellbeingPublic, useUpdateFtpPublic } from "../../api/hooks/useProfile";
import { ToggleSwitch } from "./ToggleSwitch";
import { HEADING_STYLE, SECTION_DESC_STYLE, SECTION_STYLE } from "./section-styles";

const ROW_STYLE = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 } as const;
const LABEL_TEXT_STYLE = { fontFamily: "var(--font-mono)", fontSize: ".65rem", color: "var(--ink-3)" } as const;

export function SharingSection() {
  const profile = useSessionProfile();
  const { update: updateWellbeing } = useUpdateWellbeingPublic();
  const { update: updateFtpPublic } = useUpdateFtpPublic();

  if (!profile) return null;

  return (
    <div style={SECTION_STYLE}>
      <div style={HEADING_STYLE}>Sichtbarkeit</div>
      <p style={SECTION_DESC_STYLE}>
        Bestimmt, was Trainer und Besucher von dir sehen. Ist die FTP nicht öffentlich, entfallen auch
        Ramp-Tests und FTP-Ziel.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={ROW_STYLE}>
          <span style={LABEL_TEXT_STYLE}>Befinden öffentlich</span>
          <ToggleSwitch
            on={profile.wellbeingPublic}
            onChange={() => void updateWellbeing(!profile.wellbeingPublic)}
            label="Befinden öffentlich sichtbar"
          />
        </div>
        <div style={ROW_STYLE}>
          <span style={LABEL_TEXT_STYLE}>FTP öffentlich</span>
          <ToggleSwitch
            on={profile.ftpPublic}
            onChange={() => void updateFtpPublic(!profile.ftpPublic)}
            label="FTP öffentlich sichtbar"
          />
        </div>
      </div>
    </div>
  );
}

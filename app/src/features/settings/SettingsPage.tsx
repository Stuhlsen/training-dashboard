/* ============================================================
   FEATURES/SETTINGS/SETTINGSPAGE.TSX — Etappe 9

   Ersetzt den Etappe-1-Platzhalter. Port von ui/settings-panel.js, als
   Seite statt Slide-in-Panel (Konvention der übrigen Bereichs-Etappen:
   Events/Explorer/Planning sind ebenfalls eigene Routen, kein Overlay).

   Name + Passwort gelten für ALLE Rollen (C5.3). Befinden/Ziele/FTP-
   Historie/Formate/Datenquellen sind athletengated wie im Original —
   `profile.role === "athlete"` ist die React-Entsprechung von
   `isAthlete()`.
   ============================================================ */

import { useState } from "react";
import { GlassCard } from "../../components/GlassCard";
import { PageShell } from "../../components/PageShell";
import { useSessionProfile } from "../../api/hooks/useSession";
import { ProfileSection } from "./ProfileSection";
import { PasswordSection } from "./PasswordSection";
import { GoalsSection } from "./GoalsSection";
import { FtpHistorySection } from "./FtpHistorySection";
import { FormatsSection } from "./FormatsSection";
import { DataSourcesSection } from "./DataSourcesSection";
import { IntervalsSection } from "./IntervalsSection";
import { CheckinDialog } from "./CheckinDialog";

export function SettingsPage() {
  const profile = useSessionProfile();
  const [checkinOpen, setCheckinOpen] = useState(false);
  const isAthlete = profile?.role === "athlete";

  return (
    <PageShell>
    <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
      <h1 style={{ margin: 0, fontFamily: "var(--font-disp)", fontSize: "1.6rem", fontWeight: 600, color: "var(--ink)" }}>
        Settings
      </h1>

      <GlassCard variant="soft" style={{ padding: "0 22px" }}>
        {!profile && <p style={{ color: "var(--ink-3)", padding: "20px 0" }}>Lädt …</p>}
        {profile && (
          <>
            <ProfileSection onOpenCheckin={() => setCheckinOpen(true)} />
            <PasswordSection />
            {isAthlete && (
              <>
                <GoalsSection />
                <FtpHistorySection />
                <FormatsSection />
                <DataSourcesSection />
                <IntervalsSection />
              </>
            )}
          </>
        )}
      </GlassCard>

      {checkinOpen && <CheckinDialog onClose={() => setCheckinOpen(false)} />}
    </div>
    </PageShell>
  );
}

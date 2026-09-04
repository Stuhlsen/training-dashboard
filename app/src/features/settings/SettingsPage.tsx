/* ============================================================
   FEATURES/SETTINGS/SETTINGSPAGE.TSX — Etappe 9, Redesign (Sprung-
   Navigation, 6 Bereiche)

   Ersetzt die frühere flache Ein-Karte-Liste. Links eine fixierte
   Anker-Navigation (Scrollspy per scroll-Listener), rechts sechs
   GlassCard-Bereiche: Profil / Konto & Sicherheit / Benachrichtigungen /
   Training / Daten / Datenschutz & Account. Training/Daten bleiben
   athletengated wie zuvor — bei einem Coach werden Karte UND Nav-Link
   komplett weggelassen (nicht leer angezeigt), Scrollspy iteriert nur über
   tatsächlich gemountete Anker.
   ============================================================ */

import { useEffect, useRef, useState } from "react";
import { GlassCard } from "../../components/GlassCard";
import { PageShell } from "../../components/PageShell";
import { useSessionProfile } from "../../api/hooks/useSession";
import { ProfileSection } from "./ProfileSection";
import { PasswordSection } from "./PasswordSection";
import { TwoFactorSection } from "./TwoFactorSection";
import { SessionsSection } from "./SessionsSection";
import { NotificationsSection } from "./NotificationsSection";
import { GoalsSection } from "./GoalsSection";
import { CheckinSection } from "./CheckinSection";
import { FtpHistorySection } from "./FtpHistorySection";
import { FormatsSection } from "./FormatsSection";
import { FormatCatalogSection } from "./FormatCatalogSection";
import { DataSourcesSection } from "./DataSourcesSection";
import { IntervalsSection } from "./IntervalsSection";
import { SyncLocationSection } from "./SyncLocationSection";
import { UnitsSection } from "./UnitsSection";
import { CoachLinkSection } from "./CoachLinkSection";
import { DataExportSection } from "./DataExportSection";
import { AccountDeletionSection } from "./AccountDeletionSection";
import { CheckinDialog } from "./CheckinDialog";

interface NavEntry {
  id: string;
  label: string;
}

const CARD_STYLE = { padding: "28px 32px", scrollMarginTop: 24 };
const CARD_HEADING_STYLE = {
  margin: "0 0 22px",
  fontFamily: "var(--font-disp)",
  fontSize: "1.05rem",
  fontWeight: 600,
  color: "var(--ink)",
};

export function SettingsPage() {
  const profile = useSessionProfile();
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [activeId, setActiveId] = useState("sec-profil");
  const isAthlete = profile?.role === "athlete";
  const isAdmin = !!profile?.isAdmin;

  const navEntries: NavEntry[] = [
    { id: "sec-profil", label: "Profil" },
    { id: "sec-konto", label: "Konto & Sicherheit" },
    { id: "sec-benachrichtigungen", label: "Benachrichtigungen" },
    ...(isAthlete ? [{ id: "sec-training", label: "Training" }] : []),
    ...(isAthlete ? [{ id: "sec-daten", label: "Daten" }] : []),
    ...(isAdmin ? [{ id: "sec-katalog", label: "Formatkatalog" }] : []),
    { id: "sec-datenschutz", label: "Datenschutz & Account" },
  ];

  // Scrollspy: welcher Abschnitt ist gerade oben im Blick. Per
  // requestAnimationFrame gedrosselt statt ein State-Update pro Scroll-Tick.
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    function computeActive() {
      let current = navEntries[0]?.id ?? "sec-profil";
      for (const entry of navEntries) {
        const el = document.getElementById(entry.id);
        if (el && el.getBoundingClientRect().top - 100 <= 0) current = entry.id;
      }
      setActiveId(current);
    }
    function onScroll() {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        computeActive();
      });
    }
    computeActive();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- navEntries ändert sich nur mit isAthlete/isAdmin
  }, [isAthlete, isAdmin]);

  return (
    <PageShell>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 28 }}>
        <h1 style={{ margin: 0, fontFamily: "var(--font-disp)", fontSize: "1.6rem", fontWeight: 600, color: "var(--ink)" }}>
          Settings
        </h1>

        {!profile && (
          <GlassCard variant="soft" style={{ padding: "0 22px" }}>
            <p style={{ color: "var(--ink-3)", padding: "20px 0" }}>Lädt …</p>
          </GlassCard>
        )}

        {profile && (
          <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 32, alignItems: "start" }}>
            <nav
              style={{
                position: "sticky",
                top: 24,
                background: "var(--glass-2)",
                backdropFilter: "blur(var(--blur, 16px))",
                borderRadius: "var(--radius-lg)",
                boxShadow: "var(--e2)",
                padding: "16px 6px",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              {navEntries.map((entry) => {
                const active = entry.id === activeId;
                return (
                  <a
                    key={entry.id}
                    href={`#${entry.id}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "9px 14px",
                      borderLeft: `2px solid ${active ? "var(--ss)" : "transparent"}`,
                      fontFamily: "var(--font-body)",
                      fontSize: ".8rem",
                      fontWeight: active ? 600 : 500,
                      color: active ? "var(--ink)" : "var(--ink-3)",
                      textDecoration: "none",
                    }}
                  >
                    {entry.label}
                  </a>
                );
              })}
            </nav>

            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <GlassCard id="sec-profil" variant="soft" style={CARD_STYLE}>
                <h2 style={CARD_HEADING_STYLE}>Profil</h2>
                <ProfileSection onOpenCheckin={() => setCheckinOpen(true)} />
              </GlassCard>

              <GlassCard id="sec-konto" variant="soft" style={CARD_STYLE}>
                <h2 style={CARD_HEADING_STYLE}>Konto &amp; Sicherheit</h2>
                <PasswordSection />
                <TwoFactorSection />
                <SessionsSection />
              </GlassCard>

              <GlassCard id="sec-benachrichtigungen" variant="soft" style={CARD_STYLE}>
                <h2 style={CARD_HEADING_STYLE}>Benachrichtigungen</h2>
                <NotificationsSection />
              </GlassCard>

              {isAthlete && (
                <GlassCard id="sec-training" variant="soft" style={CARD_STYLE}>
                  <h2 style={CARD_HEADING_STYLE}>Training</h2>
                  <GoalsSection />
                  <CheckinSection />
                  <FtpHistorySection />
                  <FormatsSection />
                </GlassCard>
              )}

              {isAthlete && (
                <GlassCard id="sec-daten" variant="soft" style={CARD_STYLE}>
                  <h2 style={CARD_HEADING_STYLE}>Daten</h2>
                  <DataSourcesSection />
                  <IntervalsSection />
                  <SyncLocationSection />
                  <UnitsSection />
                  <CoachLinkSection />
                </GlassCard>
              )}

              {isAdmin && (
                <GlassCard id="sec-katalog" variant="soft" style={CARD_STYLE}>
                  <h2 style={CARD_HEADING_STYLE}>Formatkatalog</h2>
                  <FormatCatalogSection />
                </GlassCard>
              )}

              <GlassCard id="sec-datenschutz" variant="soft" style={CARD_STYLE}>
                <h2 style={CARD_HEADING_STYLE}>Datenschutz &amp; Account</h2>
                <DataExportSection />
                <AccountDeletionSection />
              </GlassCard>
            </div>
          </div>
        )}

        {checkinOpen && <CheckinDialog onClose={() => setCheckinOpen(false)} />}
      </div>
    </PageShell>
  );
}

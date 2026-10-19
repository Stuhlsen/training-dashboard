/* ============================================================
   FEATURES/SETTINGS/SETTINGSPAGE.TSX — Etappe 9, Redesign (Sprung-
   Navigation); Gruppen neu geordnet (Settings-Neuordnung)

   Links eine fixierte Anker-Navigation (Scrollspy per scroll-Listener),
   rechts je Gruppe eine GlassCard. Jede Gruppe beantwortet eine Frage:
     Profil                  Wer bin ich? (Name, Basisdaten)
     Training                Wie trainiere ich? (Sportarten, Ziele, FTP, Räder, Formate)
     Ernährung & Befinden    Was esse ich, wie geht es mir?
     Datenquellen            Woher kommen meine Daten? (Quellen, intervals.icu, Standort, Einheiten)
     Konto & Sicherheit      Zugang
     Benachrichtigungen      (noch ohne Funktion, bleibt als Platzhalter)
     Datenschutz & Freigaben Wer sieht was? (Sichtbarkeit, Trainer, Export, Löschen)
   Training/Ernährung/Daten sind athletengated — bei einem Coach werden Karte
   UND Nav-Link komplett weggelassen (nicht leer angezeigt), Scrollspy
   iteriert nur über tatsächlich gemountete Anker.
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
import { TrainingTargetsSection } from "./TrainingTargetsSection";
import { ProfileBasicsSection } from "./ProfileBasicsSection";
import { SportsSection } from "./SportsSection";
import { BikesSection } from "./BikesSection";
import { CheckinSection } from "./CheckinSection";
import { FtpHistorySection } from "./FtpHistorySection";
import { FormatsSection } from "./FormatsSection";
import { FormatCatalogSection } from "./FormatCatalogSection";
import { InviteAthleteSection } from "./InviteAthleteSection";
import { AdminUsersTable } from "./AdminUsersTable";
import { FeedbackSection } from "./FeedbackSection";
import { DataSourcesSection } from "./DataSourcesSection";
import { IntervalsSection } from "./IntervalsSection";
import { SyncLocationSection } from "./SyncLocationSection";
import { UnitsSection } from "./UnitsSection";
import { CoachLinkSection } from "./CoachLinkSection";
import { DataExportSection } from "./DataExportSection";
import { AccountDeletionSection } from "./AccountDeletionSection";
import { CheckinDialog } from "./CheckinDialog";
import { NutritionSection } from "./NutritionSection";
import { SharingSection } from "./SharingSection";
import { ProgressionSection } from "./ProgressionSection";

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
    ...(isAthlete ? [{ id: "sec-training", label: "Training" }] : []),
    ...(isAthlete ? [{ id: "sec-ernaehrung", label: "Ernährung & Befinden" }] : []),
    ...(isAthlete ? [{ id: "sec-daten", label: "Datenquellen" }] : []),
    { id: "sec-konto", label: "Konto & Sicherheit" },
    { id: "sec-benachrichtigungen", label: "Benachrichtigungen" },
    { id: "sec-datenschutz", label: "Datenschutz & Freigaben" },
    ...(isAdmin ? [{ id: "sec-katalog", label: "Formatkatalog" }] : []),
    ...(isAdmin ? [{ id: "sec-einladen", label: "Nutzer" }] : []),
    { id: "sec-feedback", label: "Feedback" },
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
          <div className="settings-grid">
            <nav className="settings-nav">
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
                <ProfileSection />
                {isAthlete && <ProfileBasicsSection />}
              </GlassCard>

              {isAthlete && (
                <GlassCard id="sec-training" variant="soft" style={CARD_STYLE}>
                  <h2 style={CARD_HEADING_STYLE}>Training</h2>
                  <SportsSection />
                  <GoalsSection />
                  <TrainingTargetsSection />
                  <ProgressionSection />
                  <FtpHistorySection />
                  <BikesSection />
                  <FormatsSection />
                </GlassCard>
              )}

              {isAthlete && (
                <GlassCard id="sec-ernaehrung" variant="soft" style={CARD_STYLE}>
                  <h2 style={CARD_HEADING_STYLE}>Ernährung &amp; Befinden</h2>
                  <NutritionSection />
                  <CheckinSection onOpenCheckin={() => setCheckinOpen(true)} />
                </GlassCard>
              )}

              {isAthlete && (
                <GlassCard id="sec-daten" variant="soft" style={CARD_STYLE}>
                  <h2 style={CARD_HEADING_STYLE}>Datenquellen</h2>
                  <DataSourcesSection />
                  <IntervalsSection />
                  <SyncLocationSection />
                  <UnitsSection />
                </GlassCard>
              )}

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

              <GlassCard id="sec-datenschutz" variant="soft" style={CARD_STYLE}>
                <h2 style={CARD_HEADING_STYLE}>Datenschutz &amp; Freigaben</h2>
                {isAthlete && <SharingSection />}
                {isAthlete && <CoachLinkSection />}
                <DataExportSection />
                <AccountDeletionSection />
              </GlassCard>

              {isAdmin && (
                <GlassCard id="sec-katalog" variant="soft" style={CARD_STYLE}>
                  <h2 style={CARD_HEADING_STYLE}>Formatkatalog</h2>
                  <FormatCatalogSection />
                </GlassCard>
              )}

              {isAdmin && (
                <GlassCard id="sec-einladen" variant="soft" style={CARD_STYLE}>
                  <h2 style={CARD_HEADING_STYLE}>Nutzerverwaltung</h2>
                  <AdminUsersTable />
                  <InviteAthleteSection />
                </GlassCard>
              )}

              <GlassCard id="sec-feedback" variant="soft" style={CARD_STYLE}>
                <h2 style={CARD_HEADING_STYLE}>Feedback</h2>
                <FeedbackSection />
              </GlassCard>
            </div>
          </div>
        )}

        {checkinOpen && <CheckinDialog onClose={() => setCheckinOpen(false)} />}
      </div>
    </PageShell>
  );
}

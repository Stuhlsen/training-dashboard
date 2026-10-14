/* ============================================================
   FEATURES/NUTRITION/NUTRITIONPAGE.TSX — Ernährungs-Tab, Rahmen
   (Fahrplan 23, E6 PR A; Entscheidungen E28, E29, E30, E35)

   Nur-eigene-Daten (E28): Geschlecht und Intoleranzen sind owner-only,
   deshalb zeigt der Tab nur beim eigenen Profil Inhalt. Wochenansicht,
   Vorschläge und Ampel folgen in PR B.

   Zustände: Karte "Profil ergänzen" (fehlende Angaben) ODER das
   Tagesziel mit Boden, Formelname, Körperfett-Datum und Hinweisen.
   ============================================================ */

import { useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { PageShell } from "../../components/PageShell";
import { GlassCard } from "../../components/GlassCard";
import { useActiveAthlete } from "../../api/hooks/useActiveAthlete";
import { useIsSelfAthlete } from "../../api/hooks/useWriteAuthorization";
import { useAuthUserId } from "../../api/hooks/useSession";
import { useProfileBasics } from "../../api/hooks/useProfile";
import { SOURCE_BY_KEY } from "../../core/nutrition-sources.js";
import { fmtDateFull, localISODate } from "../../core/format.js";
import { useNutritionDay } from "./useNutritionDay";
import type { NutritionDay } from "./nutrition-day-model";
import { WeekView } from "./WeekView";
import { SourceList } from "./SourceList";

const CARD_STYLE: CSSProperties = { padding: "28px 32px", marginBottom: 20 };
const HEADING_STYLE: CSSProperties = {
  margin: "0 0 16px",
  fontFamily: "var(--font-disp)",
  fontSize: "1.2rem",
  fontWeight: 600,
  color: "var(--ink)",
};
const TEXT_STYLE: CSSProperties = { margin: "0 0 10px", color: "var(--ink-2)", fontSize: ".92rem", lineHeight: 1.5 };
const META_STYLE: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: ".75rem",
  color: "var(--ink-3)",
  margin: "0 0 6px",
};
const LINK_STYLE: CSSProperties = { color: "var(--accent)", fontWeight: 600 };
const BUTTON_STYLE: CSSProperties = {
  padding: "8px 18px",
  borderRadius: 999,
  border: "1px solid var(--hair)",
  background: "transparent",
  color: "var(--ink)",
  fontFamily: "var(--font-disp)",
  fontWeight: 600,
  fontSize: ".85rem",
  cursor: "pointer",
};

const FORMULA_NAMES: Record<string, string> = {
  "cunningham-1980": "Cunningham (1980)",
  "ten-haaf-2014": "Ten Haaf (2014)",
};

const hintStorageKey = (userId: string) => `nutrition-profile-hint-dismissed:${userId}`;

/* ── Einstieg + Guard ─────────────────────────────────────── */

export function NutritionPage() {
  const { activeAthleteId } = useActiveAthlete();
  const userId = useAuthUserId();
  const { isSelf, isLoading } = useIsSelfAthlete(activeAthleteId);

  let content;
  if (!userId) {
    content = (
      <GlassCard style={CARD_STYLE}>
        <h2 style={HEADING_STYLE}>Ernährung</h2>
        <p style={TEXT_STYLE}>
          Melde dich an, um dein Tagesziel zu sehen. <Link to="/app/login" style={LINK_STYLE}>Zur Anmeldung</Link>
        </p>
      </GlassCard>
    );
  } else if (isLoading) {
    content = <p style={META_STYLE}>Lade …</p>;
  } else if (!isSelf) {
    // E28: fremde Ernährungsdaten (Geschlecht, Intoleranzen) sind owner-only
    content = (
      <GlassCard style={CARD_STYLE}>
        <h2 style={HEADING_STYLE}>Ernährung</h2>
        <p style={TEXT_STYLE}>Ernährung ist nur in deinem eigenen Profil sichtbar</p>
      </GlassCard>
    );
  } else {
    content = <NutritionDayView athleteId={activeAthleteId} userId={userId} />;
  }

  return <PageShell>{content}</PageShell>;
}

/* ── Inhalt (nur eigener Athlet) ──────────────────────────── */

function NutritionDayView({ athleteId, userId }: { athleteId: string; userId: string }) {
  const today = localISODate();
  const { data: basics } = useProfileBasics();
  const { day, isLoading } = useNutritionDay(athleteId, today);

  // localStorage direkt beim Rendern lesen (kein Effekt + setState — Lint-Regel
  // react-hooks/set-state-in-effect), Muster wie PlanningPage.tsx. Der Wert
  // ändert sich nur mit dem Nutzer und beim Wegklicken (Session-State unten).
  const hintStoredDismissed = useMemo(() => {
    try {
      return !!localStorage.getItem(hintStorageKey(userId));
    } catch {
      return false; // localStorage nicht verfügbar — Hinweis bleibt sichtbar
    }
  }, [userId]);
  const [hintSessionDismissed, setHintSessionDismissed] = useState(false);

  function dismissHint() {
    try {
      localStorage.setItem(hintStorageKey(userId), "1");
    } catch {
      /* ignorieren — nur eine Bequemlichkeit */
    }
    setHintSessionDismissed(true);
  }

  if (isLoading) return <p style={META_STYLE}>Lade …</p>;
  // Laden beendet, aber keine Daten (Profil-Abfrage fehlgeschlagen) — nicht ewig "Lade …" zeigen
  if (!day || !basics) {
    return (
      <GlassCard style={CARD_STYLE}>
        <h2 style={HEADING_STYLE}>Ernährung</h2>
        <p style={TEXT_STYLE}>Deine Daten konnten nicht geladen werden. Bitte lade die Seite neu.</p>
      </GlassCard>
    );
  }

  // Bestandsathleten ohne Größe, Geschlecht oder Gewicht (E30)
  const profileIncomplete =
    basics.heightCm == null || basics.sex == null || (!day.ok && day.missing.includes("Gewicht"));
  const showHint = profileIncomplete && !hintStoredDismissed && !hintSessionDismissed;

  return (
    <>
      {showHint && (
        <GlassCard style={{ ...CARD_STYLE, padding: "20px 28px" }}>
          <p style={TEXT_STYLE}>
            Neu: Ernährung. Für dein Tagesziel brauchen wir Größe, Geschlecht und Gewicht. Du kannst sie in den{" "}
            <Link to="/app/settings" style={LINK_STYLE}>Einstellungen</Link> eintragen.
          </p>
          <button type="button" style={BUTTON_STYLE} onClick={dismissHint}>
            Verstanden
          </button>
        </GlassCard>
      )}
      {day.ok ? (
        <>
          <DayTargetCard day={day} />
          <WeekView athleteId={athleteId} userId={userId} todayISO={today} />
        </>
      ) : (
        <ProfileCompleteCard day={day} />
      )}
    </>
  );
}

/* ── Karte "Profil ergänzen" ──────────────────────────────── */

function ProfileCompleteCard({ day }: { day: Extract<NutritionDay, { ok: false }> }) {
  return (
    <GlassCard style={CARD_STYLE}>
      <h2 style={HEADING_STYLE}>Profil ergänzen</h2>
      {day.missing.length > 0 ? (
        <>
          <p style={TEXT_STYLE}>Für dein Tagesziel fehlen noch Angaben:</p>
          <ul style={{ ...TEXT_STYLE, paddingLeft: 20 }}>
            {day.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </>
      ) : (
        <p style={TEXT_STYLE}>{day.hint ?? "Dein Tagesziel lässt sich mit den vorhandenen Angaben nicht berechnen."}</p>
      )}
      <p style={TEXT_STYLE}>
        <Link to="/app/settings" style={LINK_STYLE}>Zu den Einstellungen</Link>
      </p>
    </GlassCard>
  );
}

/* ── Karte Tagesziel ──────────────────────────────────────── */

function DayTargetCard({ day }: { day: Extract<NutritionDay, { ok: true }> }) {
  const sources = day.sourceKeys
    .map((key) => SOURCE_BY_KEY.get(key))
    .filter((s): s is NonNullable<typeof s> => !!s);

  return (
    <GlassCard variant="strong" style={CARD_STYLE}>
      <h2 style={HEADING_STYLE}>Tagesziel</h2>
      <p style={{ margin: "0 0 4px", fontFamily: "var(--font-disp)", fontSize: "2.4rem", fontWeight: 600, color: "var(--ink)" }}>
        {day.target} kcal
      </p>
      <p style={TEXT_STYLE}>
        Mindestzufuhr: {day.floor} kcal{day.capped ? " — das Ziel wurde auf diesen Wert angehoben" : ""}
      </p>
      {day.trainingKcal > 0 && <p style={TEXT_STYLE}>Training heute: +{day.trainingKcal} kcal</p>}
      {day.trainingUnknown && (
        <p style={TEXT_STYLE}>
          Heute ist eine Einheit geplant, ihre Energie lässt sich ohne FTP oder Intensitätsangabe nicht berechnen. Das
          Ziel gilt wie an einem Ruhetag.
        </p>
      )}

      <p style={META_STYLE}>
        Grundumsatz nach {FORMULA_NAMES[day.formula] ?? day.formula}, in einer Studie von 2023 an Sportlern geprüft
      </p>
      {day.bodyFatDate && <p style={META_STYLE}>Körperfett gemessen am {fmtDateFull(day.bodyFatDate)}</p>}

      {day.hints.map((h) => (
        <p key={h} style={TEXT_STYLE}>{h}</p>
      ))}
      {day.sexAssumed && (
        <p style={TEXT_STYLE}>
          Ohne Geschlechtsangabe rechnen wir mit einem Mittelwert. Eine Körperfett-Messung macht die Schätzung
          unabhängig davon.
        </p>
      )}

      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: "pointer", color: "var(--ink-3)", fontSize: ".85rem" }}>ⓘ Quelle</summary>
        <SourceList sources={sources} />
      </details>
    </GlassCard>
  );
}

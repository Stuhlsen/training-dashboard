/* ============================================================
   FEATURES/NUTRITION/NUTRITIONPAGE.TSX — Ernährungs-Tab, Rahmen
   (Fahrplan 23, E6 PR A; Entscheidungen E28, E29, E30, E35)

   Nur-eigene-Daten (E28): Geschlecht und Intoleranzen sind owner-only,
   deshalb zeigt der Tab nur beim eigenen Profil Inhalt. Darunter der
   Umschalter Woche | Einkaufsliste | Rezepte (E8, R2) — alle Ansichten sitzen hinter
   demselben Guard.

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
import { effectiveSex } from "../../core/profile-sex.js";
import { localISODate } from "../../core/format.js";
import { useNutritionDay } from "./useNutritionDay";
import type { NutritionDay } from "./nutrition-day-model";
import { DayTargetCard } from "./DayTargetCard";
import { WeekView } from "./WeekView";
import { ShoppingListView } from "./ShoppingListView";
import { RecipesView } from "./RecipesView";

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

const hintStorageKey = (userId: string) => `nutrition-profile-hint-dismissed:${userId}`;

type NutritionView = "week" | "shopping" | "recipes";

const VIEW_LABELS: Record<NutritionView, string> = { week: "Woche", shopping: "Einkaufsliste", recipes: "Rezepte" };

/* Umschalter Woche | Einkaufsliste | Rezepte. Sitzt direkt über dem Seitenhintergrund,
   deshalb Glass-Fill statt reiner Haarlinie (DESIGN.md, Ghost-Regel). */
function ViewSwitch({ view, onChange }: { view: NutritionView; onChange: (v: NutritionView) => void }) {
  return (
    <div role="group" aria-label="Ansicht" style={{ display: "flex", gap: 8, margin: "0 0 16px" }}>
      {(Object.keys(VIEW_LABELS) as NutritionView[]).map((v) => {
        const active = v === view;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(v)}
            style={{
              padding: "8px 18px",
              borderRadius: 999,
              border: active ? "1px solid var(--accent)" : "1px solid rgba(255,255,255,0.14)",
              background: active ? "var(--accent)" : "var(--glass)",
              backdropFilter: active ? undefined : "blur(16px)",
              boxShadow: active ? undefined : "var(--e2)",
              color: active ? "#17110a" : "var(--ink)",
              fontFamily: "var(--font-disp)",
              fontWeight: 600,
              fontSize: ".85rem",
              cursor: "pointer",
            }}
          >
            {VIEW_LABELS[v]}
          </button>
        );
      })}
    </div>
  );
}

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
  const [view, setView] = useState<NutritionView>("week");

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
    basics.heightCm == null ||
    effectiveSex(basics.gender, basics.sex) == null ||
    (!day.ok && day.missing.includes("Gewicht"));
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
          <ViewSwitch view={view} onChange={setView} />
          {view === "week" ? (
            // die Tagesziel-Karte sitzt im Kopf der Tagesbühne (WeekView)
            <WeekView athleteId={athleteId} userId={userId} todayISO={today} />
          ) : view === "recipes" ? (
            <RecipesView todayISO={today} />
          ) : (
            <>
              <DayTargetCard day={day} />
              <ShoppingListView userId={userId} todayISO={today} onShowWeek={() => setView("week")} />
            </>
          )}
        </>
      ) : (
        <ProfileCompleteCard day={day} />
      )}
      <DisclaimerNote />
    </>
  );
}

/* ── Haftungshinweis (E10) ────────────────────────────────────
   Steht unter allen Ansichten des Tabs (Woche, Einkaufsliste, auch
   "Profil ergänzen"). Muster: Bikefit-Hinweis. */

function DisclaimerNote() {
  return (
    <div
      role="note"
      style={{
        padding: "12px 18px",
        borderRadius: "var(--radius)",
        background: "rgba(224, 138, 60, 0.08)",
        border: "1px solid rgba(224, 138, 60, 0.25)",
        fontSize: ".8rem",
        color: "var(--ink-2)",
        lineHeight: 1.5,
      }}
    >
      <strong>Wichtiger Hinweis:</strong> Tagesziel und Vorschläge sind eine Orientierung und ersetzen keine
      Ernährungsberatung.
    </div>
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

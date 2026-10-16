import { Link } from "react-router-dom";
import { useMemo } from "react";
import { GlassCard } from "../../components/GlassCard";
import { useMealPlan } from "../../api/hooks/useMealPlan";
import { useRecipes } from "../../api/hooks/useRecipes";
import { useRides } from "../../api/hooks/useRides";
import { localISODate } from "../../core/format.js";
import { SOURCE_BY_KEY } from "../../core/nutrition-sources.js";
import { AmpelBadge } from "../nutrition/DayCard";
import { SourceList } from "../nutrition/SourceList";
import { useNutritionDay } from "../nutrition/useNutritionDay";
import { buildHeroNutrition } from "../nutrition/nutrition-hero-model";
import type { NutritionWellnessDay } from "../nutrition/nutrition-day-model";
import { InfoIcon } from "../../components/InfoIcon";

const AMPEL_COLOR = { green: "var(--ok)", yellow: "var(--warn)", red: "var(--danger)" } as const;
const NEUTRAL_COLOR = "var(--ink-3)";
const EMPTY_WELLNESS: readonly NutritionWellnessDay[] = [];

const LABEL_STYLE = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--fs-label)",
  color: "var(--ink-3)",
  textTransform: "uppercase",
  letterSpacing: ".14em",
  marginBottom: 8,
  fontWeight: 500,
} as const;

const META_STYLE = { fontFamily: "var(--font-mono)", fontSize: ".75rem", color: "var(--ink-3)", margin: "4px 0 0" } as const;
const LINK_STYLE = { color: "var(--accent)", fontSize: ".8rem", textDecoration: "none" } as const;

/** Hero-Kachel "Ernährung heute" (Fahrplan 23, E9). Nur für den eigenen
 *  Athleten registriert (HeroPage.tsx) — fremde Ernährungsdaten sind
 *  owner-only (E28). Der Link zum Tab ist bewusst ein sichtbarer Link und
 *  keine klickbare Gesamtfläche: die Kacheln sind im Edit-Modus per Drag
 *  verschiebbar, ein Klick-Handler auf der Fläche würde dort navigieren. */
export function NutritionCard({ athleteId }: { athleteId: string }) {
  const todayISO = localISODate();
  const { day, isLoading } = useNutritionDay(athleteId, todayISO);
  const plan = useMealPlan(todayISO, todayISO);
  const { recipes } = useRecipes();
  const rides = useRides(athleteId);

  const recipesById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const wellness = (rides.data?.wellness as NutritionWellnessDay[] | undefined) ?? EMPTY_WELLNESS;

  const view = useMemo(
    () => (day ? buildHeroNutrition({ day, todayISO, entries: plan.entries, recipesById, wellness }) : null),
    [day, todayISO, plan.entries, recipesById, wellness],
  );

  const accent = view?.kind === "target" && view.planned ? AMPEL_COLOR[view.planned.ampel] : NEUTRAL_COLOR;

  return (
    <GlassCard variant="soft" style={{ position: "relative", padding: "14px 16px 14px 19px", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 12, bottom: 12, width: 3, borderRadius: 3, background: accent }} />
      <div style={LABEL_STYLE}>Ernährung heute</div>

      {(isLoading || !view) && <p style={META_STYLE}>Lädt …</p>}

      {view?.kind === "missing" && (
        <>
          <p style={{ ...META_STYLE, margin: "0 0 6px" }}>Für dein Tagesziel fehlt: {view.missing.join(", ")}</p>
          <Link to="/app/settings" style={LINK_STYLE}>In den Einstellungen ergänzen →</Link>
        </>
      )}

      {view?.kind === "target" && (
        <>
          <div
            style={{
              fontFamily: "var(--font-disp)",
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "var(--ink)",
              letterSpacing: "-.02em",
              lineHeight: 1.1,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {view.target} kcal
          </div>
          <p style={META_STYLE}>Tagesziel</p>
          {view.planned && (
            <p style={{ ...META_STYLE, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span>geplant {view.planned.kcal} kcal</span>
              <AmpelBadge ampel={view.planned.ampel} />
            </p>
          )}
          {view.consumed != null && <p style={META_STYLE}>gegessen {view.consumed} kcal</p>}
          <details style={{ marginTop: 8 }}>
            <summary style={{ cursor: "pointer", color: "var(--ink-3)", fontSize: ".8rem" }}><InfoIcon style={{ marginRight: "0.35em" }} />Quelle</summary>
            <SourceList
              sources={view.sourceKeys.map((k) => SOURCE_BY_KEY.get(k)).filter((s): s is NonNullable<typeof s> => !!s)}
            />
          </details>
          <div style={{ marginTop: 8 }}>
            <Link to="/app/nutrition" style={LINK_STYLE}>Zur Ernährung →</Link>
          </div>
        </>
      )}
    </GlassCard>
  );
}

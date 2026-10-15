/* ============================================================
   FEATURES/NUTRITION/WEEKVIEW.TSX — Wochenansicht (L1)
   (Fahrplan 23, E6 PR B; Entscheidungen E5, E12, E31, E32)

   Tagesbühne für den gewählten Tag (Fahrplan 25, R1). Hier liegen die
   Schreibvorgänge: "Tag zusammenstellen" (Upsert je Slot), Tauschen
   (Upsert) und Entfernen (Delete) — gespeichert wird nur Rezept +
   Portion je Slot. Fehler aus den Hooks werden je Tag sichtbar
   angezeigt, nie still verschluckt.

   Banner (E12): wegklickbar, localStorage direkt beim Rendern gelesen
   (kein useEffect + setState — Lint-Regel react-hooks/set-state-in-effect),
   Schlüssel je Nutzer, Hinweisart und Datum.
   ============================================================ */

import { useMemo, useState, type CSSProperties } from "react";
import { GlassCard } from "../../components/GlassCard";
import { useDeleteMealPlanEntry, useUpsertMealPlanEntry } from "../../api/hooks/useMealPlan";
import type { MealSlot, Result } from "../../api/types";
import { DayCard } from "./DayCard";
import { DayStage } from "./DayStage";
import { WeekStrip } from "./WeekStrip";
import type { Choice } from "./useDayPlan";
import type { NutritionDay } from "./nutrition-day-model";
import { useNutritionWeek } from "./useNutritionWeek";
import { SLOT_ORDER, buildWeekStrip, type Banner } from "./nutrition-week-model";
import { BUTTON_STYLE, META_STYLE, TAP_BUTTON_STYLE, TEXT_STYLE } from "./nutrition-styles";

/* Liegt direkt über dem Seitenhintergrund: Glas-Fill (DESIGN.md, Ghost-Regel) */
const WEEK_TOGGLE_STYLE: CSSProperties = {
  ...TAP_BUTTON_STYLE,
  border: "1px solid rgba(255, 255, 255, 0.14)",
  background: "var(--glass)",
  backdropFilter: "blur(16px)",
  boxShadow: "var(--e2)",
};

const bannerStorageKey = (userId: string, key: string, todayISO: string) =>
  `nutrition-banner-dismissed:${userId}:${key}:${todayISO}`;

function DismissibleBanner({ storageKey, banner }: { storageKey: string; banner: Banner }) {
  const storedDismissed = useMemo(() => {
    try {
      return !!localStorage.getItem(storageKey);
    } catch {
      return false; // localStorage nicht verfügbar — Banner bleibt sichtbar
    }
  }, [storageKey]);
  const [sessionDismissed, setSessionDismissed] = useState(false);

  if (storedDismissed || sessionDismissed) return null;

  function dismiss() {
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      /* ignorieren — nur eine Bequemlichkeit */
    }
    setSessionDismissed(true);
  }

  return (
    <GlassCard style={{ padding: "16px 24px", marginBottom: 12 }}>
      <p style={TEXT_STYLE}>{banner.text}</p>
      <button type="button" style={BUTTON_STYLE} onClick={dismiss}>
        Schließen
      </button>
    </GlassCard>
  );
}

export function WeekView({ athleteId, userId, todayISO }: { athleteId: string; userId: string; todayISO: string }) {
  const week = useNutritionWeek(athleteId, todayISO);
  const { upsert } = useUpsertMealPlanEntry();
  const { remove } = useDeleteMealPlanEntry();
  // Mehrere Tage können gleichzeitig schreiben — je Tag gesperrt, nicht global
  const [busyDates, setBusyDates] = useState<ReadonlySet<string>>(() => new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedISO, setSelectedISO] = useState(todayISO);
  const [expanded, setExpanded] = useState(false);

  const setBusy = (dateISO: string, busy: boolean) =>
    setBusyDates((prev) => {
      const next = new Set(prev);
      if (busy) next.add(dateISO);
      else next.delete(dateISO);
      return next;
    });

  /** Führt Schreibvorgänge eines Tages aus und zeigt den ersten Fehler sichtbar an. */
  async function run(dateISO: string, jobs: Array<() => Promise<Result>>) {
    setBusy(dateISO, true);
    const results = await Promise.all(jobs.map((job) => job()));
    const failed = results.find((r) => !r.ok);
    setErrors((prev) => ({
      ...prev,
      [dateISO]: failed && !failed.ok ? `Speichern fehlgeschlagen: ${failed.error.message}` : "",
    }));
    setBusy(dateISO, false);
  }

  const save = (dateISO: string, mealSlot: MealSlot, choice: Choice) => () =>
    upsert({ date: dateISO, mealSlot, recipeId: choice.recipeId, servings: choice.servings });

  function handleCompose(dateISO: string, choices: Partial<Record<MealSlot, Choice | null>>) {
    const jobs = SLOT_ORDER.flatMap((slot) => {
      const choice = choices[slot];
      return choice ? [save(dateISO, slot, choice)] : [];
    });
    void run(dateISO, jobs);
  }

  function handleChoose(dateISO: string, slot: MealSlot, choice: Choice) {
    void run(dateISO, [save(dateISO, slot, choice)]);
  }

  function handleRemove(dateISO: string, entryId: string) {
    void run(dateISO, [() => remove(entryId)]);
  }

  if (week.isLoading) return <p style={META_STYLE}>Lade …</p>;

  // Bühne: der gewählte Tag (Standard heute); fällt weg, wenn er nicht mehr in der Woche liegt
  const stageISO = week.dates.includes(selectedISO) ? selectedISO : todayISO;
  const stageDay = week.days[week.dates.indexOf(stageISO)];
  const strip = buildWeekStrip({
    dates: week.dates,
    todayISO,
    days: week.days,
    entries: week.entries,
    recipesById: week.recipesById,
  });

  // Beide Darstellungen schreiben über dieselben Rückrufe (handleCompose/Choose/Remove)
  const dayProps = (dateISO: string, day: Extract<NutritionDay, { ok: true }>) => ({
    dateISO,
    isToday: dateISO === todayISO,
    day,
    entries: week.entries,
    recipes: week.recipes,
    recipesById: week.recipesById,
    intolerances: week.intolerances as string[],
    busy: busyDates.has(dateISO),
    error: errors[dateISO] || null,
    onCompose: handleCompose,
    onChoose: handleChoose,
    onRemove: handleRemove,
  });

  return (
    <section aria-label="Woche">
      {week.banners.map((banner) => (
        <DismissibleBanner
          key={banner.key}
          storageKey={bannerStorageKey(userId, banner.key, todayISO)}
          banner={banner}
        />
      ))}

      <WeekStrip
        days={strip}
        selectedISO={stageISO}
        onSelect={(dateISO) => {
          // ein Tipp auf einen Tag bringt immer dessen Bühne nach vorn
          setSelectedISO(dateISO);
          setExpanded(false);
        }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", margin: "-4px 0 12px" }}>
        <button
          type="button"
          aria-expanded={expanded}
          style={WEEK_TOGGLE_STYLE}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Woche zuklappen" : "Woche aufklappen"}
        </button>
      </div>

      {expanded
        ? week.days.map((day, i) => {
            if (!day.ok) return null;
            const dateISO = week.dates[i];
            return <DayCard key={dateISO} {...dayProps(dateISO, day)} />;
          })
        : stageDay?.ok && <DayStage key={stageISO} {...dayProps(stageISO, stageDay)} />}
    </section>
  );
}

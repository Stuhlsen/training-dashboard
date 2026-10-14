/* ============================================================
   FEATURES/NUTRITION/SHOPPINGLISTVIEW.TSX — Einkaufsliste
   (Fahrplan 23, E8; Entscheidung E28 gilt über NutritionPage)

   Zeitraum = die 7 Tage der Wochenansicht. Je Tag ein Häkchen "in die
   Liste" (Standard: alle Tage mit Einträgen). Die Mengen rechnet
   core/shopping-list.js; hier nur Anzeige und der Abgehakt-Zustand.

   Abgehakt-Zustand: nur lokal (localStorage), je Nutzer und Zeile. Beim
   ersten Rendern gelesen (lazy useState, kein useEffect + setState —
   Lint-Regel react-hooks/set-state-in-effect). Beim Speichern bleiben
   nur Schlüssel, die in der aktuellen Liste vorkommen.
   ============================================================ */

import { useMemo, useState } from "react";
import { GlassCard } from "../../components/GlassCard";
import { useMealPlan } from "../../api/hooks/useMealPlan";
import { useRecipes } from "../../api/hooks/useRecipes";
import { fmtDate } from "../../core/format.js";
import { aggregateShoppingList, formatShoppingAmount } from "../../core/shopping-list.js";
import { weekDates } from "./nutrition-week-model";
import { BUTTON_STYLE, HEADING_STYLE, META_STYLE, TEXT_STYLE } from "./nutrition-styles";

const checkedStorageKey = (userId: string) => `shopping-checked:${userId}`;

function readChecked(userId: string): ReadonlySet<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(checkedStorageKey(userId)) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : []);
  } catch {
    return new Set(); // localStorage nicht verfügbar oder Inhalt kaputt — alles ungehakt
  }
}

function writeChecked(userId: string, keys: ReadonlySet<string>) {
  try {
    localStorage.setItem(checkedStorageKey(userId), JSON.stringify([...keys]));
  } catch {
    /* ignorieren — nur eine Bequemlichkeit */
  }
}

const ROW_STYLE = {
  display: "flex",
  alignItems: "baseline",
  gap: 10,
  padding: "6px 0",
  cursor: "pointer",
  color: "var(--ink)",
  fontSize: ".92rem",
} as const;

const CHECKBOX_STYLE = { accentColor: "var(--accent)", flexShrink: 0 } as const;

const amountText = (amounts: ReadonlyArray<{ unit: string; amount: number }>) =>
  amounts.map((a) => `${formatShoppingAmount(a.amount)} ${a.unit}`.trim()).join(" + ");

export function ShoppingListView({
  userId,
  todayISO,
  onShowWeek,
}: {
  userId: string;
  todayISO: string;
  onShowWeek: () => void;
}) {
  const dates = useMemo(() => weekDates(todayISO), [todayISO]);
  const { entries, isLoading: planLoading } = useMealPlan(dates[0], dates[dates.length - 1]);
  const { recipes, isLoading: recipesLoading } = useRecipes();

  // Tage, die der Nutzer aus der Liste genommen hat (Standard: keiner)
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(() => new Set());
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => readChecked(userId));

  const datesWithEntries = useMemo(() => new Set(entries.map((e) => e.date)), [entries]);
  const excludedDates = useMemo(
    () => dates.filter((d) => !datesWithEntries.has(d) || excluded.has(d)),
    [dates, datesWithEntries, excluded],
  );
  const list = useMemo(
    () => aggregateShoppingList({ entries, recipes, excludedDates }),
    [entries, recipes, excludedDates],
  );
  const allRowKeys = useMemo(() => new Set(list.groups.flatMap((g) => g.rows.map((r) => r.key))), [list]);

  function toggleDay(dateISO: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(dateISO)) next.delete(dateISO);
      else next.add(dateISO);
      return next;
    });
  }

  function toggleRow(rowKey: string) {
    const next = new Set(checked);
    if (next.has(rowKey)) next.delete(rowKey);
    else next.add(rowKey);
    // Aufräumen: nur Schlüssel behalten, die in der aktuellen Liste vorkommen
    const kept = new Set([...next].filter((k) => allRowKeys.has(k)));
    setChecked(kept);
    writeChecked(userId, kept);
  }

  if (planLoading || recipesLoading) return <p style={META_STYLE}>Lade …</p>;

  if (datesWithEntries.size === 0) {
    return (
      <GlassCard style={{ padding: "24px 28px", marginBottom: 16 }}>
        <h2 style={HEADING_STYLE}>Einkaufsliste</h2>
        <p style={TEXT_STYLE}>Für diese Woche ist noch nichts geplant. Stelle zuerst deine Mahlzeiten zusammen.</p>
        <button type="button" style={BUTTON_STYLE} onClick={onShowWeek}>
          Zur Woche
        </button>
      </GlassCard>
    );
  }

  const hasRows = list.groups.length > 0;

  return (
    <section aria-label="Einkaufsliste">
      <GlassCard style={{ padding: "20px 24px", marginBottom: 16 }}>
        <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
          <legend style={{ ...META_STYLE, padding: 0, marginBottom: 8 }}>Tage in der Liste</legend>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px" }}>
            {dates.map((dateISO) => {
              const has = datesWithEntries.has(dateISO);
              return (
                <label
                  key={dateISO}
                  style={{ display: "flex", alignItems: "center", gap: 6, color: has ? "var(--ink)" : "var(--ink-3)", fontSize: ".88rem" }}
                  title={has ? undefined : "Kein Eintrag an diesem Tag"}
                >
                  <input
                    type="checkbox"
                    style={CHECKBOX_STYLE}
                    checked={has && !excluded.has(dateISO)}
                    disabled={!has}
                    onChange={() => toggleDay(dateISO)}
                  />
                  {fmtDate(dateISO)}
                  {dateISO === todayISO ? " · Heute" : ""}
                </label>
              );
            })}
          </div>
        </fieldset>
      </GlassCard>

      {!hasRows && list.missingIngredients.length === 0 && (
        <GlassCard style={{ padding: "20px 24px", marginBottom: 16 }}>
          <p style={{ ...TEXT_STYLE, margin: 0 }}>Wähle mindestens einen Tag aus, um die Liste zu füllen.</p>
        </GlassCard>
      )}

      {list.groups.map((group) => {
        const rows = group.rows.map((row) => (
          <label key={row.key} style={ROW_STYLE} title={row.rezepte.join(", ")}>
            <input
              type="checkbox"
              style={CHECKBOX_STYLE}
              checked={checked.has(row.key)}
              onChange={() => toggleRow(row.key)}
            />
            <span
              style={{
                flex: 1,
                textDecoration: checked.has(row.key) ? "line-through" : "none",
                color: checked.has(row.key) ? "var(--ink-3)" : "var(--ink)",
              }}
            >
              {row.name}
            </span>
            <span style={{ ...META_STYLE, margin: 0 }}>{amountText(row.amounts)}</span>
          </label>
        ));

        return (
          <GlassCard key={group.category} style={{ padding: "16px 24px", marginBottom: 12 }}>
            {group.isPantry ? (
              // Vorrat standardmäßig eingeklappt: Öl, Salz und Gewürze hat man meist da
              <details>
                <summary style={{ cursor: "pointer", ...HEADING_STYLE, margin: 0 }}>
                  Vorrat prüfen <span style={META_STYLE}>({group.rows.length})</span>
                </summary>
                <div style={{ marginTop: 8 }}>{rows}</div>
              </details>
            ) : (
              <>
                <h3 style={{ ...HEADING_STYLE, fontSize: "1rem", margin: "0 0 4px" }}>{group.category || "Sonstiges"}</h3>
                {rows}
              </>
            )}
          </GlassCard>
        );
      })}

      {list.missingIngredients.length > 0 && (
        <p style={META_STYLE}>Zutaten fehlen bei {list.missingIngredients.join(", ")}</p>
      )}
    </section>
  );
}

/* ============================================================
   FEATURES/NUTRITION/SHOPPINGLISTVIEW.TSX — Einkaufsliste
   (Fahrplan 23, E8; Neugestaltung Fahrplan 25, R3; Entscheidung E28
   gilt über NutritionPage)

   Zeitraum = die 7 Tage der Wochenansicht. Je Tag ein Schalter "in die
   Liste" (Standard: alle Tage mit Einträgen). Die Mengen rechnet
   core/shopping-list.js, den Abhak-Fortschritt checkProgress; hier nur
   Anzeige und der Abgehakt-Zustand.

   Abgehakt-Zustand: nur lokal (localStorage), je Nutzer und Zeile. Beim
   ersten Rendern gelesen (lazy useState, kein useEffect + setState —
   Lint-Regel react-hooks/set-state-in-effect). Beim Speichern bleiben
   nur Schlüssel, die in der aktuellen Liste vorkommen.

   Farbe = Bedeutung: Akzent nur für den Fortschritt und die eine
   Primäraktion (leere Woche: "Zur Woche"); "erledigt" = --ok.
   Tippziele ≥ 44 px (TAP_MIN).
   ============================================================ */

import { useMemo, useState, type CSSProperties } from "react";
import { GlassCard } from "../../components/GlassCard";
import { PlateIcon } from "../../components/RecipeImage";
import { useMealPlan } from "../../api/hooks/useMealPlan";
import { useRecipes } from "../../api/hooks/useRecipes";
import { fmtDate } from "../../core/format.js";
import { aggregateShoppingList, checkProgress, formatShoppingAmount } from "../../core/shopping-list.js";
import { weekDates } from "./nutrition-week-model";
import "./nutrition.css";
import {
  HEADING_STYLE,
  META_STYLE,
  PRIMARY_BUTTON_STYLE,
  TAP_BUTTON_STYLE,
  TAP_MIN,
  TEXT_STYLE,
} from "./nutrition-styles";

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

const CARD_STYLE: CSSProperties = { padding: "20px 24px", marginBottom: 16 };

const EMPTY_CARD_STYLE: CSSProperties = {
  ...CARD_STYLE,
  padding: "32px 24px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  gap: 4,
};

const PROGRESS_TRACK_STYLE: CSSProperties = {
  height: 8,
  borderRadius: 999,
  background: "var(--hair)",
  overflow: "hidden",
};

/* Tage-Schalter: sieben gleich breite Pillen in einer Reihe (auch auf 390 px).
   Das echte Kontrollkästchen bleibt für Tastatur und Screenreader erhalten,
   liegt aber unsichtbar über der Pille. */
const DAY_GRID_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
  gap: 4,
};

const DAY_BASE_STYLE: CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  minHeight: TAP_MIN,
  padding: "4px 2px",
  borderRadius: 14,
  fontFamily: "var(--font-mono)",
  fontSize: ".75rem",
  lineHeight: 1.25,
  cursor: "pointer",
};

const DAY_INPUT_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  margin: 0,
  opacity: 0,
  cursor: "inherit",
};

function dayStyle(has: boolean, selected: boolean): CSSProperties {
  if (!has) {
    return { ...DAY_BASE_STYLE, border: "1px dashed var(--hair)", color: "var(--ink-3)", cursor: "not-allowed" };
  }
  return selected
    ? { ...DAY_BASE_STYLE, border: "1px solid var(--accent)", background: "var(--glass-2)", color: "var(--ink)", fontWeight: 600 }
    : { ...DAY_BASE_STYLE, border: "1px solid var(--hair)", background: "transparent", color: "var(--ink-2)" };
}

const ROW_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  minHeight: TAP_MIN + 4,
  padding: "6px 0",
  borderTop: "1px solid var(--hair)",
  cursor: "pointer",
  fontSize: "1rem",
};

const CHECKBOX_STYLE: CSSProperties = { accentColor: "var(--accent)", flexShrink: 0, width: 24, height: 24, margin: 0 };

const GROUP_HEAD_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 12,
  margin: "0 0 6px",
};

const amountText = (amounts: ReadonlyArray<{ unit: string; amount: number }>) =>
  amounts.map((a) => `${formatShoppingAmount(a.amount)} ${a.unit}`.trim()).join(" + ");

const progressText = (done: number, total: number) => `${done} von ${total}`;

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
  const progress = useMemo(() => checkProgress(list.groups, checked), [list, checked]);

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

  function resetChecked() {
    const none: ReadonlySet<string> = new Set();
    setChecked(none);
    writeChecked(userId, none);
  }

  if (planLoading || recipesLoading) return <p style={META_STYLE}>Lade …</p>;

  if (datesWithEntries.size === 0) {
    return (
      <GlassCard style={EMPTY_CARD_STYLE}>
        <PlateIcon size={40} />
        <h2 style={{ ...HEADING_STYLE, margin: "8px 0 4px" }}>Einkaufsliste</h2>
        <p style={{ ...TEXT_STYLE, maxWidth: 420 }}>
          Für diese Woche ist noch nichts geplant. Stelle zuerst deine Mahlzeiten zusammen.
        </p>
        <button type="button" style={{ ...PRIMARY_BUTTON_STYLE, marginTop: 8 }} onClick={onShowWeek}>
          Zur Woche
        </button>
      </GlassCard>
    );
  }

  const hasRows = list.groups.length > 0;
  const hasProgress = progress.total > 0;
  const allDone = hasProgress && progress.done === progress.total;

  return (
    <section aria-label="Einkaufsliste">
      <GlassCard style={CARD_STYLE}>
        <div style={{ ...GROUP_HEAD_STYLE, margin: "0 0 10px" }}>
          <h2 style={{ ...HEADING_STYLE, margin: 0 }}>Einkaufsliste</h2>
          {hasProgress && (
            <span
              data-testid="shopping-progress"
              style={{ fontFamily: "var(--font-mono)", fontSize: ".85rem", color: allDone ? "var(--ok)" : "var(--ink-2)" }}
            >
              {allDone
                ? `Alles abgehakt · ${progressText(progress.done, progress.total)}`
                : progressText(progress.done, progress.total)}
            </span>
          )}
        </div>
        {hasProgress && (
          <div
            role="progressbar"
            aria-label="Eingekauft"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
            style={{ ...PROGRESS_TRACK_STYLE, marginBottom: 16 }}
          >
            <div
              style={{
                height: "100%",
                width: `${(progress.done / progress.total) * 100}%`,
                background: allDone ? "var(--ok)" : "var(--accent)",
                borderRadius: 999,
                transition: "width 160ms ease-out",
              }}
            />
          </div>
        )}

        <fieldset style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
          <legend style={{ ...META_STYLE, padding: 0, marginBottom: 8 }}>Tage in der Liste</legend>
          <div style={DAY_GRID_STYLE}>
            {dates.map((dateISO) => {
              const has = datesWithEntries.has(dateISO);
              const selected = has && !excluded.has(dateISO);
              return (
                <label key={dateISO} className="nut-day" style={dayStyle(has, selected)} title={has ? undefined : "Kein Eintrag an diesem Tag"}>
                  <input
                    type="checkbox"
                    style={DAY_INPUT_STYLE}
                    checked={selected}
                    disabled={!has}
                    onChange={() => toggleDay(dateISO)}
                  />
                  <span>{fmtDate(dateISO)}</span>
                  {dateISO === todayISO && <span style={{ fontSize: ".62rem", color: "var(--ink-3)" }}>Heute</span>}
                </label>
              );
            })}
          </div>
        </fieldset>

        {checked.size > 0 && (
          <button type="button" style={{ ...TAP_BUTTON_STYLE, marginTop: 14 }} onClick={resetChecked}>
            Haken zurücksetzen
          </button>
        )}
      </GlassCard>

      {!hasRows && list.missingIngredients.length === 0 && (
        <GlassCard style={EMPTY_CARD_STYLE}>
          <p style={{ ...TEXT_STYLE, margin: 0 }}>Wähle mindestens einen Tag aus, um die Liste zu füllen.</p>
          <button type="button" style={{ ...TAP_BUTTON_STYLE, marginTop: 8 }} onClick={() => setExcluded(new Set())}>
            Alle Tage wählen
          </button>
        </GlassCard>
      )}

      {list.groups.map((group) => {
        const rows = group.rows.map((row) => {
          const isChecked = checked.has(row.key);
          return (
            <label key={row.key} style={ROW_STYLE} title={row.rezepte.join(", ")}>
              <input type="checkbox" style={CHECKBOX_STYLE} checked={isChecked} onChange={() => toggleRow(row.key)} />
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflowWrap: "anywhere",
                  textDecoration: isChecked ? "line-through" : "none",
                  color: isChecked ? "var(--ink-3)" : "var(--ink)",
                }}
              >
                {row.name}
              </span>
              <span style={{ ...META_STYLE, margin: 0, textAlign: "right", opacity: isChecked ? 0.6 : 1 }}>
                {amountText(row.amounts)}
              </span>
            </label>
          );
        });

        const groupProgress = checkProgress([group], checked);

        return (
          <GlassCard key={group.category} style={{ padding: "16px 24px 8px", marginBottom: 12 }}>
            {group.isPantry ? (
              // Vorrat standardmäßig eingeklappt: Öl, Salz und Gewürze hat man meist da
              <details>
                <summary
                  style={{ cursor: "pointer", minHeight: TAP_MIN, display: "flex", alignItems: "center", ...HEADING_STYLE, margin: 0 }}
                >
                  Vorrat prüfen <span style={{ ...META_STYLE, margin: "0 0 0 8px" }}>({group.rows.length})</span>
                </summary>
                <div>{rows}</div>
              </details>
            ) : (
              <>
                <div style={GROUP_HEAD_STYLE}>
                  <h3 style={{ ...HEADING_STYLE, fontSize: "1rem", margin: 0 }}>{group.category || "Sonstiges"}</h3>
                  <span
                    style={{
                      ...META_STYLE,
                      margin: 0,
                      color: groupProgress.done === groupProgress.total ? "var(--ok)" : "var(--ink-3)",
                    }}
                  >
                    {progressText(groupProgress.done, groupProgress.total)}
                  </span>
                </div>
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

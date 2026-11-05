/* ============================================================
   FEATURES/PLANNING/FIXEDDAYSEDITOR.TSX — „Feste Tage" bearbeiten

   Geteilt von „Neuer Plan" und „Plan anpassen". Nur Rad: FIXED_DAY_TYPES
   kennt nur das Rad-Vokabular. Die Logik der Auswahl liegt in
   new-plan-dialog-view-model.ts (`applyFixedDayPick`).
   ============================================================ */

import { FIELD_STYLE, HINT_STYLE, LABEL_STYLE, PILL_STYLE } from "./new-plan-dialog-styles";
import {
  applyFixedDayPick,
  FIXED_DAY_OPTIONS,
  FIXED_DAY_TYPES,
  FIXED_DURATION_MAX_MIN,
  FIXED_DURATION_MIN_MIN,
  FIXED_INTERVAL_TYP,
  fixedDayPickerValue,
  WEEKDAY_LABELS,
  type FixedDay,
  type GroupRideEstimates,
} from "./new-plan-dialog-view-model";

interface FixedDaysEditorProps {
  fixedDays: FixedDay[];
  trainingWeekdays: number[];
  estimates: GroupRideEstimates;
  onChange: (next: FixedDay[]) => void;
}

export function FixedDaysEditor({ fixedDays, trainingWeekdays, estimates, onChange }: FixedDaysEditorProps) {
  function update(index: number, next: Partial<FixedDay>) {
    onChange(fixedDays.map((f, i) => (i === index ? { ...f, ...next } : f)));
  }

  function pick(index: number, value: string) {
    onChange(fixedDays.map((f, i) => (i === index ? applyFixedDayPick(f, value, estimates) : f)));
  }

  function add() {
    const freeWeekday = trainingWeekdays.find((iso) => !fixedDays.some((f) => f.weekday === iso));
    if (freeWeekday == null) return;
    onChange([...fixedDays, { weekday: freeWeekday, typ: FIXED_DAY_TYPES[0], keepInRecoveryWeek: false }]);
  }

  const hasGroupRide = fixedDays.some((f) => f.typ === "Gruppenfahrt");

  return (
    <div style={LABEL_STYLE}>
      Feste Tage (optional)
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {fixedDays.map((fd, i) => (
          <div key={fd.weekday} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <select
              aria-label="Wochentag"
              style={{ ...FIELD_STYLE, width: "auto" }}
              value={fd.weekday}
              onChange={(e) => update(i, { weekday: Number(e.target.value) })}
            >
              {trainingWeekdays
                .filter((iso) => iso === fd.weekday || !fixedDays.some((f) => f.weekday === iso))
                .map((iso) => (
                  <option key={iso} value={iso}>
                    {WEEKDAY_LABELS.find((w) => w.iso === iso)?.short}
                  </option>
                ))}
            </select>
            <select
              aria-label="Art der Einheit"
              style={{ ...FIELD_STYLE, width: "auto", flex: 1, minWidth: 120 }}
              value={fixedDayPickerValue(fd.typ, fd.environment)}
              onChange={(e) => pick(i, e.target.value)}
            >
              {FIXED_DAY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {/* Dauer nur für feste Karten — ein Intervalltag bekommt seine
                Dauer aus Phase und Zeitbudget. Leer = Generator wählt. */}
            {fd.typ !== FIXED_INTERVAL_TYP && (
              <input
                type="number"
                inputMode="numeric"
                min={FIXED_DURATION_MIN_MIN}
                max={FIXED_DURATION_MAX_MIN}
                step={1}
                placeholder="Dauer (min)"
                aria-label="Dauer in Minuten (optional)"
                style={{ ...FIELD_STYLE, width: 110 }}
                value={fd.durationMin ?? ""}
                onChange={(e) =>
                  update(i, { durationMin: e.target.value === "" ? undefined : Number(e.target.value) })
                }
              />
            )}
            {/* Intervalltage entfallen in Erholungswochen immer (keine
                Qualitätstage dort) — die Checkbox hätte keine Wirkung. */}
            {fd.typ !== FIXED_INTERVAL_TYP && (
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: ".76rem",
                  color: "var(--ink-3)",
                }}
              >
                <input
                  type="checkbox"
                  checked={fd.keepInRecoveryWeek}
                  onChange={(e) => update(i, { keepInRecoveryWeek: e.target.checked })}
                />
                auch in Erholungswochen
              </label>
            )}
            <button
              type="button"
              style={PILL_STYLE}
              onClick={() => onChange(fixedDays.filter((_, n) => n !== i))}
              aria-label="Festen Tag entfernen"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          style={PILL_STYLE}
          onClick={add}
          disabled={fixedDays.length >= trainingWeekdays.length}
        >
          + Fester Tag
        </button>
        {hasGroupRide && (
          <p style={HINT_STYLE}>
            Die Dauer ist der Schnitt deiner letzten Gruppenfahrten, ohne genug Fahrten ein Startwert. Du kannst
            sie jederzeit ändern.
          </p>
        )}
      </div>
    </div>
  );
}

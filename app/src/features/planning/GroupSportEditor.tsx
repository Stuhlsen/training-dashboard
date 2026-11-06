/* ============================================================
   FEATURES/PLANNING/GROUPSPORTEDITOR.TSX — eine Sportart in „Plan anpassen"
   für verknüpfte Pläne (Fahrplan 44 E6)

   Häkchen „anpassen" (abgewählt = bleibt unverändert, seine Tage gelten in
   der Verteilung trotzdem als belegt), Trainingstage, Stunden je Woche. Nur
   Rad: feste Tage und Ziel-FTP. Die Sportart steht mit Symbol und Name da,
   die Farbe trägt die Bedeutung nie allein. Reine Darstellung — Zustand und
   Zahlen kommen aus useGroupRecomputeFlow.
   ============================================================ */

import { sportBadge } from "../../core/activity-sport.js";
import type { ActiveSport } from "../../api/hooks/useActiveSport";
import { FixedDaysEditor } from "./FixedDaysEditor";
import { MULTI_SPORT_LABEL } from "./multi-sport-plan-view-model";
import { FIELD_STYLE, LABEL_STYLE, PILL_STYLE, PRIMARY_BTN_STYLE as PICKED_PILL_STYLE } from "./new-plan-dialog-styles";
import { WEEKDAY_LABELS, type FixedDay, type GroupRideEstimates } from "./new-plan-dialog-view-model";
import { WeeklyHoursField } from "./WeeklyHoursField";

interface GroupSportEditorProps {
  sport: ActiveSport;
  selected: boolean;
  /** Die einzige gewählte Sportart bleibt gewählt — das Häkchen ist dann gesperrt. */
  lockSelected: boolean;
  disabled: boolean;
  weekdays: number[];
  hours: number;
  fixedDays: FixedDay[];
  ftpTarget: number | null;
  currentFtp: number | null;
  estimates: GroupRideEstimates;
  onToggleSelected: () => void;
  onToggleDay: (iso: number) => void;
  onHours: (hours: number) => void;
  onFixedDays: (next: FixedDay[]) => void;
  onFtpTarget: (watt: number | null) => void;
}

export function GroupSportEditor(props: GroupSportEditorProps) {
  const { sport, selected, weekdays } = props;
  const badge = sportBadge(sport);
  const label = MULTI_SPORT_LABEL[sport];

  return (
    <section
      aria-label={`${label} anpassen`}
      data-sport={sport}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "10px 12px",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--hair)",
        borderLeft: `3px solid ${badge.colorVar}`,
      }}
    >
      <label style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink)", fontWeight: 600 }}>
        <input
          type="checkbox"
          checked={selected}
          disabled={props.disabled || (selected && props.lockSelected)}
          onChange={props.onToggleSelected}
        />
        <span>
          <span aria-hidden="true">{badge.icon}</span> {label} anpassen
        </span>
      </label>

      {!selected && (
        <div style={{ fontSize: ".76rem", color: "var(--ink-3)" }}>
          {label} bleibt unverändert. Seine Tage gelten in der Verteilung weiter als belegt.
        </div>
      )}

      {selected && (
        <>
          <div style={{ fontSize: ".78rem", color: "var(--ink-3)" }}>Trainingstage</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {WEEKDAY_LABELS.map((d) => {
              const on = weekdays.includes(d.iso);
              return (
                <button
                  key={d.iso}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${label} ${d.short}`}
                  disabled={props.disabled}
                  style={on ? { ...PILL_STYLE, ...PICKED_PILL_STYLE, padding: "6px 12px" } : PILL_STYLE}
                  onClick={() => props.onToggleDay(d.iso)}
                >
                  {d.short}
                </button>
              );
            })}
          </div>

          <WeeklyHoursField hours={props.hours} disabled={props.disabled} onHours={props.onHours} />

          {sport === "ride" && (
            <>
              <FixedDaysEditor
                fixedDays={props.fixedDays.filter((d) => weekdays.includes(d.weekday))}
                trainingWeekdays={weekdays}
                estimates={props.estimates}
                onChange={props.onFixedDays}
              />
              <label style={LABEL_STYLE}>
                Ziel-FTP für diesen Plan (W)
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  disabled={props.disabled}
                  style={{ ...FIELD_STYLE, maxWidth: 200 }}
                  value={props.ftpTarget ?? ""}
                  onChange={(e) => {
                    const watt = Number(e.target.value);
                    props.onFtpTarget(watt > 0 ? watt : null);
                  }}
                />
                {props.currentFtp != null && <span>Gerechnet mit deiner aktuellen FTP von {props.currentFtp} W.</span>}
              </label>
            </>
          )}
        </>
      )}
    </section>
  );
}

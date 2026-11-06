/* ============================================================
   FEATURES/PLANNING/MULTISPORTEXTRAS.TSX — die weiteren Sportarten im „Neuer
   Plan"-Dialog (Fahrplan 44 E4).

   Die erste Sportart steht im normalen Dialog-Formular. Hier folgt je weiterer
   Sportart ein Abschnitt mit dem, was sich unterscheidet: Stunden (M2), Tage,
   Level und — bei Laufen/Schwimmen — die Schwellenpace. Darunter die Hinweise
   der Verteilung (sperren nichts, M4), Eingabefehler und die gemeinsame
   Vorschau. Zustand und Aktionen liefert `useMultiSportPlan`.
   ============================================================ */

import { sportBadge } from "../../core/activity-sport.js";
import type { ActiveSport } from "../../api/hooks/useActiveSport";
import { FIELD_STYLE, LABEL_STYLE, PILL_STYLE, PRIMARY_BTN_STYLE } from "./new-plan-dialog-styles";
import { MULTI_SPORT_LABEL, type SportDraft } from "./multi-sport-plan-view-model";
import { WEEKDAY_LABELS, type PlanLevel } from "./new-plan-dialog-view-model";
import { MultiSportPreview } from "./MultiSportPreview";
import type { useMultiSportPlan } from "./useMultiSportPlan";

export type MultiSportController = ReturnType<typeof useMultiSportPlan>;

interface SectionProps {
  sport: ActiveSport;
  draft: SportDraft;
  /** Kurzer Hinweis, wenn die Stunden aus einem Ziel vorgeschlagen sind. */
  hoursNote: string | null;
  onChange: (next: Partial<SportDraft>) => void;
}

const numberOrNull = (v: string): number | null => (v ? Number(v) : null);

function ExtraSportSection({ sport, draft, hoursNote, onChange }: SectionProps) {
  const badge = sportBadge(sport);
  const label = MULTI_SPORT_LABEL[sport];

  function toggleDay(iso: number) {
    const next = draft.weekdays.includes(iso)
      ? draft.weekdays.filter((d) => d !== iso)
      : [...draft.weekdays, iso].sort((a, b) => a - b);
    onChange({ weekdays: next });
  }

  return (
    <section
      role="group"
      aria-label={`${label}-Plan`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: "12px 14px",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--hair)",
        borderLeft: `3px solid ${badge.colorVar}`,
        background: "rgba(255,255,255,.03)",
      }}
    >
      <strong style={{ fontSize: ".86rem", color: "var(--ink)" }}>
        <span aria-hidden="true">{badge.icon}</span> {label}
      </strong>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label style={LABEL_STYLE}>
          Zeitbudget (h/Woche)
          <input
            type="number"
            min={1}
            max={25}
            step={0.5}
            style={FIELD_STYLE}
            value={draft.hours}
            onChange={(e) => onChange({ hours: Number(e.target.value) || 0 })}
          />
          {hoursNote && <span style={{ fontSize: ".72rem", color: "var(--ink-2)" }}>{hoursNote}</span>}
        </label>
        <label style={LABEL_STYLE}>
          Erfahrungslevel
          <select
            style={FIELD_STYLE}
            value={draft.level}
            onChange={(e) => onChange({ level: e.target.value as PlanLevel })}
          >
            <option value="einsteiger">Einsteiger</option>
            <option value="fortgeschritten">Fortgeschritten</option>
          </select>
        </label>
      </div>

      <div style={LABEL_STYLE}>
        Trainingstage
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {WEEKDAY_LABELS.map((d) => {
            const on = draft.weekdays.includes(d.iso);
            return (
              <button
                key={d.iso}
                type="button"
                aria-pressed={on}
                style={on ? { ...PILL_STYLE, ...PRIMARY_BTN_STYLE, padding: "6px 12px" } : PILL_STYLE}
                onClick={() => toggleDay(d.iso)}
              >
                {d.short}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label style={LABEL_STYLE}>
          Aktuelle Schwellenpace (km/h)
          <input
            type="number"
            min={1}
            max={30}
            step={0.1}
            style={FIELD_STYLE}
            value={draft.currentThresholdSpeed ?? ""}
            onChange={(e) => onChange({ currentThresholdSpeed: numberOrNull(e.target.value) })}
          />
        </label>
        <label style={LABEL_STYLE}>
          Schwellenpace-Ziel (km/h, optional)
          <input
            type="number"
            min={1}
            max={30}
            step={0.1}
            style={FIELD_STYLE}
            value={draft.thresholdSpeedTarget ?? ""}
            onChange={(e) => onChange({ thresholdSpeedTarget: numberOrNull(e.target.value) })}
          />
        </label>
      </div>
    </section>
  );
}

const ERROR_BOX: React.CSSProperties = {
  margin: 0,
  padding: "8px 12px 8px 26px",
  borderRadius: "var(--radius-sm)",
  background: "rgba(217,79,79,.10)",
  border: "1px solid rgba(217,79,79,.35)",
  color: "var(--danger)",
  fontSize: ".78rem",
};

export function MultiSportExtras({ ctl }: { ctl: MultiSportController }) {
  const errorList = Object.values(ctl.errors);
  return (
    <>
      {ctl.extras.map((sport) => (
        <ExtraSportSection
          key={sport}
          sport={sport}
          draft={ctl.drafts[sport]}
          hoursNote={ctl.hoursNote(sport)}
          onChange={(next) => ctl.setDraft(sport, next)}
        />
      ))}

      {ctl.hints.length > 0 && (
        <div
          role="status"
          aria-label="Hinweise zur Verteilung"
          style={{
            padding: "10px 14px",
            borderRadius: "var(--radius-sm)",
            background: "rgba(224,138,60,.10)",
            border: "1px solid rgba(224,138,60,.35)",
            color: "var(--ink-2)",
            fontSize: ".78rem",
            lineHeight: 1.45,
          }}
        >
          <strong style={{ color: "var(--ink)" }}>Hinweise zur Verteilung</strong> — sie sperren
          nichts, du entscheidest.
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {ctl.hints.map((h, i) => (
              <li key={`${h.code}-${i}`}>{h.text}</li>
            ))}
          </ul>
        </div>
      )}

      {(errorList.length > 0 || ctl.saveError) && (
        <div role="alert">
          <ul style={ERROR_BOX}>
            {errorList.map((msg, i) => (
              <li key={i}>{msg}</li>
            ))}
            {ctl.saveError && <li>{ctl.saveError}</li>}
          </ul>
        </div>
      )}

      {ctl.bundle && <MultiSportPreview bundle={ctl.bundle} notes={ctl.notes} />}
    </>
  );
}

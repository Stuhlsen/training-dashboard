/* ============================================================
   FEATURES/PLANNING/PLANSPORTPICKER.TSX — Sportarten-Auswahl im „Neuer
   Plan"-Dialog (Fahrplan 44 E4).

   Erscheint nur, wenn der Athlet mehr als eine Sportart hat (Entscheidung des
   Aufrufers). Eine Sportart gewählt → der Dialog läuft wie bisher. Zwei oder
   mehr → ein Plan je Sportart, gemeinsam gespeichert. Sportart = Symbol +
   Beschriftung, die Farbe trägt nie allein die Bedeutung.
   ============================================================ */

import { sportBadge } from "../../core/activity-sport.js";
import type { ActiveSport } from "../../api/hooks/useActiveSport";
import { LABEL_STYLE, PILL_STYLE, PRIMARY_BTN_STYLE } from "./new-plan-dialog-styles";
import { MULTI_SPORT_LABEL } from "./multi-sport-plan-view-model";

interface PlanSportPickerProps {
  /** Sportarten, die der Athlet hat (mindestens zwei, sonst zeigt der Aufrufer nichts). */
  offered: readonly ActiveSport[];
  chosen: readonly ActiveSport[];
  onToggle: (sport: ActiveSport) => void;
}

export function PlanSportPicker({ offered, chosen, onToggle }: PlanSportPickerProps) {
  return (
    <div style={LABEL_STYLE} role="group" aria-label="Sportarten in diesem Plan">
      Sportarten in diesem Plan
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {offered.map((sport) => {
          const badge = sportBadge(sport);
          const on = chosen.includes(sport);
          // Die letzte gewählte Sportart bleibt stehen: ein Plan braucht eine.
          const isLast = on && chosen.length === 1;
          return (
            <button
              key={sport}
              type="button"
              aria-pressed={on}
              disabled={isLast}
              title={isLast ? "Mindestens eine Sportart bleibt gewählt" : undefined}
              style={{
                ...(on ? { ...PILL_STYLE, ...PRIMARY_BTN_STYLE, padding: "6px 12px" } : PILL_STYLE),
                ...(isLast ? { cursor: "default" } : {}),
              }}
              onClick={() => onToggle(sport)}
            >
              <span aria-hidden="true">{badge.icon}</span> {MULTI_SPORT_LABEL[sport]}
            </button>
          );
        })}
      </div>
      <span style={{ fontSize: ".72rem" }}>
        {chosen.length > 1
          ? "Jede Sportart bekommt einen eigenen Plan. Alle Einheiten stehen zusammen im Kalender."
          : "Wähle mehrere Sportarten, um sie in einem Schritt zu planen."}
      </span>
    </div>
  );
}

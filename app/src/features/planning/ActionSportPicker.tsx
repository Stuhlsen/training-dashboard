/* ============================================================
   FEATURES/PLANNING/ACTIONSPORTPICKER.TSX — "Für welche Sportart?"
   (Fahrplan 44 E1, Punkt "Aktionen im Modus Alle")

   "Neuer Plan", "Plan anpassen" und "Plan verschieben" wirken je Sportart.
   Im Kalender-Modus "Alle" gibt es keine eindeutige Sportart — statt still
   auf die zuletzt global gewählte zu wirken, fragt dieser kleine Dialog
   ausdrücklich nach. Er ist KEIN zweiter Umschalter: die Wahl gilt nur für
   die eine Aktion und ändert weder den Planungsfilter noch `useActiveSport`.
   Overlay-Muster wie MoveCopyDialog.tsx.
   ============================================================ */

import { GlassCard } from "../../components/GlassCard";
import { useEscapeToClose } from "../../hooks/useEscapeToClose";
import { sportBadge } from "../../core/activity-sport.js";
import type { ActiveSport } from "../../api/hooks/useActiveSport";

const BTN_STYLE: React.CSSProperties = {
  border: "1px solid var(--hair)",
  borderRadius: "var(--pill)",
  padding: "9px 18px",
  background: "transparent",
  color: "var(--ink)",
  font: "inherit",
  fontSize: ".86rem",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};

export interface ActionSportPickerProps {
  /** Name der Aktion, z. B. "Neuer Plan". */
  action: string;
  sports: readonly ActiveSport[];
  onPick: (sport: ActiveSport) => void;
  onClose: () => void;
}

export function ActionSportPicker({ action, sports, onPick, onClose }: ActionSportPickerProps) {
  useEscapeToClose(onClose);
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(7,9,14,.75)",
        backdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <GlassCard variant="strong" radius="22px" style={{ width: "100%", maxWidth: 420, padding: "26px 24px" }}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${action}: Sportart wählen`}
          style={{ display: "flex", flexDirection: "column", gap: 14 }}
        >
          <div style={{ fontFamily: "var(--font-disp)", fontWeight: 700, fontSize: "1rem", color: "var(--ink)" }}>
            {action} — für welche Sportart?
          </div>
          <p style={{ margin: 0, fontSize: ".82rem", color: "var(--ink-3)" }}>
            Jede Sportart hat ihren eigenen Plan. Die Aktion wirkt nur auf die gewählte.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {sports.map((s) => {
              const badge = sportBadge(s);
              return (
                <button key={s} type="button" style={BTN_STYLE} onClick={() => onPick(s)} aria-label={badge.label}>
                  <span aria-hidden="true">{badge.icon}</span>
                  <span style={{ color: badge.colorVar }}>{badge.label}</span>
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="button" style={{ ...BTN_STYLE, color: "var(--ink-2)" }} onClick={onClose}>
              Abbrechen
            </button>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

/* ============================================================
   FEATURES/PLANNING/EXPORTIMPORTBAR.TSX — Coach-Leiste
   (Fahrplan 9 Etappe B — früher zwei Knöpfe „Export für Claude" /
   „Vorschläge importieren", jetzt ein Knopf „Coach" → CoachPanel)

   Erscheint, wenn der eingeloggte User SEINEN EIGENEN Plan ansieht —
   unabhängig davon, ob profiles.trainer_id gesetzt ist (Claude hat keinen
   Account, der Athlet betätigt den Workflow immer selbst). Gate =
   useIsSelfAthlete(), exakt wie das Vanilla-ownsPlan()-Muster.
   ============================================================ */

import { useState } from "react";
import { useIsSelfAthlete } from "../../api/hooks/useWriteAuthorization";
import { CoachPanel } from "./CoachPanel";
import { projectLoad } from "../../core/projection.js";
import type { EventItem, PlanCard as PlanCardT } from "../../api/types";

type Ride = import("../../types.js").Ride;
type WellnessDay = import("../../types.js").WellnessDay;

interface ExportImportBarProps {
  athleteId: string;
  ftp: number | null;
  cards: PlanCardT[];
  rides: Ride[];
  wellness: WellnessDay[];
  powerCurveBlocks: Array<{ key: string; curve?: object | null }>;
  events: EventItem[];
  projection: ReturnType<typeof projectLoad>;
  conflicts: Array<{ rule: string; severity: string; message: string }>;
}

const BTN_STYLE: React.CSSProperties = {
  border: "1px solid var(--hair)",
  borderRadius: "var(--pill)",
  padding: "8px 16px",
  background: "transparent",
  color: "var(--ink-2)",
  font: "inherit",
  fontSize: ".82rem",
  cursor: "pointer",
};

export function ExportImportBar(props: ExportImportBarProps) {
  const { athleteId } = props;
  const { isSelf } = useIsSelfAthlete(athleteId);
  const [open, setOpen] = useState(false);

  if (!isSelf) return null;

  return (
    <>
      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" style={BTN_STYLE} onClick={() => setOpen(true)}>
          Coach
        </button>
      </div>

      {open && <CoachPanel {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

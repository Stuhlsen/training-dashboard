/* ============================================================
   FEATURES/NUTRITION/GOALINFONOTES.TSX — Zusatzangaben zum Tagesziel
   bei aktiven Zielen (Fahrplan 43, E6)

   Rendert nur: Eiweiß-Bereich, Kohlenhydrat-Band und die Gründe, warum
   ein Defizit heute entfällt oder bleibt. Gerechnet wird in
   core/nutrition.js und nutrition-day-model.ts.

   Ton: sachlich. Kein Lob fürs Wenig-Essen, keine Dringlichkeit, keine
   Diagnose, keine Versprechen. Keine Fortschritts-Belohnung fürs Abnehmen.
   ============================================================ */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { STRICT_FLOOR_KCAL_PER_KG_FFM, STRICT_WARN_UPPER_KCAL_PER_KG_FFM } from "../../core/nutrition.js";
import type { DayGoalInfo } from "./nutrition-day-model";
import { TEXT_STYLE } from "./nutrition-styles";
import { ORIENTATION_NOTICE_TEXT } from "../settings/OrientationNotice";

const LINK_STYLE = { color: "var(--accent)", fontWeight: 600 } as const;

export function GoalInfoNotes({ info }: { info: DayGoalInfo }) {
  const lines: Array<{ key: string; node: ReactNode }> = [];

  if (info.proteinG) {
    lines.push({
      key: "protein",
      node: `Eiweiß als Orientierung: ${info.proteinG.min}–${info.proteinG.max} g am Tag.`,
    });
  }
  if (info.carbsG) {
    lines.push({
      key: "carbs",
      node: `Kohlenhydrate als Orientierung: ${info.carbsG[0]}–${info.carbsG[1]} g am Tag.`,
    });
  }
  if (info.deficitBlockedReason === "no-body-fat") {
    lines.push({
      key: "no-body-fat",
      node: (
        <>
          Es gibt kein Defizit, weil kein gemessenes Körperfett vorliegt. Das Tagesziel rechnet wie „halten“.{" "}
          <Link to="/app/settings" style={LINK_STYLE}>
            Körperfett eintragen
          </Link>
        </>
      ),
    });
  }
  if (info.deficitBlockedReason === "hard-day") {
    lines.push({
      key: "hard-day",
      node: "Heute gibt es kein Defizit: Heute oder morgen steht eine harte Einheit im Plan.",
    });
  }
  if (info.nextDayUnknown) {
    lines.push({
      key: "next-day",
      node: "Für morgen steht nichts im Plan. Das Defizit bleibt deshalb bestehen.",
    });
  }
  if (info.paceCapped) {
    lines.push({
      key: "pace",
      node: "Dein gespeichertes Tempo liegt über der Obergrenze für dein aktuelles Gewicht. Gerechnet wird mit der Obergrenze.",
    });
  }
  if (info.eaWarn) {
    lines.push({
      key: "ea",
      node: `Das Ziel liegt im Bereich von ${STRICT_FLOOR_KCAL_PER_KG_FFM} bis ${STRICT_WARN_UPPER_KCAL_PER_KG_FFM} kcal pro kg fettfreier Masse (ohne Training). In diesem Bereich kann Energie knapp werden.`,
    });
  }

  if (lines.length === 0) return null;
  return (
    <>
      {lines.map((l) => (
        <p key={l.key} style={TEXT_STYLE}>
          {l.node}
        </p>
      ))}
      <p style={TEXT_STYLE}>{ORIENTATION_NOTICE_TEXT}</p>
    </>
  );
}

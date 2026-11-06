/* ============================================================
   FEATURES/PLANNING/TRAINERGOALS.TSX — Ziele des Athleten in der Trainer-Leiste
   (Fahrplan 43 E7, Z6 + Z8)

   Nur lesend: Haupt- und Nebenziel mit Datum und der Ziel-Check. Es gibt keine
   Bedienelemente zum Ändern oder Beenden (Z8) — wer etwas vorschlagen will,
   nutzt weiter die Vorschläge.

   Z6: Die Komponente lädt ausschließlich Ziele, FTP und eFTP-Daten. Ernährungs-
   daten und Körperwerte werden hier nie geladen (Test spiegelt das). Gerechnet
   wird in trainer-goals-view-model.ts über die Funktionen der Einstellungen.
   ============================================================ */

import { useMemo } from "react";
import { useAthleteGoals } from "../../api/hooks/useGoals";
import { useAthleteConfig } from "../../api/hooks/useAthleteConfig";
import { localISODate } from "../../core/format.js";
import { FtpCheck } from "../settings/FtpCheck";
import { mergedEftpHistory } from "../settings/goals-view-model";
import { LABEL_STYLE } from "../settings/section-styles";
import { resolveMeasuredFtp } from "./new-plan-dialog-view-model";
import { useFtpHistoryEntries } from "./useFtpHistoryEntries";
import { buildTrainerGoalsView } from "./trainer-goals-view-model";

type Ride = import("../../types.js").Ride;
type WellnessDay = import("../../types.js").WellnessDay;

interface TrainerGoalsProps {
  athleteId: string;
  /** Profil-ID des Athleten (aus dem Trainer-Kontext) */
  athleteProfileId: string | null;
  rides: Ride[];
  wellness: WellnessDay[];
}

const CHECK_INFO_STYLE = {
  margin: 0,
  color: "var(--ink-3)",
  fontFamily: "var(--font-body)",
  fontSize: ".74rem",
  lineHeight: 1.5,
} as const;

const TILE_STYLE: React.CSSProperties = {
  background: "rgba(255,255,255,.03)",
  border: "1px solid var(--hair)",
  borderRadius: "var(--radius-sm)",
  padding: "12px 14px",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  listStyle: "none",
};

export function TrainerGoals({ athleteId, athleteProfileId, rides, wellness }: TrainerGoalsProps) {
  const { goals, isLoading, isError } = useAthleteGoals(athleteProfileId);
  const athleteCfg = useAthleteConfig(athleteId);
  const ftpHistoryEntries = useFtpHistoryEntries(athleteId);

  const todayISO = localISODate();
  const current = resolveMeasuredFtp(athleteCfg, ftpHistoryEntries, todayISO).ftpMeasured;
  const view = useMemo(
    () => buildTrainerGoalsView({ goals, current, history: mergedEftpHistory(rides, wellness), todayISO }),
    [goals, current, rides, wellness, todayISO],
  );

  return (
    <section aria-label="Ziele" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={LABEL_STYLE}>Ziele</div>
      {isLoading && <p style={CHECK_INFO_STYLE}>Lädt …</p>}
      {!isLoading && isError && <p style={CHECK_INFO_STYLE}>Ziele konnten nicht geladen werden.</p>}
      {!isLoading && !isError && view.emptyText && <p style={CHECK_INFO_STYLE}>{view.emptyText}</p>}
      {!isLoading && !isError && view.cards.length > 0 && (
        <ul
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))",
            gap: 12,
            margin: 0,
            padding: 0,
          }}
        >
          {view.cards.map((card) => (
            <li key={card.id} style={TILE_STYLE}>
              <div>
                <div style={{ ...LABEL_STYLE, marginBottom: 2 }}>{card.roleLabel}</div>
                <div
                  style={{
                    fontFamily: "var(--font-disp)",
                    fontWeight: 600,
                    fontSize: ".88rem",
                    color: "var(--ink)",
                    overflowWrap: "anywhere",
                  }}
                >
                  {card.title}
                </div>
                {(card.dateText || card.valueText) && (
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: ".65rem", color: "var(--ink-3)" }}>
                    {[card.dateText, card.valueText].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
              {card.check && <FtpCheck view={card.check} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

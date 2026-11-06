/* ============================================================
   FEATURES/PLANNING/GROUPRECOMPUTEDIALOG.TSX — „Plan anpassen" für
   verknüpfte Pläne (Fahrplan 44 E6)

   Gleiches Overlay wie RecomputePlanDialog, aber für eine Plan-Gruppe mit
   mindestens zwei aktiven Plänen: alle Sportarten der Gruppe stehen da, die
   aufrufende vorn, jede einzeln abwählbar (Standard: alle gewählt). Trainings-
   tage, feste Tage und Stunden wirken auf die gewählten Sportarten; Rad hat
   Vorrang (M3), Hinweise sperren nichts (M4). Die Vorschau zeigt das gemeinsame
   Raster mit der Last je Sportart und der Summe als Näherung (M8).

   „Abbrechen" und Wegklicken schreiben nichts. Geschrieben wird erst bei
   „Änderungen übernehmen" (useRecomputePlanGroup, mit Sicherung und
   Wiederherstellung). „Sportart hinzufügen" (E5) bleibt unverändert im Dialog.
   Reine Darstellung — Zustand und Zahlen liefert useGroupRecomputeFlow.
   ============================================================ */

import { useMemo, useState } from "react";
import { GlassCard } from "../../components/GlassCard";
import { useRides } from "../../api/hooks/useRides";
import type { ActiveSport } from "../../api/hooks/useActiveSport";
import type { TrainingPlan } from "../../api/types";
import { fmtDate } from "../../core/format.js";
import { groupRideEstimates } from "../../core/group-ride-duration.js";
import type { Ride } from "../../types.js";
import { AddSportFlow } from "./AddSportFlow";
import { GroupSportEditor } from "./GroupSportEditor";
import { MultiSportPreview } from "./MultiSportPreview";
import { MULTI_SPORT_LABEL } from "./multi-sport-plan-view-model";
import { BTN_STYLE, PRIMARY_BTN_STYLE } from "./new-plan-dialog-styles";
import { WEEKDAY_LABELS } from "./new-plan-dialog-view-model";
import { useGroupRecomputeFlow } from "./useGroupRecomputeFlow";

interface GroupRecomputeDialogProps {
  athleteId: string;
  /** Alle aktiven Pläne der Gruppe (mindestens zwei). */
  plans: readonly TrainingPlan[];
  /** Sportart des Plans, über den der Dialog geöffnet wurde — steht vorn. */
  callerSport: ActiveSport;
  onClose: () => void;
  /** Meldet dem Eltern-Dialog, ob gerade gespeichert wird — er sperrt dann Escape
   *  (Escape fängt `RecomputePlanDialog` ab, dieser Dialog hat keinen eigenen Listener). */
  onBusyChange?: (busy: boolean) => void;
  /** Fahrplan 43 E5: „Ziele berücksichtigen" startet an. */
  withGoals?: boolean;
}

const BOX: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: "var(--radius-sm)",
  background: "rgba(224,138,60,.10)",
  border: "1px solid rgba(224,138,60,.35)",
  color: "var(--ink-2)",
  fontSize: ".78rem",
  lineHeight: 1.45,
};
const CALM_BOX: React.CSSProperties = { ...BOX, background: "rgba(255,255,255,.03)", border: "1px solid var(--hair)" };

const labels = (sports: readonly ActiveSport[]) => sports.map((s) => MULTI_SPORT_LABEL[s]).join(", ");

export function GroupRecomputeDialog({
  athleteId,
  plans,
  callerSport,
  onClose,
  onBusyChange,
  withGoals = false,
}: GroupRecomputeDialogProps) {
  const flow = useGroupRecomputeFlow(athleteId, plans, callerSport, withGoals);
  const { data: rideData } = useRides(athleteId);
  const estimates = useMemo(
    () => groupRideEstimates((rideData?.ridesAll as Ride[] | undefined) ?? []),
    [rideData?.ridesAll],
  );
  const [adding, setAdding] = useState(false);

  const { build } = flow;
  const ok = build.ok ? build : null;
  const rideItem = ok?.items.find((i) => i.sport === "ride");
  const untouched = ok ? ok.items.filter((i) => !i.affected).map((i) => i.sport) : [];

  async function handleApply() {
    onBusyChange?.(true);
    try {
      if (await flow.apply()) onClose();
    } finally {
      onBusyChange?.(false);
    }
  }

  if (adding) {
    return (
      <AddSportFlow
        athleteId={athleteId}
        onBack={() => setAdding(false)}
        onClose={onClose}
        onBusyChange={onBusyChange}
      />
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(7,9,14,.75)",
        backdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "40px 16px",
        overflowY: "auto",
        zIndex: 1000,
      }}
      onClick={(e) => {
        // Während des Speicherns bleibt der Dialog offen, damit ein Fehler sichtbar wird.
        if (e.target === e.currentTarget && !flow.isPending) onClose();
      }}
    >
      <GlassCard variant="strong" radius="22px" style={{ width: "100%", maxWidth: 560, padding: "26px 24px" }}>
        <div style={{ fontFamily: "var(--font-disp)", fontWeight: 700, fontSize: "1rem", color: "var(--ink)" }}>
          Plan anpassen — {labels(flow.displaySports)}
        </div>
        <p style={{ margin: "8px 0 16px", fontSize: ".82rem", color: "var(--ink-3)" }}>
          Deine Pläne sind verknüpft. Trainingstage und feste Tage wirken auf alle gewählten Sportarten, ohne dass
          zwei harte Einheiten am selben Tag landen. Das Rad hat Vorrang, die anderen Sportarten passen sich an.
          Gespeichert wird erst, wenn du unten bestätigst.
        </p>

        <div style={{ display: "grid", gap: 10, margin: "0 0 16px" }}>
          {flow.displaySports.map((s) => (
            <GroupSportEditor
              key={s}
              sport={s}
              selected={flow.selected.includes(s)}
              lockSelected={flow.selected.length === 1}
              disabled={flow.isPending}
              weekdays={flow.shown.weekdays(s)}
              hours={flow.shown.hours(s)}
              fixedDays={flow.shown.fixedDays(s)}
              ftpTarget={flow.shown.ftpTarget(s)}
              currentFtp={s === "ride" ? (rideItem?.input?.currentFtp ?? null) : null}
              estimates={estimates}
              onToggleSelected={() => flow.toggleSport(s)}
              onToggleDay={(iso) => flow.toggleDay(s, iso)}
              onHours={(hours) => flow.setEdit(s, { hours })}
              onFixedDays={(fixedDays) => flow.setEdit(s, { fixedDays })}
              onFtpTarget={(ftpTarget) => flow.setEdit(s, { ftpTarget })}
            />
          ))}
        </div>

        {flow.showGoalsBox && (
          <div style={{ ...CALM_BOX, margin: "0 0 16px", display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 6, color: "var(--ink-2)" }}>
              <input type="checkbox" checked={flow.goalsOn} onChange={(e) => flow.setGoalsOn(e.target.checked)} />
              <span>Ziele berücksichtigen</span>
            </label>
            {flow.goalsOn &&
              flow.goalSummaries.map((g) => (
                <div key={g.sport}>
                  <strong>{MULTI_SPORT_LABEL[g.sport]}:</strong>{" "}
                  {[
                    ...g.changes.changes,
                    ...(g.changes.notYet.length ? [`wirkt noch nicht: ${g.changes.notYet.join(", ")}`] : []),
                  ].join(" · ")}
                </div>
              ))}
            {flow.goalsOn && flow.interimFtp != null && (
              <div>
                Ziel-FTP (Rad): Vorschlag {flow.interimFtp} W aus deinem Zwischenziel. Du kannst ihn oben ändern.
              </div>
            )}
            {!flow.goalsOn && (
              <div>Aus: Die Pläne werden nur mit deinen Trainingstagen und deiner aktuellen Form neu gerechnet.</div>
            )}
          </div>
        )}

        {!build.ok && (
          <div role="alert" style={{ ...CALM_BOX, color: "var(--ink-2)" }}>
            {build.reason}
          </div>
        )}

        {ok && (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={BOX}>
              {ok.refreshMode ? (
                <>
                  Du hast nichts geändert: Die gewählten Sportarten ({labels(ok.affectedSports)}) werden mit deiner
                  aktuellen Form neu gerechnet. Geschrieben wird nur, was sich dabei wirklich ändert.
                </>
              ) : (
                <>
                  Ändert <strong>{labels(ok.affectedSports)}</strong> — {ok.affectedWeeks} Woche
                  {ok.affectedWeeks === 1 ? "" : "n"} ab {fmtDate(ok.replaceFrom)}. Künftige Karten dieser Sportarten
                  werden neu geschrieben; manuelle Änderungen daran gehen verloren, vergangene und als ausgefallen
                  markierte Karten bleiben.
                </>
              )}
              {untouched.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  Bleibt unverändert: <strong>{labels(untouched)}</strong>.
                </div>
              )}
            </div>

            {ok.items.some((i) => i.droppedFixedWeekdays.length > 0) && (
              <div style={{ fontSize: ".76rem", color: "var(--ink-3)" }}>
                Fester Tag entfällt:{" "}
                {ok.items
                  .flatMap((i) => i.droppedFixedWeekdays)
                  .map((iso) => WEEKDAY_LABELS.find((w) => w.iso === iso)?.short)
                  .join(", ")}{" "}
                (kein Trainingstag mehr).
              </div>
            )}

            <MultiSportPreview
              bundle={{ items: ok.grid, load: ok.load }}
              notes={ok.hints.map((h) => ({ text: h.text }))}
            />
          </div>
        )}

        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--hair)" }}>
          <p style={{ margin: "0 0 8px", fontSize: ".78rem", color: "var(--ink-3)" }}>
            Du willst eine weitere Sportart planen? Dein Plan bleibt dabei unverändert.
          </p>
          <button type="button" style={BTN_STYLE} onClick={() => setAdding(true)} disabled={flow.isPending}>
            Sportart hinzufügen
          </button>
        </div>

        {flow.saveError && (
          <div role="alert" style={{ color: "var(--danger)", fontSize: ".8rem", marginTop: 12 }}>
            {flow.saveError}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button type="button" style={BTN_STYLE} onClick={onClose} disabled={flow.isPending}>
            Abbrechen
          </button>
          <button
            type="button"
            style={
              !build.ok || flow.isPending
                ? { ...PRIMARY_BTN_STYLE, opacity: 0.5, cursor: "not-allowed" }
                : PRIMARY_BTN_STYLE
            }
            disabled={!build.ok || flow.isPending}
            onClick={() => void handleApply()}
          >
            {flow.isPending ? "Speichert…" : "Änderungen übernehmen"}
          </button>
        </div>
      </GlassCard>
    </div>
  );
}

/* ============================================================
   FEATURES/PLANNING/RECOMPUTEPLANDIALOG.TSX — „Plan anpassen"
   (Fahrplan 8 E13)

   Ändert Trainingstage, feste Tage und Ziel-FTP und rechnet die Restwochen des
   aktiven Plans mit frischer Form / Planerfüllung neu — Blockstruktur +
   Vergangenheit bleiben, es ist DIESELBE `training_plans`-Zeile. Vorschau
   zeigt nur die betroffenen Wochen. „Änderungen übernehmen" ersetzt deren
   künftige Karten (`useRecomputeRemainingPlan`).

   Overlay-/Sperr-Muster wie FtpRescaleDialog.tsx / ShiftPlanDialog.tsx.
   Reine Eingabe-Logik in recompute-plan-view-model.ts.
   ============================================================ */

import { useMemo, useState } from "react";
import { GlassCard } from "../../components/GlassCard";
import { useEscapeToClose } from "../../hooks/useEscapeToClose";
import { useActiveTrainingPlan } from "../../api/hooks/useActiveTrainingPlan";
import { usePlanHistoryAggregate } from "../../api/hooks/usePlanHistoryAggregate";
import { sportBadge } from "../../core/activity-sport.js";
import { useEffectiveSport, type ActiveSport } from "../../api/hooks/useActiveSport";
import { useAthleteFormats } from "../../api/hooks/useAthleteFormats";
import { useRides } from "../../api/hooks/useRides";
import { athleteConfig } from "../../config";
import { fmtDate, localISODate } from "../../core/format.js";
import { groupRideEstimates } from "../../core/group-ride-duration.js";
import { generatePlan } from "../../core/plan-generator.js";
import { FixedDaysEditor } from "./FixedDaysEditor";
import { goalPlanChanges, goalPlanHint, planGoalProfile } from "./goal-plan-view-model";
import { useGoalPlanContext } from "./useGoalPlanContext";
import { PlanPreview } from "./PlanPreview";
import { buildRecomputeInput, currentTailWeekdays, replaceFromISO } from "./recompute-plan-view-model";
import { useFtpHistoryEntries } from "./useFtpHistoryEntries";
import { useRecomputeRemainingPlan } from "./useRecomputeRemainingPlan";
import { resolveMeasuredFtp, savedFixedDays, WEEKDAY_LABELS } from "./new-plan-dialog-view-model";
import {
  FIELD_STYLE,
  LABEL_STYLE,
  PILL_STYLE,
  PRIMARY_BTN_STYLE as PICKED_PILL_STYLE,
} from "./new-plan-dialog-styles";
import type { FixedDay, GeneratedPlan } from "./new-plan-dialog-view-model";
import type { Ride } from "../../types.js";

interface RecomputePlanDialogProps {
  athleteId: string;
  onClose: () => void;
  /** Fahrplan 43 E5: „Ziele berücksichtigen" startet an — nur, wenn der Dialog
   *  über den Hinweis auf der Planungsseite geöffnet wird. Sonst aus. */
  withGoals?: boolean;
  /** Fahrplan 44 E1: ausdrücklich gewählte Sportart (Modus "Alle" bzw. Filter
   *  der Planungsseite). Ohne Angabe gilt der globale Umschalter wie bisher. */
  sport?: ActiveSport;
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

const PRIMARY_BTN_STYLE: React.CSSProperties = {
  ...BTN_STYLE,
  background: "var(--ss)",
  borderColor: "var(--ss)",
  color: "#17110a",
  fontWeight: 600,
};

export function RecomputePlanDialog({ athleteId, onClose, withGoals = false, sport }: RecomputePlanDialogProps) {
  useEscapeToClose(onClose);

  const today = localISODate();
  const { effectiveSport } = useEffectiveSport(athleteId, sport);
  const { data: activePlan, isLoading: planLoading } = useActiveTrainingPlan(athleteId, effectiveSport);
  const { aggregate } = usePlanHistoryAggregate(athleteId, effectiveSport);
  const { entries: formatEntries } = useAthleteFormats();
  const { recompute, isPending } = useRecomputeRemainingPlan(athleteId);
  const { data: rideData } = useRides(athleteId);
  const ftpHistoryEntries = useFtpHistoryEntries(athleteId);

  const [saveError, setSaveError] = useState<string | null>(null);
  // `null` = noch nicht angefasst → Tage des Plans bzw. gespeicherter Wert.
  const [pickedDays, setPickedDays] = useState<number[] | null>(null);
  const [keepAllDays, setKeepAllDays] = useState<boolean | null>(null);
  const [pickedFixedDays, setPickedFixedDays] = useState<FixedDay[] | null>(null);
  const [pickedFtpTarget, setPickedFtpTarget] = useState<number | null>(null);

  // Ziele (Fahrplan 43 E5): Standard aus; nur der Hinweis öffnet den Dialog mit
  // „an". Ändert nichts am Plan, bevor der Athlet übernimmt.
  const { goals, interimFtp } = useGoalPlanContext(athleteId, effectiveSport);
  const [goalsOn, setGoalsOn] = useState(withGoals);
  const goalProfile = useMemo(() => planGoalProfile(goals, effectiveSport), [goals, effectiveSport]);

  const isRide = effectiveSport === "ride";
  const shownDays = pickedDays ?? (activePlan ? currentTailWeekdays(activePlan, today) : []);
  const shownFixedDays = pickedFixedDays ?? (activePlan ? savedFixedDays(activePlan) : []);
  const groupEstimates = useMemo(
    () => groupRideEstimates((rideData?.ridesAll as Ride[] | undefined) ?? []),
    [rideData?.ridesAll]
  );
  const lowAdherence =
    ((aggregate as { planAdherence?: number | null } | null)?.planAdherence ?? 1) < 0.7;
  const savedKeepAll =
    (activePlan?.params as { form?: { keepAllTrainingDays?: unknown } } | undefined)?.form
      ?.keepAllTrainingDays === true;

  function toggleDay(iso: number) {
    const next = shownDays.includes(iso)
      ? shownDays.filter((d) => d !== iso)
      : [...shownDays, iso].sort((a, b) => a - b);
    setPickedDays(next);
    setSaveError(null);
  }

  // Input + Vorschau in einem Zug ableiten — der Dialog rechnet sofort, es gibt
  // keinen „Vorschau erstellen"-Zwischenschritt (die Rahmenbedingungen stehen
  // fest, nur Form/Erfüllung sind neu).
  const built = useMemo(() => {
    if (!activePlan) return null;
    const cfg = athleteConfig(athleteId);
    const res = buildRecomputeInput({
      plan: activePlan,
      history: aggregate,
      todayISO: today,
      athleteDefaults: cfg && { ...cfg, ...resolveMeasuredFtp(cfg, ftpHistoryEntries, today) },
      currentThresholdSpeed: (aggregate as { currentThresholdSpeed?: number | null } | null)
        ?.currentThresholdSpeed,
      ...(pickedDays ? { trainingWeekdays: pickedDays } : {}),
      ...(keepAllDays != null ? { keepAllTrainingDays: keepAllDays } : {}),
      ...(pickedFixedDays ? { fixedDays: pickedFixedDays } : {}),
      // Von Hand geändertes Ziel-FTP gewinnt; sonst bei „Ziele berücksichtigen"
      // das Zwischenziel (nur Rad, nur bei ok — sonst null).
      ...(pickedFtpTarget != null
        ? { ftpTarget: pickedFtpTarget }
        : goalsOn && interimFtp != null
          ? { ftpTarget: interimFtp }
          : {}),
      ...(goalsOn ? { goalProfile } : {}),
    });
    if (!res.ok) return { error: res.reason };
    const run = generatePlan as (input: unknown) => GeneratedPlan;
    const generated = run({
      ...res.input,
      formats: formatEntries.map((e) => e.format),
    });
    const tailWeeks = generated.weeks.filter((w) => w.start >= res.regenerateFromISO);
    return {
      input: res.input,
      generated,
      preview: { ...generated, weeks: tailWeeks } as GeneratedPlan,
      regenerateFromISO: res.regenerateFromISO,
      affectedWeeks: res.affectedWeeks,
      droppedFixedWeekdays: res.droppedFixedWeekdays,
    };
  }, [
    activePlan,
    aggregate,
    athleteId,
    formatEntries,
    ftpHistoryEntries,
    today,
    pickedDays,
    keepAllDays,
    pickedFixedDays,
    pickedFtpTarget,
    goalsOn,
    goalProfile,
    interimFtp,
  ]);

  // Anzeige der Ziel-Box (nur Darstellung, fließt nicht in die Berechnung).
  const goalChanges = goalPlanChanges(goalProfile);
  const goalHint = activePlan ? goalPlanHint(goals, activePlan, interimFtp) : null;
  const needsNewPlan = !!goalHint?.differences.some((d) => d === "focus" || d === "level");
  const showGoalsBox = goalChanges.hasEffect || goalChanges.notYet.length > 0 || interimFtp != null || needsNewPlan;

  async function handleApply() {
    if (!activePlan || !built || "error" in built || isPending) return;
    setSaveError(null);
    const result = await recompute({
      plan: activePlan,
      generated: built.generated,
      input: built.input,
      todayISO: today,
    });
    if (!result.ok) {
      setSaveError(result.error.message);
      return;
    }
    onClose();
  }

  const blocked = !built || "error" in built;

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
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <GlassCard variant="strong" radius="22px" style={{ width: "100%", maxWidth: 560, padding: "26px 24px" }}>
        <div style={{ fontFamily: "var(--font-disp)", fontWeight: 700, fontSize: "1rem", color: "var(--ink)" }}>
          Plan anpassen{sport ? ` — ${sportBadge(sport).label}` : ""}
        </div>
        <p style={{ margin: "8px 0 16px", fontSize: ".82rem", color: "var(--ink-3)" }}>
          Ändere Trainingstage, feste Tage oder dein Ziel. Die Restwochen werden mit deiner aktuellen
          Form und Planerfüllung neu gerechnet. Blockfolge und Vergangenheit bleiben.
        </p>

        {planLoading && <p style={{ color: "var(--ink-3)", fontSize: ".85rem" }}>Lädt …</p>}

        {!planLoading && activePlan && (
          <div style={{ margin: "0 0 16px", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: ".78rem", color: "var(--ink-3)" }}>Trainingstage</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {WEEKDAY_LABELS.map((d) => {
                const on = shownDays.includes(d.iso);
                return (
                  <button
                    key={d.iso}
                    type="button"
                    aria-pressed={on}
                    style={on ? { ...PILL_STYLE, ...PICKED_PILL_STYLE, padding: "6px 12px" } : PILL_STYLE}
                    onClick={() => toggleDay(d.iso)}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
            {lowAdherence && shownDays.length > 2 && (
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 6,
                  fontSize: ".76rem",
                  color: "var(--ink-3)",
                }}
              >
                <input
                  type="checkbox"
                  checked={keepAllDays ?? savedKeepAll}
                  onChange={(e) => setKeepAllDays(e.target.checked)}
                />
                <span>
                  Zuletzt unter 70 % Planerfüllung — der Plan würde einen Trainingstag streichen.
                  Alle {shownDays.length} gewählten Tage trotzdem behalten.
                </span>
              </label>
            )}
            {built && !("error" in built) && built.droppedFixedWeekdays.length > 0 && (
              <div style={{ fontSize: ".76rem", color: "var(--ink-3)" }}>
                Fester Tag entfällt:{" "}
                {built.droppedFixedWeekdays
                  .map((iso) => WEEKDAY_LABELS.find((w) => w.iso === iso)?.short)
                  .join(", ")}{" "}
                (kein Trainingstag mehr).
              </div>
            )}
            {isRide && (
              <FixedDaysEditor
                fixedDays={shownFixedDays.filter((d) => shownDays.includes(d.weekday))}
                trainingWeekdays={shownDays}
                estimates={groupEstimates}
                onChange={(next) => {
                  setPickedFixedDays(next);
                  setSaveError(null);
                }}
              />
            )}
            {showGoalsBox && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  padding: "10px 12px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--hair)",
                  fontSize: ".76rem",
                  color: "var(--ink-3)",
                }}
              >
                <label style={{ display: "flex", alignItems: "flex-start", gap: 6, color: "var(--ink-2)" }}>
                  <input
                    type="checkbox"
                    checked={goalsOn}
                    onChange={(e) => {
                      setGoalsOn(e.target.checked);
                      setSaveError(null);
                    }}
                  />
                  <span>Ziele berücksichtigen</span>
                </label>
                {goalsOn && goalChanges.changes.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {goalChanges.changes.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                )}
                {goalsOn && interimFtp != null && pickedFtpTarget == null && (
                  <div>Ziel-FTP: Vorschlag {interimFtp} W aus deinem Zwischenziel. Du kannst ihn unten ändern.</div>
                )}
                {goalsOn && goalChanges.notYet.length > 0 && (
                  <div>Wirkt noch nicht im Plan: {goalChanges.notYet.join(", ")}.</div>
                )}
                {goalsOn && needsNewPlan && (
                  <div>Fokus und Level änderst du über „Neuer Plan“.</div>
                )}
                {!goalsOn && <div>Aus: Der Plan wird nur mit deinen Trainingstagen und deiner aktuellen Form neu gerechnet.</div>}
              </div>
            )}
            {isRide && built && !("error" in built) && (
              <label style={LABEL_STYLE}>
                Ziel-FTP für diesen Plan (W)
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  style={{ ...FIELD_STYLE, maxWidth: 200 }}
                  value={pickedFtpTarget ?? built.input.ftpTarget ?? ""}
                  onChange={(e) => {
                    const watt = Number(e.target.value);
                    setPickedFtpTarget(watt > 0 ? watt : null);
                  }}
                />
                {built.input.currentFtp != null && (
                  <span>Gerechnet mit deiner aktuellen FTP von {built.input.currentFtp} W.</span>
                )}
              </label>
            )}
          </div>
        )}

        {!planLoading && built && "error" in built && (
          <p style={{ color: "var(--ink-3)", fontSize: ".85rem" }}>{built.error}</p>
        )}

        {!planLoading && built && !("error" in built) && (
          <>
            <div
              style={{
                margin: "0 0 16px",
                padding: "10px 14px",
                borderRadius: "var(--radius-sm)",
                background: "rgba(224,138,60,.10)",
                border: "1px solid rgba(224,138,60,.35)",
                color: "var(--ink-2)",
                fontSize: ".78rem",
                lineHeight: 1.45,
              }}
            >
              Ersetzt <strong>{built.affectedWeeks} Woche{built.affectedWeeks === 1 ? "" : "n"}</strong> ab{" "}
              {fmtDate(replaceFromISO(built.regenerateFromISO, today))}. Künftige Karten dieser Wochen werden neu geschrieben —
              manuelle Änderungen daran gehen verloren; vergangene und als ausgefallen markierte Karten
              bleiben.
            </div>

            <div style={{ borderTop: "1px solid var(--hair)", paddingTop: 14 }}>
              <PlanPreview
                plan={built.preview}
                sport={built.input.sport ?? "ride"}
                thresholdSpeedTarget={built.input.thresholdSpeedTarget ?? null}
              />
            </div>
          </>
        )}

        {saveError && (
          <div style={{ color: "var(--danger)", fontSize: ".8rem", marginTop: 12 }}>{saveError}</div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button type="button" style={BTN_STYLE} onClick={onClose} disabled={isPending}>
            Abbrechen
          </button>
          <button
            type="button"
            style={
              blocked || isPending
                ? { ...PRIMARY_BTN_STYLE, opacity: 0.5, cursor: "not-allowed" }
                : PRIMARY_BTN_STYLE
            }
            disabled={blocked || isPending}
            onClick={() => void handleApply()}
          >
            {isPending ? "Speichert…" : "Änderungen übernehmen"}
          </button>
        </div>
      </GlassCard>
    </div>
  );
}

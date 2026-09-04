/* ============================================================
   FEATURES/PLANNING/RECOMPUTEPLANDIALOG.TSX — „Rest neu berechnen"
   (Fahrplan 8 E13)

   Rechnet die Restwochen des aktiven Plans mit frischer Form / Planerfüllung
   neu — Blockstruktur + Vergangenheit bleiben, es ist DIESELBE
   `training_plans`-Zeile. Vorschau zeigt nur die betroffenen Wochen.
   „Rest neu berechnen" ersetzt deren künftige Karten
   (`useRecomputeRemainingPlan`).

   Overlay-/Sperr-Muster wie FtpRescaleDialog.tsx / ShiftPlanDialog.tsx.
   Reine Eingabe-Logik in recompute-plan-view-model.ts.
   ============================================================ */

import { useMemo, useState } from "react";
import { GlassCard } from "../../components/GlassCard";
import { useEscapeToClose } from "../../hooks/useEscapeToClose";
import { useActiveTrainingPlan } from "../../api/hooks/useActiveTrainingPlan";
import { usePlanHistoryAggregate } from "../../api/hooks/usePlanHistoryAggregate";
import { useAthleteFormats } from "../../api/hooks/useAthleteFormats";
import { athleteConfig } from "../../config";
import { fmtDate, localISODate } from "../../core/format.js";
import { generatePlan } from "../../core/plan-generator.js";
import { PlanPreview } from "./PlanPreview";
import { buildRecomputeInput } from "./recompute-plan-view-model";
import { useRecomputeRemainingPlan } from "./useRecomputeRemainingPlan";
import type { GeneratedPlan } from "./new-plan-dialog-view-model";

interface RecomputePlanDialogProps {
  athleteId: string;
  onClose: () => void;
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

export function RecomputePlanDialog({ athleteId, onClose }: RecomputePlanDialogProps) {
  useEscapeToClose(onClose);

  const today = localISODate();
  const { data: activePlan, isLoading: planLoading } = useActiveTrainingPlan(athleteId);
  const { aggregate } = usePlanHistoryAggregate(athleteId);
  const { entries: formatEntries } = useAthleteFormats();
  const { recompute, isPending } = useRecomputeRemainingPlan(athleteId);

  const [saveError, setSaveError] = useState<string | null>(null);

  // Input + Vorschau in einem Zug ableiten — der Dialog rechnet sofort, es gibt
  // keinen „Vorschau erstellen"-Zwischenschritt (die Rahmenbedingungen stehen
  // fest, nur Form/Erfüllung sind neu).
  const built = useMemo(() => {
    if (!activePlan) return null;
    const res = buildRecomputeInput({
      plan: activePlan,
      history: aggregate,
      todayISO: today,
      athleteDefaults: athleteConfig(athleteId),
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
    };
  }, [activePlan, aggregate, athleteId, formatEntries, today]);

  async function handleApply() {
    if (!activePlan || !built || "error" in built || isPending) return;
    setSaveError(null);
    const result = await recompute({
      plan: activePlan,
      generated: built.generated,
      input: built.input,
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
          Rest neu berechnen
        </div>
        <p style={{ margin: "8px 0 16px", fontSize: ".82rem", color: "var(--ink-3)" }}>
          Die Restwochen des Plans werden mit deiner aktuellen Form und Planerfüllung neu gerechnet.
          Blockfolge und alle Wochen bis heute bleiben unverändert.
        </p>

        {planLoading && <p style={{ color: "var(--ink-3)", fontSize: ".85rem" }}>Lädt …</p>}

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
              {fmtDate(built.regenerateFromISO)}. Künftige Karten dieser Wochen werden neu geschrieben —
              manuelle Änderungen daran gehen verloren; vergangene und als ausgefallen markierte Karten
              bleiben.
            </div>

            <div style={{ borderTop: "1px solid var(--hair)", paddingTop: 14 }}>
              <PlanPreview plan={built.preview} />
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
            {isPending ? "Speichert…" : "Rest neu berechnen"}
          </button>
        </div>
      </GlassCard>
    </div>
  );
}

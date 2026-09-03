/* ============================================================
   FEATURES/PLANNING/SHIFTPLANDIALOG.TSX — „Plan verschieben…"
   (Migration 0026, Punkt 1 der 6-Punkte-Liste)

   Verschiebt den GANZEN Trainingsplan um N ganze Wochen NACH HINTEN — für
   Athlet 4 („bentastiic"), dessen Plan eine generierte Vorlage ist.
   Self-only (`useShiftPlan` prüft `useIsSelfAthlete` + `hasGeneratedPlan`),
   der Button in PlanningPage.tsx ist zusätzlich so gegatet.

   Overlay-Muster wie ImportDialog.tsx (`useEscapeToClose`, Klick-daneben).
   Reine Vorschau-/Validierungslogik in shift-plan-dialog-view-model.ts.
   ============================================================ */

import { useState } from "react";
import { GlassCard } from "../../components/GlassCard";
import { useEscapeToClose } from "../../hooks/useEscapeToClose";
import { usePlanCards, useShiftPlan } from "../../api/hooks/usePlanCards";
import { useSessionProfile } from "../../api/hooks/useSession";
import { fmtDate, localISODate } from "../../core/format.js";
import { shiftPreview } from "./shift-plan-dialog-view-model";

interface ShiftPlanDialogProps {
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

export function ShiftPlanDialog({ athleteId, onClose }: ShiftPlanDialogProps) {
  const { data: cards } = usePlanCards(athleteId);
  const storedOffset = useSessionProfile()?.planOffsetWeeks ?? 0;
  const { shift, isPending } = useShiftPlan(athleteId);

  const [weeks, setWeeks] = useState(1);
  const [error, setError] = useState("");
  // Eigener In-Flight-Guard: `isPending` aus useShiftPlan spiegelt nur die
  // Karten-Mutation und ist im Zeitfenster des Offset-Schreibvorgangs (und
  // zwischen den sequenziellen Karten-Patches) `false`.
  const [submitting, setSubmitting] = useState(false);
  // Ein Teil ist verschoben, dann brach etwas ab: kein erneuter Versuch aus
  // diesem Dialog (das würde die schon bewegten Karten doppelt verschieben) —
  // der Nutzer muss schließen und den Plan prüfen.
  const [locked, setLocked] = useState(false);

  useEscapeToClose(onClose);

  const preview = shiftPreview({
    storedOffset,
    weeks,
    cards: cards ?? [],
    todayISO: localISODate(),
    athleteId,
  });

  async function handleApply() {
    if (submitting || locked) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await shift(preview.targetOffset);
      if (result.ok) {
        onClose();
        return;
      }
      setError(result.error?.message || "Verschieben fehlgeschlagen.");
      // `moved` > 0 ⇒ Offset schon gesetzt + einige Karten bewegt: sperren.
      if ((result as { moved?: number }).moved) setLocked(true);
    } finally {
      setSubmitting(false);
    }
  }

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
      <GlassCard variant="strong" radius="22px" style={{ width: "100%", maxWidth: 460, padding: "26px 24px" }}>
        <div style={{ fontFamily: "var(--font-disp)", fontWeight: 700, fontSize: "1rem", color: "var(--ink)" }}>
          Plan verschieben
        </div>
        <p style={{ margin: "8px 0 16px", fontSize: ".82rem", color: "var(--ink-3)" }}>
          Verschiebt alle künftigen Einheiten um ganze Wochen nach hinten. Absolvierte und ausgefallene
          Einheiten bleiben, wo sie sind.
        </p>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".82rem", color: "var(--ink-2)" }}>
          <input
            type="number"
            min={1}
            max={12}
            value={weeks}
            disabled={locked}
            onChange={(e) => setWeeks(Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
            style={{
              width: 56,
              background: "rgba(255,255,255,.04)",
              border: "1px solid var(--hair)",
              borderRadius: "var(--radius-sm)",
              padding: "6px 8px",
              color: "var(--ink)",
              font: "inherit",
            }}
          />
          Woche(n) später starten
        </label>

        <div style={{ marginTop: 16, fontSize: ".82rem", color: "var(--ink-2)", minHeight: 40 }}>
          {preview.canApply ? (
            <>
              <strong>{preview.affectedCount}</strong> künftige Einheit
              {preview.affectedCount === 1 ? "" : "en"} rücken um{" "}
              <strong>
                {preview.deltaWeeks} Woche{preview.deltaWeeks === 1 ? "" : "n"}
              </strong>{" "}
              nach hinten.
              {preview.newStartDate && <> Neuer Start: <strong>{fmtDate(preview.newStartDate)}</strong>.</>}
            </>
          ) : (
            <span style={{ color: preview.error ? "var(--danger)" : "var(--ink-3)" }}>
              {preview.error ?? "Anzahl Wochen wählen."}
            </span>
          )}
        </div>

        {error && <div style={{ color: "var(--danger)", fontSize: ".8rem", marginTop: 8 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button type="button" style={BTN_STYLE} onClick={onClose} disabled={submitting}>
            {locked ? "Schließen & Plan prüfen" : "Abbrechen"}
          </button>
          {!locked && (
            <button
              type="button"
              style={PRIMARY_BTN_STYLE}
              disabled={!preview.canApply || submitting || isPending}
              onClick={() => void handleApply()}
            >
              {submitting || isPending ? "⏳ …" : "Verschieben"}
            </button>
          )}
        </div>
      </GlassCard>
    </div>
  );
}

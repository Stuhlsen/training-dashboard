/* ============================================================
   FEATURES/PLANNING/SHIFTPLANDIALOG.TSX — „Plan verschieben…"
   (Migration 0026, Punkt 1 der 6-Punkte-Liste)

   Verschiebt den GANZEN Trainingsplan um N ganze Wochen — für Athlet 4
   („bentastiic"), dessen Plan eine generierte Vorlage ist. Self-only
   (`useShiftPlan` prüft `useIsSelfAthlete`), der Button in PlanningPage.tsx
   ist zusätzlich so gegatet.

   Overlay-Muster wie ImportDialog.tsx (`useEscapeToClose`, Klick-daneben).
   Reine Vorschau-/Validierungslogik in shift-plan-dialog-view-model.ts.
   ============================================================ */

import { useState } from "react";
import { GlassCard } from "../../components/GlassCard";
import { useEscapeToClose } from "../../hooks/useEscapeToClose";
import { usePlanCards, useShiftPlan } from "../../api/hooks/usePlanCards";
import { useSessionProfile } from "../../api/hooks/useSession";
import { fmtDate, localISODate } from "../../core/format.js";
import { shiftPreview, type ShiftDirection } from "./shift-plan-dialog-view-model";

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

function pill(active: boolean): React.CSSProperties {
  return {
    ...BTN_STYLE,
    background: active ? "rgba(255,255,255,0.14)" : "transparent",
    color: active ? "var(--ink)" : "var(--ink-3)",
  };
}

export function ShiftPlanDialog({ athleteId, onClose }: ShiftPlanDialogProps) {
  const { data: cards } = usePlanCards(athleteId);
  const storedOffset = useSessionProfile()?.planOffsetWeeks ?? 0;
  const { shift, isPending } = useShiftPlan(athleteId);

  const [direction, setDirection] = useState<ShiftDirection>("later");
  const [weeks, setWeeks] = useState(1);
  const [error, setError] = useState("");

  useEscapeToClose(onClose);

  const preview = shiftPreview({
    storedOffset,
    direction,
    weeks,
    cards: cards ?? [],
    todayISO: localISODate(),
    athleteId,
  });

  async function handleApply() {
    setError("");
    const result = await shift(preview.targetOffset);
    if (!result.ok) {
      setError(result.error?.message || "Verschieben fehlgeschlagen.");
      return;
    }
    onClose();
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
          Verschiebt alle künftigen Einheiten um ganze Wochen. Absolvierte und ausgefallene Einheiten
          bleiben, wo sie sind.
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <label style={{ fontSize: ".82rem", color: "var(--ink-2)" }}>
            <input
              type="number"
              min={1}
              max={12}
              value={weeks}
              onChange={(e) => setWeeks(Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
              style={{
                width: 56,
                marginRight: 6,
                background: "rgba(255,255,255,.04)",
                border: "1px solid var(--hair)",
                borderRadius: "var(--radius-sm)",
                padding: "6px 8px",
                color: "var(--ink)",
                font: "inherit",
              }}
            />
            Woche(n)
          </label>
          <button type="button" style={pill(direction === "later")} onClick={() => setDirection("later")}>
            später starten
          </button>
          <button type="button" style={pill(direction === "earlier")} onClick={() => setDirection("earlier")}>
            früher starten
          </button>
        </div>

        <div style={{ marginTop: 16, fontSize: ".82rem", color: "var(--ink-2)", minHeight: 40 }}>
          {preview.canApply ? (
            <>
              <strong>{preview.affectedCount}</strong> künftige Einheit
              {preview.affectedCount === 1 ? "" : "en"} rücken um{" "}
              <strong>
                {Math.abs(preview.deltaWeeks)} Woche{Math.abs(preview.deltaWeeks) === 1 ? "" : "n"}
              </strong>{" "}
              {preview.deltaWeeks > 0 ? "nach hinten" : "nach vorne"}.
              {preview.newStartDate && <> Neuer Start: <strong>{fmtDate(preview.newStartDate)}</strong>.</>}
            </>
          ) : (
            <span style={{ color: preview.error ? "var(--danger)" : "var(--ink-3)" }}>
              {preview.error ?? "Anzahl und Richtung wählen."}
            </span>
          )}
        </div>

        {error && <div style={{ color: "var(--danger)", fontSize: ".8rem", marginTop: 8 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button type="button" style={BTN_STYLE} onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="button"
            style={PRIMARY_BTN_STYLE}
            disabled={!preview.canApply || isPending}
            onClick={() => void handleApply()}
          >
            {isPending ? "⏳ …" : "Verschieben"}
          </button>
        </div>
      </GlassCard>
    </div>
  );
}

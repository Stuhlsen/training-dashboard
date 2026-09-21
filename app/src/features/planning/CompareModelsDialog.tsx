/* ============================================================
   FEATURES/PLANNING/COMPAREMODELSDIALOG.TSX — Vergleich zweier
   Periodisierungsmodelle nebeneinander (Fahrplan 20 E5).

   Zeigt je Spalte einen Modell-Select, die zugehörigen
   MODEL_DESCRIPTIONS-Segmente (E1) + ModelBlockBar (E2) und einen
   „Dieses Modell übernehmen"-Knopf, der sofort ins Hauptformular
   übernimmt und das Overlay schließt.

   Overlay-Muster wie FtpRescaleDialog.tsx/ShiftPlanDialog.tsx
   (`useEscapeToClose`, Klick daneben). Keine eigene Logik über
   parseDescriptionSegments()/MODEL_BLOCK_SHARES hinaus — reine Anzeige.
   ============================================================ */

import { useState } from "react";
import { GlassCard } from "../../components/GlassCard";
import { useEscapeToClose } from "../../hooks/useEscapeToClose";
import { ModelBlockBar } from "./ModelBlockBar";
import {
  AVAILABLE_MODELS,
  MODEL_BLOCK_SHARES,
  MODEL_DESCRIPTIONS,
  MODEL_LABELS,
  parseDescriptionSegments,
  type PlanModel,
} from "./new-plan-dialog-view-model";

interface CompareModelsDialogProps {
  initialLeft: PlanModel;
  onAdopt: (model: PlanModel) => void;
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

const FIELD_STYLE: React.CSSProperties = {
  background: "rgba(255,255,255,.04)",
  border: "1px solid var(--hair)",
  borderRadius: "var(--radius-sm)",
  padding: "7px 9px",
  color: "var(--ink)",
  font: "inherit",
  fontSize: ".82rem",
  width: "100%",
  boxSizing: "border-box",
};

function ModelColumn({
  model,
  onChange,
  onAdopt,
}: {
  model: PlanModel;
  onChange: (model: PlanModel) => void;
  onAdopt: (model: PlanModel) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minWidth: 0 }}>
      <select
        style={FIELD_STYLE}
        value={model}
        onChange={(e) => onChange(e.target.value as PlanModel)}
      >
        {AVAILABLE_MODELS.map((m) => (
          <option key={m} value={m}>
            {MODEL_LABELS[m]}
          </option>
        ))}
      </select>
      <span style={{ fontSize: ".72rem" }}>
        {parseDescriptionSegments(MODEL_DESCRIPTIONS[model]).map((seg, i) => (
          <span key={i} style={{ color: seg.sign === "plus" ? "var(--z1)" : "var(--danger)" }}>
            {i > 0 && " · "}
            {seg.text}
          </span>
        ))}
      </span>
      <ModelBlockBar shares={MODEL_BLOCK_SHARES[model]} />
      <button type="button" style={PRIMARY_BTN_STYLE} onClick={() => onAdopt(model)}>
        Dieses Modell übernehmen
      </button>
    </div>
  );
}

export function CompareModelsDialog({ initialLeft, onAdopt, onClose }: CompareModelsDialogProps) {
  useEscapeToClose(onClose);

  const [left, setLeft] = useState<PlanModel>(initialLeft);
  const [right, setRight] = useState<PlanModel>(
    () => AVAILABLE_MODELS.find((m) => m !== initialLeft) ?? initialLeft
  );

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
        zIndex: 1100,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <GlassCard
        variant="strong"
        radius="22px"
        style={{ width: "100%", maxWidth: 620, padding: "26px 24px" }}
      >
        <div style={{ fontFamily: "var(--font-disp)", fontWeight: 700, fontSize: "1rem", color: "var(--ink)" }}>
          Periodisierungsmodelle vergleichen
        </div>
        <p style={{ margin: "8px 0 16px", fontSize: ".82rem", color: "var(--ink-3)" }}>
          Zwei Modelle nebeneinander. „Dieses Modell übernehmen" schließt den Vergleich und setzt
          die Auswahl im Formular.
        </p>

        <div style={{ display: "flex", gap: 18 }}>
          <ModelColumn model={left} onChange={setLeft} onAdopt={onAdopt} />
          <ModelColumn model={right} onChange={setRight} onAdopt={onAdopt} />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
          <button type="button" style={BTN_STYLE} onClick={onClose}>
            Schließen
          </button>
        </div>
      </GlassCard>
    </div>
  );
}

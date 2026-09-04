/* ============================================================
   FEATURES/PLANNING/MOVECOPYDIALOG.TSX — Wahl nach Drag & Drop
   (Bugreport 02.09.2026: keine Möglichkeit, eine Plankarte zu kopieren)

   Erscheint bei jedem erfolgreichen Drop einer Karte auf einen freien
   Zieltag (PlanningPage.tsx::handleDragEnd) — vorher schrieb ein Drop sofort
   "Verschieben". Overlay/GlassCard-Muster wie BlockDialog.tsx (kein
   gemeinsamer Dialog-Wrapper im Projekt, jede Feature-Dialog-Datei rollt
   ihr eigenes Overlay).
   ============================================================ */

import { useState } from "react";
import { GlassCard } from "../../components/GlassCard";
import { useEscapeToClose } from "../../hooks/useEscapeToClose";
import { fmtDate } from "../../core/format.js";
import type { PlanCard as PlanCardT, Result } from "../../api/types";

const ROW_BTN_STYLE: React.CSSProperties = {
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
  ...ROW_BTN_STYLE,
  background: "var(--ss)",
  borderColor: "var(--ss)",
  color: "#17110a",
  fontWeight: 600,
};

export interface MoveCopyDialogProps {
  card: PlanCardT;
  targetDate: string;
  onClose: () => void;
  onMove: () => Promise<Result>;
  onCopy: () => Promise<Result>;
}

export function MoveCopyDialog({ card, targetDate, onClose, onMove, onCopy }: MoveCopyDialogProps) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState<"move" | "copy" | null>(null);

  useEscapeToClose(onClose);

  async function run(kind: "move" | "copy", action: () => Promise<Result>) {
    setError("");
    setPending(kind);
    try {
      const result = await action();
      if (result.ok) onClose();
      else setError(result.error?.message || "Konnte nicht gespeichert werden.");
    } finally {
      setPending(null);
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
      <GlassCard
        variant="strong"
        radius="22px"
        style={{ width: "100%", maxWidth: 420, padding: "26px 24px" }}
      >
        <div style={{ fontFamily: "var(--font-disp)", fontWeight: 700, fontSize: "1rem", color: "var(--ink)" }}>
          Karte verschieben oder kopieren?
        </div>
        <p style={{ margin: "8px 0 0", fontSize: ".82rem", color: "var(--ink-3)" }}>
          "{card.name}" nach {fmtDate(targetDate)}.
        </p>

        {error && <div style={{ color: "var(--danger)", fontSize: ".8rem", marginTop: 12 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button type="button" style={ROW_BTN_STYLE} disabled={pending !== null} onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="button"
            style={ROW_BTN_STYLE}
            disabled={pending !== null}
            onClick={() => void run("copy", onCopy)}
          >
            {pending === "copy" ? "⏳ …" : "Kopieren"}
          </button>
          <button
            type="button"
            style={PRIMARY_BTN_STYLE}
            disabled={pending !== null}
            onClick={() => void run("move", onMove)}
          >
            {pending === "move" ? "⏳ …" : "Verschieben"}
          </button>
        </div>
      </GlassCard>
    </div>
  );
}

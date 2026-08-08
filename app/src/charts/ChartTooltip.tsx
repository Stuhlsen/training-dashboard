import type { ReactNode } from "react";

interface ChartTooltipProps {
  /** Cursor-Position (`clientX`/`clientY`), nicht die Tooltip-eigene Ecke. */
  x: number;
  y: number;
  children: ReactNode;
}

/* Geschätzte Maße statt Ref-Messung (Vereinfachung ggü. vanilla
   ui/dom.js::Tooltip._position, das offsetWidth/offsetHeight nutzt, aber
   selbst mit denselben Fallback-Konstanten arbeitet, solange noch nicht
   gemessen wurde — hier bewusst immer der Fallback, kein Messschritt für
   den ersten Chart nötig). */
const ESTIMATED_WIDTH = 220;
const ESTIMATED_HEIGHT = 60;

/** Positionierte Tooltip-Box für Chart-Punkt-Hover, wiederverwendbar für
 *  spätere Charts (Etappe 8f) — Ersatz für vanillas globalen
 *  `ui/dom.js::Tooltip`-Singleton, hier bewusst pro Chart lokal
 *  (`useState` in der aufrufenden Komponente), weil es in 8a noch keinen
 *  zweiten Chart gibt, mit dem ein globaler Zustand synchronisieren müsste. */
export function ChartTooltip({ x, y, children }: ChartTooltipProps) {
  const left = Math.min(x + 14, window.innerWidth - ESTIMATED_WIDTH - 8);
  const top = Math.max(y - ESTIMATED_HEIGHT - 10, 8);

  return (
    <div
      role="tooltip"
      style={{
        position: "fixed",
        left,
        top,
        zIndex: 50,
        pointerEvents: "none",
        background: "var(--surface-tooltip)",
        color: "var(--text-ink)",
        border: "1px solid var(--hair)",
        borderRadius: "var(--radius-sm)",
        padding: "8px 10px",
        fontSize: ".78rem",
        lineHeight: 1.4,
        boxShadow: "var(--e2)",
        maxWidth: ESTIMATED_WIDTH,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </div>
  );
}

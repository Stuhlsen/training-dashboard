import type { ReactNode } from "react";
import { createPortal } from "react-dom";

interface ChartTooltipProps {
  /** Cursor-Position (`clientX`/`clientY`), nicht die Tooltip-eigene Ecke. */
  x: number;
  y: number;
  children: ReactNode;
  /** Breitere Box für strukturierten Inhalt (z. B. ConsistencyCalendar.tsx'
   *  Fahrten-Liste) — Default deckt weiterhin die kurzen Ein-Zeiler der
   *  übrigen Charts ab. */
  width?: number;
  /** Optionale DOM-`id` der Box — für `aria-describedby` vom auslösenden
   *  Element (InfoTooltip.tsx). Ohne Angabe unverändert wie bisher. */
  id?: string;
}

/* Geschätzte Maße statt Ref-Messung (Vereinfachung ggü. vanilla
   ui/dom.js::Tooltip._position, das offsetWidth/offsetHeight nutzt, aber
   selbst mit denselben Fallback-Konstanten arbeitet, solange noch nicht
   gemessen wurde — hier bewusst immer der Fallback, kein Messschritt für
   den ersten Chart nötig). */
const ESTIMATED_WIDTH = 220;
const ESTIMATED_HEIGHT = 60;
const EDGE_MARGIN = 8;

/** Positionierte Tooltip-Box für Chart-Punkt-Hover, wiederverwendbar für
 *  spätere Charts (Etappe 8f) — Ersatz für vanillas globalen
 *  `ui/dom.js::Tooltip`-Singleton, hier bewusst pro Chart lokal
 *  (`useState` in der aufrufenden Komponente), weil es in 8a noch keinen
 *  zweiten Chart gibt, mit dem ein globaler Zustand synchronisieren müsste.
 *
 *  Per `createPortal` direkt unter `document.body` gerendert (19.08.2026,
 *  Bugfix): jeder Chart steckt in einer `GlassCard`
 *  (`backdrop-filter: blur(...)`, components/GlassCard.tsx) — das erzeugt
 *  einen neuen Containing Block für `position: fixed`-Nachfahren (dieselbe
 *  Spec-Regel wie bei `transform`/`filter`). Ohne Portal positioniert sich
 *  der Tooltip also relativ zur Kachel statt zum Viewport, die
 *  Rand-Klemmung unten rechnet dann mit falschen Bezugswerten und der
 *  Tooltip kann über den sichtbaren Bildschirmrand hinausragen. */
export function ChartTooltip({ x, y, children, width = ESTIMATED_WIDTH, id }: ChartTooltipProps) {
  const left = Math.max(EDGE_MARGIN, Math.min(x + 14, window.innerWidth - width - EDGE_MARGIN));
  const top = Math.max(EDGE_MARGIN, Math.min(y - ESTIMATED_HEIGHT - 10, window.innerHeight - ESTIMATED_HEIGHT - EDGE_MARGIN));

  return createPortal(
    <div
      role="tooltip"
      id={id}
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
        maxWidth: width,
        // "pre-line" statt "nowrap" (Bug-Report 23.08.2026: Text lief über
        // die Tooltip-Kachel hinaus) — bricht lange Zeilen innerhalb von
        // maxWidth um. Strukturierter Inhalt (Tabellen-Zeilen mit eigenem
        // whiteSpace/Ellipsis, z. B. ConsistencyCalendar.tsx) steuert sein
        // Umbruchverhalten selbst und überschreibt das lokal.
        whiteSpace: "pre-line",
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

/** Eine Zeile "Datum | Bezeichnung | km" für Tooltips, die eine Fahrt/einen
 *  Tag beschreiben — geteilt zwischen ConsistencyCalendar.tsx (mehrere
 *  Zeilen je Woche) und WeekReviewCard.tsx (eine Zeile je Tag), damit beide
 *  optisch identisch bleiben statt zweier separat gepflegter Kopien
 *  (Review-Kommentar 23.08.2026: "sollte alles einheitlich sein"). */
export function TooltipSessionRow({ date, label, km }: { date: string; label: string; km?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: ".72rem" }}>
      <span style={{ color: "var(--text-soft)", flexShrink: 0 }}>{date}</span>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      {km != null && km > 0 && (
        <span style={{ color: "var(--text-soft)", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{km} km</span>
      )}
    </div>
  );
}

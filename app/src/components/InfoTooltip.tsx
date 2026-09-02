/* ============================================================
   COMPONENTS/INFOTOOLTIP.TSX — Erklär-Tooltip für eine Abkürzung/einen
   Fachbegriff. Umschließt ein Label; bei Hover UND Fokus erscheint die
   `ChartTooltip`-Box (gleiche Optik wie die Wetter-Tooltips im
   Fahrtenbuch) mit dem Glossar-Eintrag.

   Schichtenregel: liegt in `components/`, importiert nur `charts/ChartTooltip`
   (reines Rendering) und `glossary` (reine Daten) — kein `api/`.

   Verwendung:
     <InfoTooltip termKey="ctl">CTL Fitness</InfoTooltip>

   Unbekannter `termKey` → nur `children`, kein Marker, keine Handler
   (kein Crash bei Tippfehler, keine tote Affordance).
   ============================================================ */

import { useId, useRef, useState, type ReactNode } from "react";
import { ChartTooltip } from "../charts/ChartTooltip";
import { glossaryEntry } from "../glossary";

interface InfoTooltipProps {
  /** Glossar-Key (`app/src/glossary.ts`). */
  termKey: string;
  children: ReactNode;
  /** Breite der Tooltip-Box (Default 240). */
  width?: number;
  /** Gepunktete Unterstreichung am Begriff (Default true). `false` für
   *  Kontexte mit eigenem Rahmen/Hintergrund (z. B. ein Typ-Badge), wo die
   *  Unterstreichung mit dem vorhandenen Styling kollidiert — Hover/Fokus,
   *  ⓘ-Marker und A11y bleiben unverändert. */
  underline?: boolean;
}

interface Pos {
  x: number;
  y: number;
}

export function InfoTooltip({ termKey, children, width = 240, underline = true }: InfoTooltipProps) {
  const entry = glossaryEntry(termKey);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  // Hover und Fokus getrennt, damit ein `mouseleave` bei noch bestehendem
  // Tastatur-Fokus die Box nicht wegnimmt (und umgekehrt).
  const [hoverPos, setHoverPos] = useState<Pos | null>(null);
  const [focusPos, setFocusPos] = useState<Pos | null>(null);

  // Vor allen Hooks steht nichts Bedingtes — der Early-Return kommt erst hier.
  if (!entry) return <>{children}</>;

  const pos = hoverPos ?? focusPos;

  function openFromRect() {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Mittelpunkt oben — ChartTooltip klemmt selbst an die Viewport-Ränder
    // und setzt die Box oberhalb des Bezugspunkts.
    setFocusPos({ x: r.left + r.width / 2, y: r.top });
  }

  function close() {
    setHoverPos(null);
    setFocusPos(null);
  }

  return (
    <span
      ref={ref}
      tabIndex={0}
      aria-describedby={pos ? id : undefined}
      onMouseEnter={(e) => setHoverPos({ x: e.clientX, y: e.clientY })}
      onMouseMove={(e) => setHoverPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setHoverPos(null)}
      onFocus={openFromRect}
      onBlur={() => setFocusPos(null)}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
      // In klickbaren Kontexten (sortierbare Tabellen-Header) darf die
      // Hilfe-Interaktion die Umgebungsaktion nicht auslösen.
      onClick={(e) => e.stopPropagation()}
      style={{
        cursor: "help",
        ...(underline
          ? {
              textDecoration: "underline dotted",
              textDecorationColor: "var(--ink-3)",
              textUnderlineOffset: "0.2em",
            }
          : null),
      }}
    >
      {children}
      <span
        aria-hidden="true"
        style={{ marginLeft: "0.25em", fontSize: "0.7em", color: "var(--ink-3)" }}
      >
        ⓘ
      </span>
      {pos && (
        <ChartTooltip x={pos.x} y={pos.y} width={width} id={id}>
          <div style={{ fontWeight: 700 }}>{entry.title}</div>
          <div style={{ marginTop: 2 }}>{entry.text}</div>
        </ChartTooltip>
      )}
    </span>
  );
}

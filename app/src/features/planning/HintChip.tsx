import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { summarizeCardHints } from "../../core/plan-feedback.js";

export interface HintItem {
  severity: "info" | "warning";
  text: string;
}

interface HintChipProps {
  items: HintItem[];
  idSeed: string;
}

/* Modul-lokaler Store statt Context/Prop-Drilling: nur EIN Tooltip
   gleichzeitig offen (Port von ui/planned.js::openHintChip) — überlappende
   Tooltips bei eng stehenden Karten sind sonst unlesbar. `useSyncExternalStore`
   hält die React-Komponenten synchron, die Entscheidungslogik in den
   Handlern liest aber bewusst direkt die Modul-Variable statt des u.U. noch
   veralteten Render-Werts (derselbe Grund, warum Vanillas Event-Handler nie
   race-anfällig waren: keine Render-Batching-Verzögerung dazwischen). */
let openChipId: string | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return openChipId;
}

function openChip(id: string) {
  if (openChipId === id) return;
  openChipId = id;
  notify();
}

function closeChip(id: string) {
  if (openChipId !== id) return;
  openChipId = null;
  notify();
}

function hoverCapable(): boolean {
  return window.matchMedia?.("(hover: hover)")?.matches ?? true;
}

const CHIP_STYLE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "3px 9px",
  borderRadius: "var(--pill)",
  fontSize: ".68rem",
  fontWeight: 600,
  border: "1px solid var(--hair)",
  background: "rgba(255,255,255,.04)",
  cursor: "pointer",
  font: "inherit",
};

interface HintSummary {
  count: number;
  severity: "info" | "warning";
  label: string;
  visible: HintItem[];
  moreCount: number;
}

/** Kollabierte Konflikt-/Hinweismeldungen einer Karte zu einem Chip
 *  ("N Hinweise") — Port von ui/planned.js::_renderHintChip +
 *  _positionHintTooltip. `null` bei leerer `items`-Liste (kein Chip). */
export function HintChip({ items, idSeed }: HintChipProps) {
  const hint = summarizeCardHints(items) as HintSummary | null;
  const chipId = `hint-chip-${idSeed}`;
  const tooltipId = `hint-tooltip-${idSeed}`;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  // Ein Maus-Klick löst in dieser Reihenfolge mousedown → focus → mouseup →
  // click aus. Ohne diese Guard öffnet `onFocus` den Chip VOR `onClick` —
  // der Klick-Handler sieht dann bereits "offen" und schließt ihn sofort
  // wieder zu (per Playwright-Verifikation gegen dashboard-dev gefunden,
  // reines Code-Lesen hätte das Timing nicht gezeigt). Tastatur-Tab-Fokus
  // (kein vorheriges mousedown) öffnet weiterhin als Vorschau.
  const suppressNextFocusOpen = useRef(false);
  const isOpen = useSyncExternalStore(subscribe, getSnapshot) === chipId;
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    // Kein setPosition(null) beim Schließen nötig: das Tooltip-Div wird
    // ohnehin nur bei isOpen gerendert (s. unten), ein stehen gelassener
    // alter `position`-Wert ist während des geschlossenen Zustands
    // unbeobachtbar und wird vor dem nächsten Öffnen hier neu berechnet.
    if (!isOpen) return;
    function reposition() {
      const button = buttonRef.current;
      const tooltip = tooltipRef.current;
      if (!button || !tooltip) return;
      const margin = 8;
      const rect = button.getBoundingClientRect();
      const tw = tooltip.offsetWidth;
      const th = tooltip.offsetHeight;
      let left = rect.left;
      if (left + tw > window.innerWidth - margin) left = Math.max(margin, window.innerWidth - margin - tw);
      let top = rect.bottom + 6;
      if (top + th > window.innerHeight - margin) top = Math.max(margin, rect.top - th - 6);
      setPosition({ left, top });
    }
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeChip(chipId);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, chipId]);

  if (!hint) return null;

  const color = hint.severity === "warning" ? "var(--danger)" : "var(--warn)";

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={tooltipId}
        style={{ ...CHIP_STYLE, color }}
        onMouseDown={() => {
          suppressNextFocusOpen.current = true;
        }}
        onClick={() => {
          // Auf hover-fähigen Geräten hat `mouseenter` den Chip bei einem
          // Maus-Klick bereits geöffnet (Reihenfolge: mouseenter → mousedown
          // → focus → click) — ein Toggle hier würde ihn sofort wieder
          // schließen, während die Maus noch auf dem Chip steht. `mouseleave`
          // übernimmt das Schließen. Auf Touch-Geräten (kein hover-Event
          // überhaupt) bleibt Klick der einzige Umschalter.
          if (hoverCapable()) {
            openChip(chipId);
            return;
          }
          if (openChipId === chipId) closeChip(chipId);
          else openChip(chipId);
        }}
        onMouseUp={() => {
          // Ein zweiter Klick auf ein BEREITS fokussiertes Element löst kein
          // erneutes `focus`-Event aus (Browser feuern das nicht auf ein
          // schon fokussiertes Element) — ohne diesen Reset bliebe die Guard
          // von `onMouseDown` "hängen" und würde einen späteren echten
          // Tab-Fokus (ohne vorheriges mousedown) fälschlich unterdrücken.
          suppressNextFocusOpen.current = false;
        }}
        onFocus={() => {
          if (suppressNextFocusOpen.current) {
            suppressNextFocusOpen.current = false;
            return;
          }
          openChip(chipId);
        }}
        onBlur={() => closeChip(chipId)}
        onMouseEnter={() => hoverCapable() && openChip(chipId)}
        onMouseLeave={() => hoverCapable() && closeChip(chipId)}
      >
        <span aria-hidden="true">⚠️</span> {hint.label}
      </button>
      {isOpen && (
        <div
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          style={{
            position: "fixed",
            left: position?.left ?? 0,
            top: position?.top ?? 0,
            visibility: position ? "visible" : "hidden",
            zIndex: 50,
            maxWidth: 280,
            padding: "10px 12px",
            borderRadius: "var(--radius-sm)",
            background: "var(--glass-2)",
            border: "1px solid var(--hair)",
            boxShadow: "var(--e3)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            fontSize: ".76rem",
          }}
        >
          {hint.visible.map((item, i) => (
            <div key={i} style={{ color: item.severity === "warning" ? "var(--danger)" : "var(--ink-2)" }}>
              {item.text}
            </div>
          ))}
          {hint.moreCount > 0 && <div style={{ color: "var(--ink-3)", fontStyle: "italic" }}>+{hint.moreCount} weitere</div>}
        </div>
      )}
    </>
  );
}

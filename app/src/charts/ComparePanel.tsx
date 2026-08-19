import type { buildCompare } from "../core/compare.js";
import type { CompareSlot } from "../api/hooks/useExplorerCompare";

type CompareMetrics = ReturnType<typeof buildCompare>["a"]["metrics"];

interface ComparePanelProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  slotA: CompareSlot | null;
  slotB: CompareSlot | null;
  metricsA: CompareMetrics;
  metricsB: CompareMetrics;
  /** true nur, wenn `enabled` UND beide Slots gemerkt sind — steuert, ob
   *  Kennzahlen angezeigt werden oder nur "gemerkt, Modus einschalten". */
  compareActive: boolean;
  /** Aktuelles Brush-Fenster als A bzw. B übernehmen — `undefined`
   *  deaktiviert den jeweiligen Button (kein Fenster geladen). */
  onSaveSlot: (slot: "a" | "b") => void;
  canSave: boolean;
}

function fmt1(v: number | null) {
  return v == null ? "–" : String(Math.round(v * 10) / 10);
}

function fmtSigned(v: number | null) {
  if (v == null) return "–";
  return `${v > 0 ? "+" : ""}${fmt1(v)}`;
}

const LABEL_ROW: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, fontSize: ".82rem", color: "var(--ink-2)", cursor: "pointer" };

const SLOT_BTN: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--hair)",
  background: "transparent",
  color: "var(--ink-2)",
  fontSize: ".78rem",
  cursor: "pointer",
};

/** Kennzahlen-Box für einen Slot — drei Zustände wie im Vanilla-Original
 *  (assets/js/ui/charts/pmc.js::renderMetrics): nicht gemerkt / gemerkt aber
 *  Modus aus / aktive Kennzahlen. */
function SlotMetrics({ label, color, slot, metrics, compareActive }: {
  label: string;
  color: string;
  slot: CompareSlot | null;
  metrics: CompareMetrics;
  compareActive: boolean;
}) {
  return (
    <dl style={{ margin: 0, fontSize: ".78rem", color: "var(--ink-2)" }}>
      <dt style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }} />
        {label}
      </dt>
      {!slot && <dd style={{ margin: 0, color: "var(--ink-3)" }}>noch nicht gemerkt</dd>}
      {slot && !compareActive && <dd style={{ margin: 0, color: "var(--ink-3)" }}>gemerkt — Vergleichsmodus einschalten für Kennzahlen</dd>}
      {slot && compareActive && (
        <>
          <dd style={{ margin: 0 }}>Σ TSS {Math.round(metrics.sumTss)}</dd>
          <dd style={{ margin: 0 }}>⌀ CTL {fmt1(metrics.avgCtl)}</dd>
          <dd style={{ margin: 0 }}>Rampe {fmtSigned(metrics.ramp)}</dd>
          <dd style={{ margin: 0 }}>Harte Tage {metrics.hardDays}</dd>
        </>
      )}
    </dl>
  );
}

/** Bedienelemente für den Vergleichsmodus (Etappe 8e, docs/phase-5-konzept-
 *  explorer.md §5) — Port von index.html's `#pmc-compare`-Markup (Toggle +
 *  zwei "Als A/B merken"-Buttons + Kennzahlen). Reine Props-Komponente wie
 *  WhatIfPanel: hält keinen eigenen Zustand, der Aufrufer (ExplorerSection)
 *  verdrahtet `useExplorerCompare` + `useExplorerRange`. */
export function ComparePanel({ enabled, onEnabledChange, slotA, slotB, metricsA, metricsB, compareActive, onSaveSlot, canSave }: ComparePanelProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label style={LABEL_ROW}>
        <input type="checkbox" checked={enabled} onChange={(e) => onEnabledChange(e.target.checked)} />
        <span>Vergleichsmodus</span>
      </label>

      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" style={SLOT_BTN} disabled={!canSave} onClick={() => onSaveSlot("a")}>
          Als A merken
        </button>
        <button type="button" style={SLOT_BTN} disabled={!canSave} onClick={() => onSaveSlot("b")}>
          Als B merken
        </button>
      </div>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <SlotMetrics label="Zeitraum A" color="var(--z2)" slot={slotA} metrics={metricsA} compareActive={compareActive} />
        <SlotMetrics label="Zeitraum B" color="var(--ss)" slot={slotB} metrics={metricsB} compareActive={compareActive} />
      </div>
    </div>
  );
}

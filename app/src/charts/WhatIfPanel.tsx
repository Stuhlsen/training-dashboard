import type { ScenarioParams } from "../api/hooks/useExplorerScenario";

interface WhatIfPanelProps {
  scenario: ScenarioParams;
  onParamsChange: (patch: Partial<Pick<ScenarioParams, "weekTssPct" | "restDays" | "rampRatePct">>) => void;
  onEnabledChange: (enabled: boolean) => void;
}

function fmtPct(v: number) {
  return `${v > 0 ? "+" : ""}${v}%`;
}

const LABEL_ROW: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: ".76rem",
  color: "var(--ink-3)",
  marginBottom: 4,
};

const SLIDER: React.CSSProperties = { width: "100%", accentColor: "var(--role-primary)", cursor: "pointer" };

/** Regler für das What-if-Szenario (Etappe 8d, docs/phase-5-konzept-
 *  explorer.md §6, Variante 4A) — Port von index.html's `#pmc-scenario`-
 *  Markup (Toggle + 3 Range-Inputs). Min/Max/Step 1:1 aus dem Vanilla-
 *  Original übernommen. Reine Props-Komponente: hält keinen eigenen
 *  Zustand, der Aufrufer (ExplorerSection) verdrahtet `useExplorerScenario`. */
export function WhatIfPanel({ scenario, onParamsChange, onEnabledChange }: WhatIfPanelProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".82rem", color: "var(--ink-2)", cursor: "pointer" }}>
        <input type="checkbox" checked={scenario.enabled} onChange={(e) => onEnabledChange(e.target.checked)} />
        <span>What-if-Szenario</span>
      </label>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <div style={LABEL_ROW}>
            <span>Wochen-TSS</span>
            <b style={{ color: "var(--ink-2)" }}>{fmtPct(scenario.weekTssPct)}</b>
          </div>
          <input
            type="range"
            min={-50}
            max={50}
            step={5}
            value={scenario.weekTssPct}
            onChange={(e) => onParamsChange({ weekTssPct: Number(e.target.value) })}
            aria-label="Wochen-TSS-Änderung in Prozent für das What-if-Szenario"
            style={SLIDER}
          />
        </div>

        <div>
          <div style={LABEL_ROW}>
            <span>Zusätzliche Ruhetage/Woche</span>
            <b style={{ color: "var(--ink-2)" }}>{scenario.restDays}</b>
          </div>
          <input
            type="range"
            min={0}
            max={3}
            step={1}
            value={scenario.restDays}
            onChange={(e) => onParamsChange({ restDays: Number(e.target.value) })}
            aria-label="Zusätzliche Ruhetage pro Woche für das What-if-Szenario"
            style={SLIDER}
          />
        </div>

        <div>
          <div style={LABEL_ROW}>
            <span>Rampenrate</span>
            <b style={{ color: "var(--ink-2)" }}>{fmtPct(scenario.rampRatePct)}</b>
          </div>
          <input
            type="range"
            min={-20}
            max={30}
            step={5}
            value={scenario.rampRatePct}
            onChange={(e) => onParamsChange({ rampRatePct: Number(e.target.value) })}
            aria-label="Erzwungener Wochen-Zuwachs in Prozent für das What-if-Szenario"
            style={SLIDER}
          />
        </div>
      </div>
    </div>
  );
}

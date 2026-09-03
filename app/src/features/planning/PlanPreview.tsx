/* ============================================================
   FEATURES/PLANNING/PLANPREVIEW.TSX — Wochenübersicht eines erzeugten Plans
   (Fahrplan 8 E5, Entscheidung 15).

   Reine Darstellung von `GeneratedPlan` (E2): FTP-Ziel, Warnungen, je Woche
   Phase / Ziel-TSS / Qualitätstage / Erholungs- und Testmarkierung. Kein
   Schreibpfad — „Übernehmen" liegt im aufrufenden Dialog (scharf ab E6).
   ============================================================ */

import { phaseColor } from "../../config";
import { fmtDate } from "../../core/format.js";
import { weekDisplayLabels } from "../../core/week-labels.js";
import type { GeneratedPlan, GeneratedWeek } from "./new-plan-dialog-view-model";

interface PlanPreviewProps {
  plan: GeneratedPlan;
}

export function PlanPreview({ plan }: PlanPreviewProps) {
  const totalTss = plan.weeks.reduce((s, w) => s + w.targetTss, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "baseline" }}>
        <Metric value={String(plan.weeks.length)} label="Wochen" />
        <Metric value={plan.ftpTarget != null ? `${plan.ftpTarget} W` : "–"} label="FTP-Ziel" />
        <Metric value={Math.round(totalTss).toLocaleString("de-DE")} label="TSS gesamt" />
      </div>

      {plan.warnings.length > 0 && (
        <ul
          style={{
            margin: 0,
            padding: "10px 14px 10px 30px",
            borderRadius: "var(--radius-sm)",
            background: "rgba(217,79,79,.10)",
            border: "1px solid rgba(217,79,79,.35)",
            color: "var(--ink-2)",
            fontSize: ".82rem",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {plan.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {plan.weeks.map((w) => (
          <WeekRow key={w.index} week={w} />
        ))}
      </div>
    </div>
  );
}

function WeekRow({ week }: { week: GeneratedWeek }) {
  const label = weekDisplayLabels([week.isoWeek])[0] ?? week.isoWeek;
  const quality = week.cards.filter((c) => c.isQuality).length;
  const hasTest = week.cards.some((c) => c.isTest);
  const sessions = week.cards.length;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "68px 120px 1fr auto",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        borderRadius: "var(--radius-sm)",
        background: week.isRecovery ? "rgba(255,255,255,.02)" : "rgba(255,255,255,.045)",
        border: "1px solid var(--hair)",
        fontSize: ".82rem",
        color: "var(--ink-2)",
        opacity: week.isRecovery ? 0.75 : 1,
      }}
    >
      <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink-3)" }}>{label}</span>

      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span
          aria-hidden="true"
          style={{ width: 8, height: 8, borderRadius: 2, background: phaseColor(week.phase), flex: "none" }}
        />
        {week.phase}
      </span>

      <span style={{ color: "var(--ink-3)" }}>
        {sessions} Einheit{sessions === 1 ? "" : "en"}
        {quality > 0 && <> · {quality} Qualität</>}
        {hasTest && <> · 🎯 FTP-Test</>}
        {week.isRecovery && <> · Erholung</>}
        <span style={{ marginLeft: 8, color: "var(--ink-3)" }}>
          ab {fmtDate(week.start)}
        </span>
      </span>

      <span style={{ fontFamily: "var(--font-disp)", fontWeight: 600, color: "var(--ink)" }}>
        {week.targetTss} TSS
      </span>
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontFamily: "var(--font-disp)", fontSize: "1.15rem", fontWeight: 600, color: "var(--ink)" }}>
        {value}
      </span>
      <span style={{ fontSize: ".68rem", color: "var(--ink-3)", letterSpacing: ".08em", textTransform: "uppercase" }}>
        {label}
      </span>
    </div>
  );
}

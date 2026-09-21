/* ============================================================
   FEATURES/PLANNING/PLANPREVIEW.TSX — Wochenübersicht eines erzeugten Plans
   (Fahrplan 8 E5, Entscheidung 15).

   Reine Darstellung von `GeneratedPlan` (E2): FTP-Ziel, Warnungen, je Woche
   Phase / Ziel-TSS / Qualitätstage / Erholungs- und Testmarkierung. Kein
   Schreibpfad — „Übernehmen" liegt im aufrufenden Dialog (scharf ab E6).
   ============================================================ */

import { useState } from "react";
import { phaseColor } from "../../config";
import { fmtDate, fmtPace, paceSecFromSpeedKmh } from "../../core/format.js";
import { weekDisplayLabels } from "../../core/week-labels.js";
import { InfoTooltip } from "../../components/InfoTooltip";
import { typeColor, typeIcon } from "./planning-view-model";
import type { ActiveSport } from "../../api/hooks/useActiveSport";
import { WEEKDAY_LABELS, type GeneratedCard, type GeneratedPlan, type GeneratedWeek } from "./new-plan-dialog-view-model";

/** ISO-Wochentag (1=Mo..7=So) eines "YYYY-MM-DD"-Datums — für die
 *  Tages-Chips/Detailzeilen der Vorschau. */
function isoWeekdayOf(dateISO: string): number {
  const d = new Date(`${dateISO}T00:00:00`);
  return ((d.getDay() + 6) % 7) + 1;
}

function weekdayShort(dateISO: string): string {
  return WEEKDAY_LABELS.find((w) => w.iso === isoWeekdayOf(dateISO))?.short ?? "";
}

/** Distanz für die Pace-Umrechnung je Sportart (m) — min/km beim Laufen,
 *  min/100m beim Schwimmen (V2, Fahrplan 14 E6). */
const PACE_DISTANCE_M: Record<"run" | "swim", number> = { run: 1000, swim: 100 };
const PACE_UNIT_LABEL: Record<"run" | "swim", string> = { run: "/km", swim: "/100m" };

interface PlanPreviewProps {
  plan: GeneratedPlan;
  /** Aktiver Sport-Tab (Fahrplan 14 E6) — bestimmt, ob die Kopf-Metrik FTP
   *  oder Ziel-Pace zeigt. Default "ride" für Aufrufer vor E6. */
  sport?: ActiveSport;
  /** Vom Athleten eingegebenes Schwellenpace-Ziel (km/h, `PlanGeneratorInput.
   *  thresholdSpeedTarget`) — der Generator leitet für sport !== "ride" (noch)
   *  kein `ftpTarget`-Äquivalent selbst ab (Fahrplan 14 E1, bewusst offener
   *  Punkt), deshalb kommt der Wert hier aus dem Input, nicht aus `plan`. */
  thresholdSpeedTarget?: number | null;
}

export function PlanPreview({ plan, sport = "ride", thresholdSpeedTarget = null }: PlanPreviewProps) {
  const totalTss = plan.weeks.reduce((s, w) => s + w.targetTss, 0);
  const goalMetric =
    sport === "ride"
      ? { value: plan.ftpTarget != null ? `${plan.ftpTarget} W` : "–", label: "FTP-Ziel" }
      : {
          value:
            thresholdSpeedTarget != null
              ? `${fmtPace(paceSecFromSpeedKmh(thresholdSpeedTarget, PACE_DISTANCE_M[sport]))}${PACE_UNIT_LABEL[sport]}`
              : "–",
          label: "Ziel-Pace",
        };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "baseline" }}>
        <Metric value={String(plan.weeks.length)} label="Wochen" />
        <Metric value={goalMetric.value} label={goalMetric.label} />
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
  const [open, setOpen] = useState(false);
  const label = weekDisplayLabels([week.isoWeek])[0] ?? week.isoWeek;
  const highlightCards = week.cards.filter((c) => c.isQuality || c.isTest);
  const quality = week.cards.filter((c) => c.isQuality).length;
  const hasTest = week.cards.some((c) => c.isTest);
  const sessions = week.cards.length;
  const expandable = sessions > 0;

  return (
    <div
      style={{
        borderRadius: "var(--radius-sm)",
        background: week.isRecovery ? "rgba(255,255,255,.02)" : "rgba(255,255,255,.045)",
        border: "1px solid var(--hair)",
        opacity: week.isRecovery ? 0.75 : 1,
      }}
    >
      <div
        role={expandable ? "button" : undefined}
        tabIndex={expandable ? 0 : undefined}
        aria-expanded={expandable ? open : undefined}
        onClick={expandable ? () => setOpen((v) => !v) : undefined}
        onKeyDown={
          expandable
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOpen((v) => !v);
                }
              }
            : undefined
        }
        style={{
          display: "grid",
          gridTemplateColumns: "68px 120px 1fr auto 14px",
          alignItems: "center",
          gap: 10,
          padding: "8px 12px",
          fontSize: ".82rem",
          color: "var(--ink-2)",
          cursor: expandable ? "pointer" : "default",
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

        <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
          <span style={{ color: "var(--ink-3)" }}>
            {sessions} Einheit{sessions === 1 ? "" : "en"}
            {quality > 0 && <> · {quality} Qualität</>}
            {hasTest && <> · 🎯 FTP-Test</>}
            {week.isRecovery && <> · Erholung</>}
            <span style={{ marginLeft: 8 }}>ab {fmtDate(week.start)}</span>
          </span>
          {highlightCards.map((c) => (
            <span
              key={c.date}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                padding: "1px 7px",
                borderRadius: "var(--pill)",
                border: `1px solid ${typeColor(c.typ)}66`,
                color: typeColor(c.typ),
                fontSize: ".72rem",
                whiteSpace: "nowrap",
              }}
            >
              <span aria-hidden="true">{typeIcon(c.typ)}</span>
              {weekdayShort(c.date)} {c.typ}
            </span>
          ))}
        </span>

        <span style={{ textAlign: "right" }}>
          <span style={{ fontFamily: "var(--font-disp)", fontWeight: 600, color: "var(--ink)" }}>
            <InfoTooltip termKey="tss" underline={false}>
              {week.targetTss} TSS
            </InfoTooltip>
          </span>
          {week.loadContext && (
            <div style={{ fontSize: ".7rem", color: "var(--ink-3)" }}>{week.loadContext}</div>
          )}
        </span>

        <span aria-hidden="true" style={{ color: "var(--ink-3)", textAlign: "right" }}>
          {expandable ? (open ? "▾" : "▸") : ""}
        </span>
      </div>

      {open && expandable && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            padding: "0 12px 10px 90px",
          }}
        >
          {week.cards.map((c) => (
            <CardDetailRow key={c.date} card={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function CardDetailRow({ card }: { card: GeneratedCard }) {
  const watts = (card.workout as { watts?: [number, number] } | null)?.watts;
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 10,
        fontSize: ".76rem",
        color: "var(--ink-3)",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <span aria-hidden="true">{typeIcon(card.typ)}</span>
        <span style={{ fontFamily: "var(--font-mono)" }}>{weekdayShort(card.date)}</span>
        <span style={{ color: "var(--ink-2)" }}>{card.name}</span>
      </span>
      <span style={{ whiteSpace: "nowrap" }}>
        {card.durationMin} min · {card.tssPlanned} TSS
        {watts && <> · {watts[0]}–{watts[1]} W</>}
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

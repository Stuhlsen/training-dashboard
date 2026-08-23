import { useState } from "react";
import { GlassCard } from "../../components/GlassCard";
import { ChartTooltip, TooltipSessionRow } from "../../charts/ChartTooltip";
import { fmt, fmtDate, fmtDuration } from "../../core/format.js";
import type { buildWeekReview } from "../../core/weekreview.js";

type WeekReview = NonNullable<ReturnType<typeof buildWeekReview>>;

interface DayTooltip {
  x: number;
  y: number;
  day: WeekReview["days"][number];
}

const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function Chip({ value, unit }: { value: string; unit?: string }) {
  return (
    <span style={{ fontSize: ".82rem", color: "var(--ink-2)" }}>
      <b style={{ fontFamily: "var(--font-disp)", color: "var(--ink)" }}>{value}</b>
      {unit ? ` ${unit}` : ""}
    </span>
  );
}

/** Mo–So-Überblick der Woche — welcher Tag hatte eine Einheit, welcher war
 *  Ruhetag (Review-Kommentar 23.08.2026: Kachel wirkte groß mit wenig
 *  Inhalt). Nutzt `review.days` (core/weekreview.js), keine eigene
 *  Datumslogik hier. Hover-Tooltip teilt sich `ChartTooltip`/
 *  `TooltipSessionRow` mit ConsistencyCalendar.tsx statt eines nativen
 *  `title`-Attributs — optisch identisch statt zweier eigenständiger
 *  Tooltip-Stile (Review-Kommentar: "sollte alles einheitlich sein"). */
function DayStrip({ days }: { days: WeekReview["days"] }) {
  const [tooltip, setTooltip] = useState<DayTooltip | null>(null);

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
        {days.map((d, i) => (
          <div
            key={d.dateISO}
            onMouseEnter={(e) => setTooltip({ x: e.clientX, y: e.clientY, day: d })}
            onMouseLeave={() => setTooltip(null)}
            style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, cursor: "default" }}
          >
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-label)", color: "var(--ink-3)" }}>{WEEKDAY_LABELS[i]}</span>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: d.label ? "var(--ok)" : "var(--hair)",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: "var(--fs-label)",
                color: d.label ? "var(--ink-2)" : "var(--ink-3)",
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {d.label ?? "–"}
            </span>
          </div>
        ))}
      </div>
      {tooltip && (
        <ChartTooltip x={tooltip.x} y={tooltip.y}>
          <TooltipSessionRow date={fmtDate(tooltip.day.dateISO)} label={tooltip.day.label ?? "Ruhetag"} km={tooltip.day.km} />
        </ChartTooltip>
      )}
    </div>
  );
}

/** Port von `ui/panels.js::renderWeekReview()`. Sitzt hier neben
 *  Trainingskonsistenz/Bestleistungen statt in der alten `insight-row`
 *  (Vanilla) — das Hero-Weitwinkel-Redesign hat Tagesform/Wochenrückblick/
 *  Befinden/Events nicht als eine gemeinsame Reihe übernommen; Farben
 *  folgen dem Hero-Token-Satz (`--ok`/`--warn` statt Vanillas `--z1`/`--gold`,
 *  die es in diesem CSS-Baum nicht gibt). */
export function WeekReviewCard({ review }: { review: WeekReview | null }) {
  return (
    <GlassCard variant="soft" style={{ padding: "20px 22px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: "var(--fs-tile-title)", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--ink)", fontWeight: 700 }}>
          Wochenrückblick
        </span>
        {review && (
          <span style={{ fontSize: ".72rem", color: "var(--ink-3)" }}>
            {fmtDate(review.from)} – {fmtDate(review.to)}
          </span>
        )}
      </div>

      {!review ? (
        <p style={{ margin: "10px 0 0", fontSize: ".85rem", color: "var(--ink-3)" }}>
          Letzte Woche keine Fahrten erfasst — der Rückblick erscheint nach der nächsten Trainingswoche.
        </p>
      ) : (
        <>
          <DayStrip days={review.days} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 14 }}>
            <Chip value={fmt(review.km)} unit="km" />
            <Chip value={String(review.rides)} unit="Fahrten" />
            <Chip value={fmtDuration(review.min)} />
            <Chip value={String(review.tss)} unit="TSS" />
            {review.plan && (
              <span
                style={{
                  fontSize: ".82rem",
                  fontWeight: 600,
                  color: review.plan.done >= review.plan.planned ? "var(--ok)" : "var(--warn)",
                }}
              >
                Plan {review.plan.done}/{review.plan.planned} ✓
              </span>
            )}
          </div>
          {review.best && (
            <p style={{ margin: "10px 0 0", fontSize: ".85rem", color: "var(--ink-2)" }}>
              ⚡ Stärkste Einheit: <b style={{ color: "var(--ink)" }}>{review.best.name}</b>
              {review.best.np ? ` · NP ${review.best.np} W` : ""}
              {review.best.km ? ` · ${fmt(review.best.km)} km` : ""}
            </p>
          )}
          {review.weatherNote && (
            <p style={{ margin: "6px 0 0", fontSize: ".85rem", color: "var(--ink-2)" }}>🌤️ {review.weatherNote}</p>
          )}
        </>
      )}
    </GlassCard>
  );
}

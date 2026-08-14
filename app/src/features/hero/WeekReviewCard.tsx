import { GlassCard } from "../../components/GlassCard";
import { fmt, fmtDate, fmtDuration } from "../../core/format.js";
import type { buildWeekReview } from "../../core/weekreview.js";

type WeekReview = NonNullable<ReturnType<typeof buildWeekReview>>;

function Chip({ value, unit }: { value: string; unit?: string }) {
  return (
    <span style={{ fontSize: ".82rem", color: "var(--ink-2)" }}>
      <b style={{ fontFamily: "var(--font-disp)", color: "var(--ink)" }}>{value}</b>
      {unit ? ` ${unit}` : ""}
    </span>
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
        <span style={{ fontSize: ".7rem", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>
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
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 12 }}>
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

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GlassCard } from "../../components/GlassCard";
import { LEVEL_COLOR } from "./BriefingCard";
import type { HeroBriefing } from "./hero-view-model";
import { LEVEL_LABEL, SLEEP_SCORE_DEVICE_NOTE } from "../../core/readiness.js";
import type { assessReadiness, getSubjectiveReadiness } from "../../core/readiness.js";
import { subjectiveSignal } from "../../core/briefing.js";

type Readiness = NonNullable<ReturnType<typeof assessReadiness>>;
type Metric = Readiness["metrics"][number];
type Subjective = ReturnType<typeof getSubjectiveReadiness> | null;
/** Fertig abgeleitetes Befinden-Signal ({status, text}) oder `null`, wenn
 *  kein Check-in vorliegt (core/briefing.js::subjectiveSignal). */
type SubjSignal = ReturnType<typeof subjectiveSignal>;

const STATUS_COLOR: Record<Metric["status"], string> = {
  ok: "var(--ok)",
  caution: "var(--warn)",
  alert: "var(--danger)",
  nodata: "var(--ink-3)",
};

const CONFIDENCE_BADGE: Record<Metric["confidence"], string> = {
  vorhanden: "",
  ausstehend: "⏳",
  veraltet: "⚠",
};

function metricTitle(m: Metric): string {
  const days = m.daysSinceLastValue != null ? ` (${m.daysSinceLastValue}d)` : "";
  return `z = ${m.z != null ? m.z : "–"} · Konfidenz: ${m.confidence}${days}`;
}

/** "über"/"unter" Baseline für einen abweichenden Marker: bei `restingHR`
 *  (higherIsBetter=false) ist ein zu HOHER Wert schlecht, bei HRV/Schlaf ein
 *  zu niedriger — `higherIsBetter` ist genau dafür Teil des öffentlichen
 *  Metrik-Typs. */
function dirWord(m: Metric): string {
  return m.higherIsBetter ? "unter" : "über";
}

/** R5 (Idee 5): Klartext-Aufriss, warum die Ampel heute so steht. Reine
 *  ABLESUNG des stabilen `assessReadiness()`-Outputs — listet die
 *  abweichenden Marker (`metrics[].status`) und nennt die Entscheidungsregel
 *  als feststehenden Satz. Bewusst KEINE Nachbildung der if/else-Kette aus
 *  core/readiness.js::assessReadiness: der Regelsatz ist so formuliert, dass
 *  er für 2-von-N, den schweren Einzelausreißer (severeSingle) und die milde
 *  Einzelabweichung (mildSingle) zugleich stimmt, ohne den konkreten Fall
 *  hier zu rekonstruieren. Der genaue Handlungstext steht ohnehin schon in
 *  `readiness.recommendation` direkt unter der Ampel. */
function whyLines(r: Readiness): string[] {
  const usable = r.metrics.filter((m) => m.confidence === "vorhanden");
  const off = usable.filter((m) => m.status === "caution" || m.status === "alert");
  const staleLabels = [...new Set(r.metrics.filter((m) => m.confidence === "veraltet").map((m) => m.label))];
  const lines: string[] = [];

  if (off.length) {
    const parts = off.map((m) => `${m.label} ${m.status === "alert" ? "deutlich" : "leicht"} ${dirWord(m)} Baseline`);
    lines.push(`Abweichend: ${parts.join(", ")}.`);
  } else if (usable.length) {
    lines.push("Alle vorhandenen Marker liegen im Normalbereich.");
  }

  lines.push(
    "Einzelne leichte Abweichungen ändern die Ampelfarbe nicht — sie wechselt erst, wenn mindestens zwei Marker zusammen abweichen oder ein Marker sehr deutlich ausschlägt.",
  );

  if (!usable.length) {
    lines.push("Aktuell fehlen verwertbare Marker — dann steht die Ampel vorsorglich auf Gelb.");
  } else if (staleLabels.length) {
    lines.push(
      `Für ${staleLabels.join(", ")} fehlen aktuelle Werte; solange das so ist, kann die Ampel vorsorglich auf Gelb stehen.`,
    );
  }

  return lines;
}

function BriefingLink({ briefing }: { briefing: HeroBriefing }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate("/analysis")}
      style={{
        marginTop: 12,
        background: "none",
        border: "none",
        padding: 0,
        cursor: "pointer",
        font: "inherit",
        fontSize: ".78rem",
        color: LEVEL_COLOR[briefing.level],
      }}
    >
      Belastungsempfehlung: {briefing.headline} →
    </button>
  );
}

/** Aufklappbarer "Warum?"-Aufriss (R5). Grundzustand zu, Zustand nur lokal
 *  (kein localStorage — ein Ein-Klick-Aufriss). Immer sichtbar, auch bei
 *  sauberem Grün: nachsehen können, DASS geprüft wurde, trägt zum Vertrauen
 *  ins Signal bei (der Zweck von Idee 5). */
function WhyBreakdown({ readiness, subjSignal }: { readiness: Readiness; subjSignal: SubjSignal }) {
  const [open, setOpen] = useState(false);
  const lines = whyLines(readiness);
  // Kontext-Satz nur, wenn tatsächlich ein Check-in vorliegt (status
  // "nodata" = noch keiner) — sonst gibt es nichts einzuordnen.
  const showSubjectiveNote = !!subjSignal && subjSignal.status !== "nodata";

  return (
    <div style={{ marginTop: 12 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          font: "inherit",
          fontSize: ".72rem",
          color: "var(--ink-2)",
        }}
      >
        Warum? {open ? "▾" : "▸"}
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
          {lines.map((l, i) => (
            <p key={i} style={{ margin: 0, fontSize: ".72rem", color: "var(--ink-3)", lineHeight: 1.5 }}>
              {l}
            </p>
          ))}
          {showSubjectiveNote && (
            <p style={{ margin: 0, fontSize: ".72rem", color: "var(--ink-3)", lineHeight: 1.5 }}>
              Dein heutiger Check-in fließt als Kontext ein und verschiebt die Ampelfarbe nicht.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Port von `ui/panels.js::renderReadiness()` — Tagesform als eigenständige
 *  Detailkarte NEBEN der Belastungsempfehlung (BriefingCard): beide
 *  verrechnen dasselbe `assessReadiness()`-Rohsignal unterschiedlich weit
 *  (s. hero-view-model.ts::HeroCore.readiness-Kommentar), können also
 *  divergieren — genau deshalb zeigt Vanilla beide Panels nebeneinander
 *  statt nur eines. */
export function ReadinessCard({
  readiness,
  briefing,
  subjective,
}: {
  readiness: Readiness | null;
  briefing: HeroBriefing;
  /** Subjektiver Morgen-Check-in des eingeloggten Athleten (R2) — `null` für
   *  Besucher / einen per Toggle betrachteten fremden Athleten (HeroPage
   *  gated auf `isSelf`). Kontext-Anzeige, keine Farbwirkung. */
  subjective: Subjective;
}) {
  if (!readiness) {
    return (
      <GlassCard variant="soft" style={{ padding: "20px 22px" }}>
        <span style={{ fontSize: "var(--fs-tile-title)", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--ink)", fontWeight: 700 }}>
          Tagesform
        </span>
        <p style={{ margin: "10px 0 0", fontSize: ".85rem", color: "var(--ink-3)" }}>
          Noch zu wenig Wellness-Historie für eine belastbare Baseline (braucht ~6 Wochen intervals.icu-Daten).
        </p>
        <BriefingLink briefing={briefing} />
      </GlassCard>
    );
  }

  const color = LEVEL_COLOR[readiness.level];
  // Ein Ort für beide Verwender (R2-Kontextzeile + "Warum?"-Zusatzsatz) —
  // `null` sobald kein Check-in vorliegt (Besucher/fremder Athlet).
  const subjSignal = subjective ? subjectiveSignal(subjective) : null;

  return (
    <GlassCard variant="soft" style={{ padding: "20px 22px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: "var(--fs-tile-title)", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--ink)", fontWeight: 700 }}>
          Tagesform
        </span>
        <span style={{ fontSize: ".72rem", color: "var(--ink-3)" }}>7 Tage vs. 42-Tage-Baseline</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, boxShadow: `0 0 14px ${color}`, flexShrink: 0 }} />
        <div>
          <div style={{ fontFamily: "var(--font-disp)", fontWeight: 600, fontSize: ".95rem", color }}>{LEVEL_LABEL[readiness.level]}</div>
          <div style={{ fontSize: ".8rem", color: "var(--ink-2)" }}>{readiness.recommendation}</div>
        </div>
      </div>

      {/* R2: reine Kontextzeile — gleicher Wortlaut wie das Briefing-Signal
          (core/briefing.js::subjectiveSignal), neutral grau, ohne Farbwirkung. */}
      {subjSignal && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: "1px solid var(--hair)",
            fontSize: ".8rem",
            color: "var(--ink-3)",
          }}
        >
          {subjSignal.text}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 14 }}>
        {readiness.metrics.map((m) => (
          <div
            key={m.key}
            title={metricTitle(m)}
            style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: ".82rem" }}
          >
            <span style={{ color: STATUS_COLOR[m.status] }}>●</span>
            <span style={{ color: "var(--ink-2)", flex: 1 }}>{m.label}</span>
            <span style={{ fontWeight: 600, color: "var(--ink)" }}>
              {m.recent != null ? m.recent : "–"}
              {CONFIDENCE_BADGE[m.confidence] ? ` ${CONFIDENCE_BADGE[m.confidence]}` : ""}
            </span>
            <span style={{ color: "var(--ink-3)" }}>Ø {m.baseline != null ? m.baseline : "–"}</span>
          </div>
        ))}
      </div>

      <WhyBreakdown readiness={readiness} subjSignal={subjSignal} />

      {readiness.metrics.some((m) => m.key === "sleepScore" && m.recent != null) && (
        <p style={{ margin: "10px 0 0", fontSize: ".72rem", color: "var(--ink-3)" }}>{SLEEP_SCORE_DEVICE_NOTE}</p>
      )}
      {readiness.basisNote && (
        <p style={{ margin: "10px 0 0", fontSize: ".72rem", color: "var(--ink-3)" }}>{readiness.basisNote}</p>
      )}
      {readiness.staleWarning && (
        <p style={{ margin: "4px 0 0", fontSize: ".72rem", color: "var(--warn)" }}>⚠ {readiness.staleWarning}</p>
      )}

      <BriefingLink briefing={briefing} />
    </GlassCard>
  );
}

/* ============================================================
   FEATURES/NUTRITION/DAYTARGETCARD.TSX — Tagesziel-Karte
   (Fahrplan 23 E33–E35; Fahrplan 25 R1, Richtung B)

   Kopf der Tagesbühne: Ziel als große Zahl, Fortschritt "geplant /
   Ziel" als Balken mit Ampel, die Primäraktion. Die Methodik (Formel,
   Körperfett-Datum, Quelle) steht hinter einem "ⓘ" — Warnungen
   (Hinweise, Mindestzufuhr, fehlendes Geschlecht) bleiben sichtbar.

   Ohne `summary` (Einkaufsliste) entfallen Balken und Ampel.
   Kontrast (R0, Befund 2.4): die Karte liegt über dem Hintergrundfoto,
   deshalb deckender als die normale Glasfläche und Meta in --ink-2.
   ============================================================ */

import type { CSSProperties, ReactNode } from "react";
import { GlassCard } from "../../components/GlassCard";
import { fmtDate, fmtDateFull } from "../../core/format.js";
import { dayProgress } from "../../core/nutrition-progress.js";
import { SOURCE_BY_KEY } from "../../core/nutrition-sources.js";
import type { NutritionDay } from "./nutrition-day-model";
import { AMPEL_TOKEN, type Ampel } from "./nutrition-week-model";
import { AmpelBadge } from "./AmpelBadge";
import { SourceList } from "./SourceList";
import { HEADING_STYLE, META_STYLE, TEXT_STYLE } from "./nutrition-styles";
import { InfoIcon } from "../../components/InfoIcon";

const FORMULA_NAMES: Record<string, string> = {
  "cunningham-1980": "Cunningham (1980)",
  "ten-haaf-2014": "Ten Haaf (2014)",
};

export interface DayTargetSummary {
  totalKcal: number;
  filled: number;
  ampel: Ampel | null;
}

export interface DayTargetCardProps {
  day: Extract<NutritionDay, { ok: true }>;
  /** Mit Datum erscheint eine Zeile "14.10 · Heute" neben der Überschrift */
  dateISO?: string;
  isToday?: boolean;
  /** Geplante Summe + Ampel des Tages; fehlt = ohne Fortschritt */
  summary?: DayTargetSummary;
  /** Meldungen unter dem Fortschritt (z. B. "Kein Rezept verfügbar") */
  notes?: ReactNode;
  /** Primäraktion (rechts unten) */
  actions?: ReactNode;
}

const CARD_STYLE: CSSProperties = {
  padding: "24px 28px",
  marginBottom: 16,
  // deckender als --glass, damit Meta über hellen Fotostellen lesbar bleibt
  background: "color-mix(in srgb, var(--surface-tile) 90%, transparent)",
};
const META_ON_PHOTO: CSSProperties = { ...META_STYLE, color: "var(--ink-2)" };
const SUMMARY_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  minHeight: 44,
  cursor: "pointer",
  color: "var(--ink-2)",
  fontSize: ".85rem",
};
const TRACK_STYLE: CSSProperties = {
  height: 10,
  borderRadius: 999,
  background: "rgba(255, 255, 255, 0.14)",
  overflow: "hidden",
};

function ProgressBar({ summary, target }: { summary: DayTargetSummary; target: number }) {
  const { ratio, percent } = dayProgress(summary.totalKcal, target);
  const fill = summary.ampel ? `var(${AMPEL_TOKEN[summary.ampel]})` : "transparent";
  return (
    <div
      role="progressbar"
      aria-label="Geplante Kalorien im Verhältnis zum Tagesziel"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.min(percent, 100)}
      aria-valuetext={`${summary.totalKcal} von ${target} kcal geplant`}
      style={TRACK_STYLE}
    >
      <div style={{ width: `${ratio * 100}%`, height: "100%", borderRadius: 999, background: fill }} />
    </div>
  );
}

export function DayTargetCard({ day, dateISO, isToday = false, summary, notes, actions }: DayTargetCardProps) {
  const sources = day.sourceKeys
    .map((key) => SOURCE_BY_KEY.get(key))
    .filter((s): s is NonNullable<typeof s> => !!s);
  const showRed = summary?.ampel === "red";

  return (
    <GlassCard variant="strong" style={CARD_STYLE}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <h2 style={{ ...HEADING_STYLE, margin: 0 }}>Tagesziel</h2>
        {dateISO && (
          <span style={{ ...META_ON_PHOTO, margin: 0 }}>
            {fmtDate(dateISO)}
            {isToday ? " · Heute" : ""}
          </span>
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, margin: "6px 0 10px" }}>
        <p style={{ margin: 0, fontFamily: "var(--font-disp)", fontSize: "2.4rem", fontWeight: 600, color: "var(--ink)" }}>
          {day.target} kcal
        </p>
        {summary?.ampel && <AmpelBadge ampel={summary.ampel} />}
      </div>

      {summary && (
        <>
          <ProgressBar summary={summary} target={day.target} />
          <p style={{ ...TEXT_STYLE, margin: "8px 0 0", color: "var(--ink)" }}>
            {summary.filled > 0 ? `${summary.totalKcal} von ${day.target} kcal geplant` : "Noch nichts geplant"}
          </p>
        </>
      )}

      <p style={{ ...TEXT_STYLE, margin: "10px 0 6px" }}>
        Mindestzufuhr: {day.floor} kcal{day.capped ? " — das Ziel wurde auf diesen Wert angehoben" : ""}
      </p>
      {showRed && (
        <p style={{ ...TEXT_STYLE, margin: "0 0 6px" }}>Die Summe liegt unter der Mindestzufuhr von {day.floor} kcal.</p>
      )}
      {day.trainingKcal > 0 && (
        <p style={TEXT_STYLE}>
          {isToday || !dateISO ? "Training heute" : "Training"}: +{day.trainingKcal} kcal
        </p>
      )}
      {day.trainingUnknown && (
        <p style={TEXT_STYLE}>
          {isToday || !dateISO ? "Heute" : "An diesem Tag"} ist eine Einheit geplant, ihre Energie lässt sich ohne FTP
          oder Intensitätsangabe nicht berechnen. Das Ziel gilt wie an einem Ruhetag.
        </p>
      )}
      {day.hints.map((h) => (
        <p key={h} style={TEXT_STYLE}>
          {h}
        </p>
      ))}
      {day.sexAssumed && (
        <p style={TEXT_STYLE}>
          Ohne Geschlechtsangabe rechnen wir mit einem Mittelwert. Eine Körperfett-Messung macht die Schätzung
          unabhängig davon.
        </p>
      )}
      {notes}

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 6 }}>
        <details style={{ flex: "1 1 220px" }}>
          <summary style={SUMMARY_STYLE}><InfoIcon style={{ marginRight: "0.35em" }} />So rechnen wir</summary>
          <p style={META_ON_PHOTO}>
            Grundumsatz nach {FORMULA_NAMES[day.formula] ?? day.formula}, in einer Studie von 2023 an Sportlern geprüft
          </p>
          {day.bodyFatDate && <p style={META_ON_PHOTO}>Körperfett gemessen am {fmtDateFull(day.bodyFatDate)}</p>}
          <SourceList sources={sources} />
        </details>
        {actions}
      </div>
    </GlassCard>
  );
}

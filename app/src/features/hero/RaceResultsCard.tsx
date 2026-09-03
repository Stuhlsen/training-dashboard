/* ============================================================
   FEATURES/HERO/RACERESULTSCARD.TSX — „Rennergebnisse"-Karte im Hero-Tab
   (Migration 0027, Punkt 3).

   Zeigt absolvierte Rennen mit erfasstem Ergebnis (Zeit, Ø-Watt,
   Platzierungen), neuestes zuerst. Öffentlich sichtbar wie die
   Renn-Countdown-Pille — ein Ergebnis unter Pseudonym ist eine öffentliche
   sportliche Leistung. Reine Anzeige; Filter/Sortierung/Mapping in
   race-results-view-model.ts.
   ============================================================ */

import { GlassCard } from "../../components/GlassCard";
import { fmtDate } from "../../core/format.js";
import type { RaceResultRow } from "./race-results-view-model";

function metaParts(r: RaceResultRow): string[] {
  const parts: string[] = [];
  if (r.timeLabel) parts.push(`⏱ ${r.timeLabel}`);
  if (r.avgWatts != null) parts.push(`⚡ Ø ${r.avgWatts} W`);
  if (r.placeAg != null) parts.push(`🏅 P${r.placeAg} AK`);
  if (r.placeOverall != null) parts.push(`P${r.placeOverall} gesamt`);
  return parts;
}

export function RaceResultsCard({ rows }: { rows: RaceResultRow[] }) {
  if (!rows.length) return null;

  return (
    <GlassCard variant="soft" style={{ padding: "20px 22px" }}>
      <span
        style={{
          fontSize: "var(--fs-tile-title)",
          letterSpacing: ".16em",
          textTransform: "uppercase",
          color: "var(--ink)",
          fontWeight: 700,
        }}
      >
        Rennergebnisse
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
        {rows.map((r) => (
          <div key={r.id} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontFamily: "var(--font-disp)", fontWeight: 600, color: "var(--ink)" }}>{r.title}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: ".72rem", color: "var(--ink-3)", flexShrink: 0 }}>
                {fmtDate(r.dateISO)}
              </span>
            </div>
            <span style={{ fontSize: ".78rem", color: "var(--ink-2)", fontVariantNumeric: "tabular-nums" }}>
              {metaParts(r).join("  ·  ")}
            </span>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

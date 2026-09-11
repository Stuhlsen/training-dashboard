/* ============================================================
   FEATURES/ANALYSIS/PACESECTION.TSX — Pace-Auswertung für Lauf/Schwimm
   im Analyse-Tab (Fahrplan 10 E8b). Ersetzt den früheren
   „Pace-Analyse folgt"-Platzhalter (PaceSoonNote).

   Enthält:
   - Pace-Zonen-Skala (PaceZoneScale) — degradiert, solange keine
     belastbare Schwellenpace geschätzt werden kann.
   - HF-bpm-Zonen-Skala (HrZoneScale, Fahrplan 12 E7, NUR Lauf) — unter der
     Pace-Zonen-Skala, aus dem geschätzten Athleten-hrMax.
   - Pace-Kurve (PaceCurveCard) — beste Ø-Pace je Distanz.
   - Fußzeile: Pace:HF-Drift folgt mit Streams; Fitness/Form im Hero-Tab.

   Die Chart-Erklärtexte leben bewusst HIER in der Feature-Komponente
   (Muster wie die E8a-Explainer), nicht in einer zentralen Funktion.
   ============================================================ */

import { useMemo } from "react";
import { GlassCard } from "../../components/GlassCard";
import { PaceZoneScale } from "../../charts/PaceZoneScale";
import { HrZoneScale } from "../../charts/HrZoneScale";
import { PaceCurveCard } from "../../charts/PaceCurveCard";
import { buildPaceSection } from "./pace-section-view-model";

type Ride = import("../../types.js").Ride;

interface PaceSectionProps {
  rides: Ride[];
  sport: "run" | "swim";
  /** Geschätzter Athleten-hrMax aus dem Sync-Output (Fahrplan 12 E7) —
   *  `null` außerhalb von Multi-Sport-Athleten. */
  hrMax?: number | null;
  hrEstimated?: boolean;
}

export function PaceSection({ rides, sport, hrMax = null, hrEstimated = false }: PaceSectionProps) {
  const vm = useMemo(
    () => buildPaceSection({ rides, sport, hrMax, hrEstimated }),
    [rides, sport, hrMax, hrEstimated],
  );
  const nounSingular = sport === "run" ? "Lauf" : "Einheit";
  const nounPlural = sport === "run" ? "Läufe" : "Einheiten";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontFamily: "var(--font-disp)", fontSize: "1.2rem", fontWeight: 600, letterSpacing: "-.01em", color: "var(--text-ink)" }}>
          {vm.sportLabel} · Pace-Auswertung
        </h2>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: ".62rem", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--text-label)" }}>
          {vm.nActivities} {vm.nActivities === 1 ? nounSingular : nounPlural}
        </span>
      </div>

      {vm.emptySport && (
        <GlassCard variant="soft" style={{ padding: "18px 22px" }}>
          <p style={{ margin: 0, fontSize: ".9rem", color: "var(--text-soft)", lineHeight: 1.6 }}>
            Noch keine {sport === "run" ? "Läufe" : "Schwimm-Einheiten"} geloggt — das
            Gerüst greift automatisch, sobald die erste Einheit aufgezeichnet ist.
          </p>
        </GlassCard>
      )}

      {/* Pace-Zonen-Skala */}
      <GlassCard variant="strong" radius="20px" style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-disp)", fontSize: ".98rem", fontWeight: 600, color: "var(--text-ink)" }}>Pace-Zonen</span>
          {vm.thresholdPaceSec != null && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: ".62rem", letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text-label)" }}>
              {vm.thresholdMetric}: aus den besten Distanz-Efforts geschätzt
            </span>
          )}
        </div>
        <PaceZoneScale
          zones={vm.zones}
          scaleMaxSpeed={vm.scaleMaxSpeed}
          degraded={vm.degraded}
          thresholdUnit={vm.thresholdUnit}
          sport={sport}
          degradedReason={vm.degradedReason}
        />
        <p style={{ margin: 0, fontSize: ".8rem", color: "var(--text-soft)", lineHeight: 1.55 }}>
          {sport === "run"
            ? "Fünf Zonen nach Jack Daniels (E Easy · M Marathon · T Schwelle · I Intervall · R Wiederholung), verankert an der geschätzten Schwellenpace."
            : "Fünf Zonen nach dem Critical-Swim-Speed-Modell (Rekom · Grundlage · CSS · VO2max · Sprint), verankert an der geschätzten CSS."}{" "}
          Die Konstanten sind Lehrbuchwerte und noch nicht an echten Efforts kalibriert.
        </p>
      </GlassCard>

      {/* HF-bpm-Zonen (Fahrplan 12 E7, nur Lauf) */}
      {sport === "run" && (
        <GlassCard variant="strong" radius="20px" style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
          <span style={{ fontFamily: "var(--font-disp)", fontSize: ".98rem", fontWeight: 600, color: "var(--text-ink)" }}>HF-Zonen</span>
          <HrZoneScale zones={vm.hrZones} degraded={vm.hrDegraded} />
          <p style={{ margin: 0, fontSize: ".8rem", color: "var(--text-soft)", lineHeight: 1.55 }}>
            Fünf Zonen als Anteil der Maximalherzfrequenz (%HFmax) — die Grenzen sind
            Lehrbuchwerte, noch nicht kalibriert.
          </p>
        </GlassCard>
      )}

      {/* Pace-Kurve */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <PaceCurveCard curve={vm.curve} thresholdUnit={vm.thresholdUnit} activityNoun={nounPlural} />
        <p style={{ margin: 0, fontSize: ".8rem", color: "var(--text-soft)", lineHeight: 1.55, padding: "0 4px" }}>
          Beste Durchschnitts-Pace je Standard-Distanz. Ohne Zwischenzeiten zählt
          jede Einheit genau einmal — für den größten Distanz-Block, den sie abdeckt.
        </p>
      </div>

      {/* Fußzeile */}
      <p style={{ margin: 0, fontSize: ".8rem", color: "var(--text-label)", lineHeight: 1.6 }}>
        Pace:HF-Drift folgt, sobald der Sync Zwischenzeiten/Streams liefert. Fitness
        und Form (sportartübergreifend) stehen im Hero-Tab.
      </p>
    </div>
  );
}

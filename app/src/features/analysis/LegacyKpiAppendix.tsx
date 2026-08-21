/* ============================================================
   FEATURES/ANALYSIS/LEGACYKPIAPPENDIX.TSX — Eingeklappter Anhang mit dem
   bisherigen Kennzahlen-Tab-Inhalt (Umsetzungsplan Etappe 3).

   Das neue Analyse-Design "Antworten & Spuren" deckt Fitness/Last/TSB,
   Erholung (HRV/Ruhepuls/Schlaf) und Bremser (Entkopplung/Kadenz/Energie/
   Trinkrate/Wetter/Gewicht) ab, aber NICHT: Last-Tabelle (Ramp/Monotonie/
   Strain je Woche), Periodisierungs-Compliance, Rekord-Chips, Typ-
   verteilung, Konsistenz-Zusammenfassung, FTP-Dreiklang-Tabelle mit Datum.
   Statt diese Inhalte ersatzlos zu streichen, bleiben sie hier unverändert
   (exakt dieselbe Verdrahtung wie zuvor in AnalysisPage.tsx) — eingeklappt,
   damit sie die neue Seite nicht dominieren, aber auffindbar bleiben, bis
   bewusst entschieden ist, ob/wie sie ins neue Design einfließen. */

import { AerobicCards } from "./AerobicCards";
import { AnalysisNote, AnalysisSection } from "./AnalysisSection";
import { FtpTriad } from "./FtpTriad";
import { IntensityBand } from "./IntensityBand";
import { KpiGrid } from "./KpiGrid";
import { LoadTable } from "./LoadTable";
import { PeriodizationBlocks } from "./PeriodizationBlocks";
import { RecordChips } from "./RecordChips";
import { TypDistribution } from "./TypDistribution";
import type {
  AnalysisKpi,
  AerobicCard as AerobicCardT,
  ConsistencySummary,
  IntensityDistribution,
  LoadRow,
  PeriodizationSummary,
  PowerDiagnostics,
  RecordChip,
  TypDistributionRow,
} from "./analysis-view-model";

interface LegacyKpiAppendixProps {
  kpis: AnalysisKpi[];
  loadRows: LoadRow[];
  intensity: IntensityDistribution | null;
  typDist: TypDistributionRow[];
  aerobicCards: AerobicCardT[];
  powerDiagnostics: PowerDiagnostics;
  records: RecordChip[];
  bodyCards: AerobicCardT[];
  consistency: ConsistencySummary;
  periodization: PeriodizationSummary | null;
  ownPlan: boolean;
}

/** `<details>` statt eines eigenen `expanded`-useState — kein Zustand nötig,
 *  Browser-nativ zugänglich (Enter/Space togglet, Screenreader kennt die
 *  Rolle), kollabiert per Default über das fehlende `open`-Attribut. */
export function LegacyKpiAppendix({ kpis, loadRows, intensity, typDist, aerobicCards, powerDiagnostics, records, bodyCards, consistency, periodization, ownPlan }: LegacyKpiAppendixProps) {
  return (
    <details style={{ borderRadius: 18, border: "1px dashed rgba(255,255,255,.14)", background: "rgba(20,24,34,.5)", backdropFilter: "blur(18px)" }}>
      <summary
        style={{
          cursor: "pointer",
          padding: "14px 20px",
          fontSize: ".84rem",
          fontWeight: 600,
          color: "var(--text-ink)",
          listStyle: "none",
        }}
      >
        Weitere Kennzahlen (bisheriger Kennzahlen-Tab)
      </summary>
      <div style={{ display: "flex", flexDirection: "column", gap: 34, padding: "0 20px 24px" }}>
        <KpiGrid kpis={kpis} />

        <AnalysisSection
          icon="🛡️"
          title="Belastung & Erholung"
          explainer="Ramp-Rate (sicherer Aufbau: +3 bis +6 CTL/Woche) und Foster-Monotonie/Strain pro Woche — erkennt Übersteuerung und „gleichförmig hart“-Muster, die die CTL allein maskiert."
        >
          <LoadTable rows={loadRows} />
        </AnalysisSection>

        <AnalysisSection
          icon="📊"
          title="Intensitätsverteilung"
          explainer="Zeit in niedriger/mittlerer/hoher Intensität. Für nachhaltige Ausdauerentwicklung haben sich Verteilungen mit ≥80% niedriger Intensität bewährt (Seiler)."
        >
          <IntensityBand dist={intensity} />
          <TypDistribution rows={typDist} />
        </AnalysisSection>

        <AnalysisSection
          icon="🫀"
          title="Aerobe Entwicklung"
          explainer="Effizienzfaktor (Watt/Herzschlag), HF-Decoupling (<5 % = aerob stabil) und Kadenz-Ökonomie über vergleichbare Grundlagenfahrten."
        >
          <AerobicCards cards={aerobicCards} />
        </AnalysisSection>

        <AnalysisSection icon="⚡" title="Leistungsdiagnostik">
          <FtpTriad diagnostics={powerDiagnostics} />
          <RecordChips records={records} />
        </AnalysisSection>

        {bodyCards.length > 0 && (
          <AnalysisSection
            icon="🩺"
            title="Regeneration & Körper"
            explainer="Energieverfügbarkeit und Flüssigkeitshaushalt beeinflussen Erholungsfähigkeit und Trainingsqualität — und die Aussagekraft HF-basierter Marker. Gewicht koppelt über W/kg an die Leistungsdiagnostik."
          >
            <AerobicCards cards={bodyCards} />
          </AnalysisSection>
        )}

        <AnalysisSection
          icon="📆"
          title="Konsistenz & Adhärenz"
          explainer="Trainingskonsistenz ist der stärkste einzelne Prädiktor für Langzeitfortschritt — wichtiger als jede Einzelsession."
        >
          <KpiGrid kpis={consistency.chips} />
          {consistency.missedText && <AnalysisNote>{consistency.missedText}</AnalysisNote>}
        </AnalysisSection>

        {ownPlan && (
          <AnalysisSection
            icon="🧭"
            title="Periodisierungs-Erfüllung"
            explainer="Ist jeder Trainingsblock phasengerecht umgesetzt? Reizsignatur pro Block, Quality-Dichte und ob Erholungswochen wirklich reduziert waren."
          >
            <PeriodizationBlocks summary={periodization} />
          </AnalysisSection>
        )}
      </div>
    </details>
  );
}

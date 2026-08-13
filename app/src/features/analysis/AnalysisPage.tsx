/* ============================================================
   FEATURES/ANALYSIS/ANALYSISPAGE.TSX — Analyse-Tab, Grundgerüst (Etappe 11d)

   Route `/analysis`. Baut die Seiten-Shell (KPI-Hero + Sektions-Liste) und
   portiert Sektionen aus assets/js/ui/analysis.js: Belastung & Erholung,
   Intensitätsverteilung (11d), Aerobe Entwicklung + Leistungsdiagnostik
   (11e), Regeneration & Körper + Konsistenz & Adhärenz + Periodisierungs-
   Erfüllung (11f). AnalysisSection.tsx ist der dafür gemeinsame Baustein.
   ============================================================ */

import { useMemo } from "react";
import { AthleteToggle } from "../../components/AthleteToggle";
import { PageShell } from "../../components/PageShell";
import { useActiveAthlete } from "../../api/hooks/useActiveAthlete";
import { usePlanCards } from "../../api/hooks/usePlanCards";
import { useRides } from "../../api/hooks/useRides";
import { weekSortIndex } from "../../core/aggregate.js";
import { localISODate } from "../../core/format.js";
import { athleteConfig, RETEST_DATE, weekIndex } from "../../config";
import { AerobicCards } from "./AerobicCards";
import { AnalysisNote, AnalysisSection } from "./AnalysisSection";
import { FtpTriad } from "./FtpTriad";
import { IntensityBand } from "./IntensityBand";
import { KpiGrid } from "./KpiGrid";
import { LoadTable } from "./LoadTable";
import { PeriodizationBlocks } from "./PeriodizationBlocks";
import { RecordChips } from "./RecordChips";
import { TypDistribution } from "./TypDistribution";
import {
  buildAerobicCards,
  buildAnalysisKpis,
  buildBodyCards,
  buildConsistencySummary,
  buildIntensityDistribution,
  buildLoadRows,
  buildPeriodization,
  buildPowerDiagnostics,
  buildRecordChips,
  buildTypDistribution,
} from "./analysis-view-model";

type Ride = import("../../types.js").Ride;
type WellnessDay = import("../../types.js").WellnessDay;

const TODAY = localISODate();

export function AnalysisPage() {
  const { activeAthleteId, setActiveAthleteId } = useActiveAthlete();
  const athleteCfg = athleteConfig(activeAthleteId);
  const { data: athleteData, isLoading, error } = useRides(activeAthleteId);
  const { data: planCards } = usePlanCards(activeAthleteId);

  const rides = useMemo(() => (athleteData?.rides as Ride[] | undefined) ?? [], [athleteData]);
  const wellness = useMemo(() => (athleteData?.wellness as WellnessDay[] | undefined) ?? [], [athleteData]);
  const ownPlan = useMemo(() => rides.some((r) => r.week), [rides]);
  const kpis = useMemo(() => buildAnalysisKpis(rides, athleteCfg?.ftpMeasured ?? null, TODAY), [rides, athleteCfg]);
  const loadRows = useMemo(() => buildLoadRows(rides), [rides]);
  const intensity = useMemo(() => buildIntensityDistribution(rides), [rides]);
  const typDist = useMemo(() => buildTypDistribution(rides), [rides]);
  const aerobicCards = useMemo(() => buildAerobicCards(rides, ownPlan), [rides, ownPlan]);
  const powerDiagnostics = useMemo(
    () =>
      buildPowerDiagnostics({
        rides,
        wellness,
        weight: (athleteData?.athleteWeight as number | null | undefined) ?? null,
        ftpMeasured: athleteCfg?.ftpMeasured ?? null,
        ftpMeasuredDate: athleteCfg?.ftpMeasuredDate ?? null,
        ftpGoal: athleteCfg?.ftpGoal ?? null,
        ownPlan,
        retestDateISO: RETEST_DATE,
      }),
    [rides, wellness, athleteData, athleteCfg, ownPlan]
  );
  const records = useMemo(() => buildRecordChips(rides), [rides]);
  const bodyCards = useMemo(
    () => buildBodyCards(wellness, TODAY, athleteCfg?.ftpMeasured ?? null, athleteCfg?.bmr),
    [wellness, athleteCfg]
  );
  const consistency = useMemo(
    () => buildConsistencySummary(rides, ownPlan ? (planCards ?? null) : null, TODAY),
    [rides, ownPlan, planCards]
  );
  const periodization = useMemo(
    () => (ownPlan ? buildPeriodization(rides, (w) => weekSortIndex(w, weekIndex)) : null),
    [rides, ownPlan]
  );

  if (isLoading || !athleteData) {
    return <p style={{ color: "var(--ink-3)", padding: 40 }}>{error ? "Fehler beim Laden der Trainingsdaten." : "Lädt…"}</p>;
  }

  return (
    <PageShell>
      <div style={{ display: "flex", flexDirection: "column", gap: 34 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontFamily: "var(--font-disp)", fontSize: "1.6rem", fontWeight: 600, color: "var(--ink)" }}>
            Analyse
          </h1>
          <AthleteToggle activeAthleteId={activeAthleteId} onChange={setActiveAthleteId} />
        </div>

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
    </PageShell>
  );
}

/* ============================================================
   FEATURES/ANALYSIS/ANALYSISPAGE.TSX — Analyse-Tab, Grundgerüst (Etappe 11d)

   Route `/analysis`. Baut die Seiten-Shell (KPI-Hero + Sektions-Liste) und
   portiert die ersten zwei Sektionen aus assets/js/ui/analysis.js:
   Belastung & Erholung, Intensitätsverteilung. Weitere Sektionen (Aerob,
   Leistungsdiagnostik, Regeneration & Körper, Konsistenz, Periodisierung)
   folgen in 11e/11f — s. dortigen Koordinationspunkt in
   docs/dashboard-3.0-konzept-react-umbau.md, AnalysisSection.tsx ist der
   dafür vorgesehene gemeinsame Baustein.
   ============================================================ */

import { useMemo } from "react";
import { AthleteToggle } from "../../components/AthleteToggle";
import { PageShell } from "../../components/PageShell";
import { useActiveAthlete } from "../../api/hooks/useActiveAthlete";
import { useRides } from "../../api/hooks/useRides";
import { localISODate } from "../../core/format.js";
import { athleteConfig } from "../../config";
import { AnalysisSection } from "./AnalysisSection";
import { IntensityBand } from "./IntensityBand";
import { KpiGrid } from "./KpiGrid";
import { LoadTable } from "./LoadTable";
import { TypDistribution } from "./TypDistribution";
import { buildAnalysisKpis, buildIntensityDistribution, buildLoadRows, buildTypDistribution } from "./analysis-view-model";

type Ride = import("../../types.js").Ride;

const TODAY = localISODate();

export function AnalysisPage() {
  const { activeAthleteId, setActiveAthleteId } = useActiveAthlete();
  const athleteCfg = athleteConfig(activeAthleteId);
  const { data: athleteData, isLoading, error } = useRides(activeAthleteId);

  const rides = useMemo(() => (athleteData?.rides as Ride[] | undefined) ?? [], [athleteData]);
  const kpis = useMemo(() => buildAnalysisKpis(rides, athleteCfg?.ftpMeasured ?? null, TODAY), [rides, athleteCfg]);
  const loadRows = useMemo(() => buildLoadRows(rides), [rides]);
  const intensity = useMemo(() => buildIntensityDistribution(rides), [rides]);
  const typDist = useMemo(() => buildTypDistribution(rides), [rides]);

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
      </div>
    </PageShell>
  );
}

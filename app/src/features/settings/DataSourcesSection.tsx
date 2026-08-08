/* ============================================================
   FEATURES/SETTINGS/DATASOURCESSECTION.TSX — read-only, Port von
   ui/settings-panel.js::buildDataSourcesSection()

   Zeigt die Quellen des gerade per Athleten-Toggle ANGEZEIGTEN Athleten,
   nicht zwingend die des eingeloggten Users — es gibt keine Verknüpfung
   zwischen Supabase-Login und einer CONFIG.athletes-ID (gleicher Hinweis
   wie im Vanilla-Original). Bewusst kein eigener Athleten-Toggle in
   Settings — nutzt den bereits per Layout gesetzten globalen Athleten.
   ============================================================ */

import { athleteConfig, ATHLETES } from "../../config";
import { useActiveAthlete } from "../../api/hooks/useActiveAthlete";
import { useRides } from "../../api/hooks/useRides";
import { fmtDate } from "../../core/format.js";
import { HEADING_STYLE } from "./section-styles";

type Ride = import("../../types.js").Ride;
type WellnessDay = import("../../types.js").WellnessDay;

function latestDataDate(rides: Ride[], wellness: WellnessDay[]): string | null {
  const dates = [...rides.map((r) => r.dateISO), ...wellness.map((w) => w.dateISO)].filter(Boolean) as string[];
  if (!dates.length) return null;
  return dates.reduce((a, b) => (a > b ? a : b));
}

export function DataSourcesSection() {
  const { activeAthleteId } = useActiveAthlete();
  const { data: rideData } = useRides(activeAthleteId);

  const ac = athleteConfig(activeAthleteId);
  const athleteName = ATHLETES.find((a) => a.id === activeAthleteId)?.name ?? "";
  const sources = ac?.dataSources ?? [];
  const rides = (rideData?.rides as Ride[] | undefined) ?? [];
  const wellness = (rideData?.wellness as WellnessDay[] | undefined) ?? [];
  const lastDate = latestDataDate(rides, wellness);

  return (
    <div style={{ padding: "18px 0" }}>
      <div style={HEADING_STYLE}>Datenquellen · {athleteName}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sources.map((src) => (
          <div key={src} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--ok)", flexShrink: 0 }} />
            <span style={{ fontFamily: "var(--font-body)", fontSize: ".8rem", color: "var(--ink)" }}>{src}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: ".62rem", color: "var(--ink-3)", marginLeft: "auto" }}>
              {lastDate ? fmtDate(lastDate) : "–"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

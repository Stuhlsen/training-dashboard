import { useState } from "react";
import { GlassCard } from "../../components/GlassCard";
import { PaceZoneScale } from "../../charts/PaceZoneScale";
import { EASY_ZONE_ID_BY_SPORT, EASY_ZONE_SHARE_SENTENCE, ZONE_EXPLANATIONS } from "../../core/zone-explanations.js";
import type { PaceSectionViewModel } from "../analysis/pace-section-view-model";
import { ZoneExplainer } from "./ZoneExplainer";
import { buildPaceZonesViewModel, EXPLAINER_SPORT, PACE_RICHTWERT_HINT } from "./zone-explainer-view-model";

interface PaceZonesTileProps {
  /** Pace-View-Model des Analyse-Tabs (buildPaceSection) — dieselbe Schwellenschätzung */
  pace: PaceSectionViewModel;
}

/** Pace-Zonen (Lauf: Daniels E/M/T/I/R · Schwimmen: CSS s1–s5) mit Zonen-
 *  Erklärer — Fahrplan 24, E3. Balken = charts/PaceZoneScale (inkl.
 *  degradiertem Zustand ohne Schwelle), darunter der gemeinsame ZoneExplainer.
 *  Der Pflichthinweis "Richtwert, nicht an deinen Daten geprüft" ist fest und
 *  immer sichtbar (Q5). Der Aufrufer setzt `key={sport}`, damit beim
 *  Sportwechsel die Vorauswahl neu startet. */
export function PaceZonesTile({ pace }: PaceZonesTileProps) {
  const textKey = EXPLAINER_SPORT[pace.sport];
  const easyId = EASY_ZONE_ID_BY_SPORT[textKey as "running" | "swimming"];
  const [selectedId, setSelectedId] = useState<string>(easyId);
  const vm = buildPaceZonesViewModel(pace);
  return (
    <GlassCard variant="soft" radius="24px" style={{ padding: "28px clamp(24px,2.4vw,40px) 30px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        <span style={{ fontSize: "var(--fs-tile-title)", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--ink)", fontWeight: 700 }}>
          Pace-Zonen · {pace.sportLabel}
        </span>
        <PaceZoneScale
          zones={vm.scaleZones}
          scaleMaxSpeed={pace.scaleMaxSpeed}
          degraded={vm.degraded}
          thresholdUnit={pace.thresholdUnit}
          sport={pace.sport}
          degradedReason={pace.degradedReason}
          selectedId={selectedId}
          onSelectZone={setSelectedId}
        />
        <ZoneExplainer
          zones={vm.explainerZones}
          explanations={ZONE_EXPLANATIONS[textKey as "running" | "swimming"].zonen}
          selectedId={selectedId}
          onSelect={setSelectedId}
          degraded={vm.degraded}
          easyZoneId={easyId}
          shareSentence={EASY_ZONE_SHARE_SENTENCE}
          hints={[PACE_RICHTWERT_HINT]}
        />
      </div>
    </GlassCard>
  );
}

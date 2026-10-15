import { useState } from "react";
import { GlassCard } from "../../components/GlassCard";
import { HrZoneScale } from "../../charts/HrZoneScale";
import { EASY_ZONE_ID_BY_SPORT, EASY_ZONE_SHARE_SENTENCE, HR_RICHTWERT_HINT, ZONE_EXPLANATIONS } from "../../core/zone-explanations.js";
import { ZoneExplainer } from "./ZoneExplainer";
import type { HrZonesViewModel } from "./zone-explainer-view-model";

interface HrZonesTileProps {
  vm: HrZonesViewModel;
  /** true, solange der HFmax geschätzt (nicht vom Athleten gesetzt) ist */
  hrMaxEstimated: boolean;
}

/** Herzfrequenz-Zonen (Rad) mit Zonen-Erklärer — Fahrplan 24, E2.
 *  Balken = charts/HrZoneScale (inkl. degradiertem Zustand ohne HFmax),
 *  darunter der gemeinsame ZoneExplainer. Texte aus core/zone-explanations.js. */
export function HrZonesTile({ vm, hrMaxEstimated }: HrZonesTileProps) {
  const [selectedId, setSelectedId] = useState<string>(EASY_ZONE_ID_BY_SPORT.cycling);
  return (
    <GlassCard variant="soft" radius="24px" style={{ padding: "28px clamp(24px,2.4vw,40px) 30px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        <span style={{ fontSize: "var(--fs-tile-title)", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--ink)", fontWeight: 700 }}>
          Herzfrequenz-Zonen
        </span>
        <HrZoneScale
          zones={vm.zones}
          degraded={vm.degraded}
          selectedId={selectedId}
          onSelectZone={setSelectedId}
          hrMaxNote={hrMaxEstimated ? "HFmax geschätzt (aus Trainingsdaten)" : "HFmax hinterlegt (nicht geschätzt)"}
          degradedText="HFmax noch nicht bekannt — trage ihn in den Einstellungen ein oder sammle Trainingsdaten mit Herzfrequenz. Die Zonen-Beschreibungen bleiben unten lesbar."
        />
        <ZoneExplainer
          zones={vm.explainerZones}
          explanations={ZONE_EXPLANATIONS.cycling.hf}
          selectedId={selectedId}
          onSelect={setSelectedId}
          degraded={vm.degraded}
          easyZoneId={EASY_ZONE_ID_BY_SPORT.cycling}
          shareSentence={EASY_ZONE_SHARE_SENTENCE}
          hint={HR_RICHTWERT_HINT}
        />
      </div>
    </GlassCard>
  );
}

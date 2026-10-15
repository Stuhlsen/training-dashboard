import { useState } from "react";
import { GlassCard } from "../../components/GlassCard";
import { HrZoneScale } from "../../charts/HrZoneScale";
import {
  EASY_ZONE_ID_BY_SPORT,
  EASY_ZONE_SHARE_SENTENCE,
  HR_RICHTWERT_HINT,
  SWIMMING_HR_HINT,
  ZONE_EXPLANATIONS,
} from "../../core/zone-explanations.js";
import { ZoneExplainer, type ExplainerCallout } from "./ZoneExplainer";
import { EXPLAINER_SPORT, type HeroZoneSport, type HrZonesViewModel } from "./zone-explainer-view-model";

/** Vorgewählte HF-Zone: die HF-Zonen heißen in allen Sportarten z1–z5 (anders
 *  als die Schwellen-Zonen e/s2), die Easy-Zone ist überall z2 — der Wert aus
 *  EASY_ZONE_ID_BY_SPORT.cycling ist genau diese HF-/Coggan-Zone. */
const HR_EASY_ZONE_ID = EASY_ZONE_ID_BY_SPORT.cycling;

interface HrZonesTileProps {
  /** Sportart des Hero-Tabs; bestimmt Texte und den Schwimm-Hinweis */
  sport: HeroZoneSport;
  vm: HrZonesViewModel;
  /** true, solange der HFmax geschätzt (nicht vom Athleten gesetzt) ist */
  hrMaxEstimated: boolean;
}

/** Herzfrequenz-Zonen (Rad, Lauf, Schwimmen) mit Zonen-Erklärer — Fahrplan 24,
 *  E2/E3. Balken = charts/HrZoneScale (inkl. degradiertem Zustand ohne HFmax),
 *  darunter der gemeinsame ZoneExplainer. Texte aus core/zone-explanations.js.
 *  Immer sichtbar: Richtwert-Hinweis und HFmax-Herkunft; beim Schwimmen
 *  zusätzlich der Wasser-Herzfrequenz-Hinweis. */
export function HrZonesTile({ sport, vm, hrMaxEstimated }: HrZonesTileProps) {
  const [selectedId, setSelectedId] = useState<string>(HR_EASY_ZONE_ID);
  const hints: ExplainerCallout[] = sport === "swim" ? [HR_RICHTWERT_HINT, SWIMMING_HR_HINT] : [HR_RICHTWERT_HINT];
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
          explanations={ZONE_EXPLANATIONS[EXPLAINER_SPORT[sport]].hf}
          selectedId={selectedId}
          onSelect={setSelectedId}
          degraded={vm.degraded}
          easyZoneId={HR_EASY_ZONE_ID}
          shareSentence={EASY_ZONE_SHARE_SENTENCE}
          hints={hints}
        />
      </div>
    </GlassCard>
  );
}

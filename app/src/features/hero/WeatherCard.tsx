import { GlassCard } from "../../components/GlassCard";
import type { HeroWeather } from "./hero-view-model";

/** "Wetter · heute"-Kachel — neu in Hero-Weitwinkel.dc.html. Keine
 *  Freitext-Beschreibung ("Heiter, leichter Wind") oder Zeitfenster-Hinweis
 *  ("Gutes Fenster 16–19 Uhr") wie im Design-Export: beides ist dort
 *  Fantasietext ohne reale Datenbasis, s. hero-view-model.ts::HeroWeather. */
export function WeatherCard({ weather }: { weather: HeroWeather }) {
  return (
    <GlassCard variant="soft" style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: "var(--fs-tile-title)", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--ink)", fontWeight: 700 }}>
            Wetter · heute
          </span>
          <span style={{ fontSize: "1.4rem" }}>{weather.icon}</span>
        </div>
        <span style={{ fontSize: "2.5rem", fontWeight: 600, lineHeight: 0.92, letterSpacing: "-.03em", color: "var(--ink)" }}>
          {weather.tempLabel}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, paddingTop: 14, borderTop: "1px solid var(--hair)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: ".7rem", color: "var(--ink-3)" }}>Gefühlt</span>
          <span style={{ fontSize: "1rem", fontWeight: 600, color: "var(--ink)" }}>{weather.feelsLabel}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: ".7rem", color: "var(--ink-3)" }}>Regen</span>
          <span style={{ fontSize: "1rem", fontWeight: 600, color: "var(--ink)" }}>{weather.rainLabel}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: ".7rem", color: "var(--ink-3)" }}>Wind</span>
          <span style={{ fontSize: "1rem", fontWeight: 600, color: "var(--ink)" }}>{weather.windLabel}</span>
        </div>
      </div>
    </GlassCard>
  );
}

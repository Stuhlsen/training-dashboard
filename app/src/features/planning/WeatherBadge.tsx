import { weatherIcon, windDir } from "../../core/format.js";
import { uvLabel, weatherBadgeColor, type DayForecast } from "./planning-view-model";

const ROW_STYLE: React.CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  fontSize: ".78rem",
};

const DETAIL_STYLE: React.CSSProperties = { color: "var(--ink-3)" };

const WARN_STYLE: React.CSSProperties = {
  fontSize: ".74rem",
  color: "var(--warn)",
};

/** Wetter-Badge einer Plankarte — Port von ui/planned.js::_renderCard
 *  Z. 823-871. Nur gerendert, wenn ein Forecast-Eintrag für das Kartendatum
 *  existiert (`forecast?.[card.date]`, s. PlanCard.tsx). */
export function WeatherBadge({ forecast }: { forecast: DayForecast }) {
  const color = weatherBadgeColor(forecast);
  const uv = uvLabel(forecast.uvMax);
  const heatWarning = forecast.tempFeel > 32;
  const coldWarning = forecast.temp < 5;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={ROW_STYLE}>
        <span style={{ color }}>
          {weatherIcon(forecast.weatherCode)} {forecast.temp}°C{" "}
          <span style={DETAIL_STYLE}>(gefühlt {forecast.tempFeel}°C)</span>
        </span>
        <span style={DETAIL_STYLE}>
          💨 {forecast.windSpeed} km/h {windDir(forecast.windDir)}
        </span>
      </div>
      <div style={ROW_STYLE}>
        <span style={DETAIL_STYLE}>🌧 {forecast.precipProb}% Regen</span>
        {uv && <span style={{ color: uv.color }}>{uv.text}</span>}
      </div>
      {heatWarning && <div style={WARN_STYLE}>⚠️ Hitzestress — viel trinken, Tempo anpassen</div>}
      {coldWarning && <div style={WARN_STYLE}>🥶 Kalt — Winterausrüstung empfohlen</div>}
    </div>
  );
}

/* ============================================================
   FEATURES/LOGBOOK/LOGBOOKPAGE.TSX — Fahrtenbuch (Etappe 11b)

   Port von assets/js/ui/table.js. Zwei bewusste Abweichungen vom
   Vanilla-Original (Rückfrage mit Alex vor dem Bau):
   - Keine Befinden-Spalte (RPE/Feel, editierbar) — die gibt es im aktuellen
     Vanilla-Stand selbst nicht mehr (s. Kopfkommentar logbook-view-model.ts).
   - Kein Wochen-Filter-Tag: der einzige Aufrufer dafür (Klick auf einen
     Wochen-Balken im Trainings-Chart) existiert im React-Port noch nicht —
     ein Tag ohne Weg, ihn zu setzen, wäre tote UI.

   Zwei Cross-Feature-Verkabelungen SIND mit gebaut, beide über den bereits
   etablierten `location.state.highlightDate`-Sprung (Muster aus
   ExplorerPage::handleSelectDate → PlanningPage, Etappe 8c):
   - 📅-Icon (nur bei intervals.icu-Ära-Fahrten) → Sprung zur Plankarte im
     Planungstab.
   - Zeilen-Klick (überall sonst in der Zeile) → Sprung zum PMC-Chart im
     Explorer, der dort den Crosshair auf dieses Datum setzt (sofern es im
     aktuell sichtbaren Brush-Fenster liegt — sonst stiller No-op, wie beim
     Planungstab-Sprung bei fehlender Karte). */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AthleteToggle } from "../../components/AthleteToggle";
import { GlassCard } from "../../components/GlassCard";
import { PageShell } from "../../components/PageShell";
import { ChartTooltip } from "../../charts/ChartTooltip";
import { useActiveAthlete } from "../../api/hooks/useActiveAthlete";
import { useRides } from "../../api/hooks/useRides";
import { fmt, fmtInt, weatherIcon, windDir } from "../../core/format.js";
import { sum } from "../../core/stats.js";
import { weekDisplayLabels } from "../../core/week-labels.js";
import { phaseColor } from "../../config";
import {
  classifyWeather,
  COLUMNS,
  DEFAULT_SORT,
  filterRides,
  getPhaseOptions,
  nextSort,
  sortRides,
  type RideWeather,
  type SortState,
} from "./logbook-view-model";

type Ride = import("../../types.js").Ride;

const TH_STYLE: React.CSSProperties = {
  padding: "8px 10px",
  textAlign: "left",
  fontWeight: 600,
  color: "var(--ink-3)",
  borderBottom: "1px solid var(--hair)",
  whiteSpace: "nowrap",
  fontSize: ".68rem",
  textTransform: "uppercase",
  letterSpacing: ".06em",
  userSelect: "none",
};

const TD_STYLE: React.CSSProperties = {
  padding: "7px 10px",
  borderBottom: "1px solid var(--hair)",
  verticalAlign: "middle",
  whiteSpace: "nowrap",
};

interface WeatherHover {
  x: number;
  y: number;
  weather: RideWeather;
}

export function LogbookPage() {
  const { activeAthleteId, setActiveAthleteId } = useActiveAthlete();
  const { data: rideData, isLoading, error } = useRides(activeAthleteId);
  const navigate = useNavigate();

  const [phase, setPhase] = useState("Alle");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [weatherHover, setWeatherHover] = useState<WeatherHover | null>(null);

  const rides = useMemo(() => (rideData?.rides as Ride[] | undefined) ?? [], [rideData]);
  const phases = useMemo(() => getPhaseOptions(rides), [rides]);
  const filtered = useMemo(() => filterRides(rides, phase, search), [rides, phase, search]);
  const sorted = useMemo(() => sortRides(filtered, sort), [filtered, sort]);
  const totalKm = Math.round(sum(filtered, "km"));

  function handleSort(col: string) {
    setSort((current) => nextSort(current, col));
  }

  function handleRowClick(dateISO: string) {
    navigate("/explorer", { state: { highlightDate: dateISO } });
  }

  function handlePlanLinkClick(e: React.MouseEvent, dateISO: string) {
    e.stopPropagation();
    navigate("/planning", { state: { highlightDate: dateISO } });
  }

  return (
    <PageShell>
      <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontFamily: "var(--font-disp)", fontSize: "1.6rem", fontWeight: 600, color: "var(--ink)" }}>
            Fahrtenbuch
          </h1>
          <AthleteToggle activeAthleteId={activeAthleteId} onChange={setActiveAthleteId} />
        </div>

        <GlassCard variant="soft" style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
          {isLoading && <p style={{ color: "var(--ink-3)", margin: 0 }}>Lädt …</p>}
          {!isLoading && error && (
            <p style={{ color: "var(--danger)", margin: 0 }}>Fahrten konnten nicht geladen werden.</p>
          )}

          {!isLoading && !error && (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                {phases.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPhase(p)}
                    style={{
                      padding: "4px 12px",
                      borderRadius: "var(--pill)",
                      border: "1px solid var(--hair)",
                      background: phase === p ? "rgba(255,255,255,0.14)" : "transparent",
                      color: phase === p ? "var(--ink)" : "var(--ink-3)",
                      fontSize: ".78rem",
                      fontWeight: phase === p ? 600 : 500,
                      cursor: "pointer",
                    }}
                  >
                    {p}
                  </button>
                ))}
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Einheit oder Typ suchen…"
                  style={{
                    marginLeft: "auto",
                    padding: "5px 12px",
                    borderRadius: "var(--pill)",
                    border: "1px solid var(--hair)",
                    background: "var(--glass-2)",
                    color: "var(--ink)",
                    fontSize: ".8rem",
                    width: 220,
                  }}
                />
              </div>

              <div style={{ fontSize: ".72rem", color: "var(--ink-3)", letterSpacing: ".02em" }}>
                {filtered.length} Fahrten · {totalKm.toLocaleString("de")} km
              </div>

              <div style={{ overflowX: "auto", border: "1px solid var(--hair)", borderRadius: "var(--radius)" }}>
                <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "collapse", fontSize: ".78rem" }}>
                  <thead>
                    <tr>
                      {COLUMNS.map((c) => {
                        const sortKey = c.sortKey || c.key;
                        const sorted_ = sort.col === sortKey;
                        const icon = c.noSort ? "" : sorted_ ? (sort.dir === "asc" ? "↑" : "↓") : "↕";
                        return (
                          <th
                            key={c.key}
                            onClick={c.noSort ? undefined : () => handleSort(sortKey)}
                            style={{
                              ...TH_STYLE,
                              cursor: c.noSort ? "default" : "pointer",
                              color: sorted_ ? "var(--accent)" : "var(--ink-3)",
                              background: "var(--glass-2)",
                            }}
                          >
                            {c.label}
                            {!c.noSort && (
                              <span style={{ opacity: sorted_ ? 1 : 0.35, marginLeft: 3, fontSize: ".65rem" }}>{icon}</span>
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((r, i) => {
                      const isIntervalsEra = r.dataSource === "intervals";
                      const weekColor = phaseColor(r.phase);
                      const weather = r.weather as RideWeather | null | undefined;
                      const weatherInfo = weather ? classifyWeather(weather) : null;
                      return (
                        <tr
                          // Mehrere Fahrten am selben Tag sind real (AGENTS.md
                          // "Bekannte Eigenheiten": Tiebreaker über startTime)
                          // — `dateISO` allein ist daher kein eindeutiger Key.
                          // `activityId` (intervals.icu) deckt den eigentlichen
                          // Kollisionsfall ab, `i` sichert den seltenen Rest ab
                          // (Notion-Ära ohne activityId).
                          key={`${r.dateISO}-${r.activityId ?? i}`}
                          onClick={() => handleRowClick(r.dateISO)}
                          style={{ cursor: "pointer" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--glass-2)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <td style={TD_STYLE}>{r.dateShort}</td>
                          <td style={TD_STYLE}>
                            {r.week ? (
                              <span
                                style={{
                                  fontFamily: "var(--font-mono)",
                                  fontSize: ".68rem",
                                  fontWeight: 600,
                                  padding: "2px 8px",
                                  borderRadius: "var(--pill)",
                                  background: `${weekColor}22`,
                                  color: weekColor,
                                  boxShadow: `inset 0 0 0 1px ${weekColor}44`,
                                }}
                              >
                                {weekDisplayLabels([r.week])[0]}
                              </span>
                            ) : (
                              "–"
                            )}
                          </td>
                          <td
                            style={{ ...TD_STYLE, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", fontWeight: 500 }}
                            title={r.name || ""}
                          >
                            {r.name || "–"}
                            {isIntervalsEra && (
                              <span
                                onClick={(e) => handlePlanLinkClick(e, r.dateISO)}
                                title="Im Planungstab öffnen"
                                style={{ marginLeft: 6, cursor: "pointer" }}
                              >
                                📅
                              </span>
                            )}
                          </td>
                          <td style={{ ...TD_STYLE, fontSize: ".72rem", color: "var(--ink-3)" }}>{r.typ || "–"}</td>
                          <td style={{ ...TD_STYLE, fontWeight: 600 }}>{fmt(r.km)}</td>
                          <td style={TD_STYLE}>{fmtInt(r.min)}</td>
                          <td style={TD_STYLE}>{r.kmh ? fmt(r.kmh) : "–"}</td>
                          <td style={TD_STYLE}>{fmtInt(r.hf)}</td>
                          <td style={TD_STYLE}>{fmtInt(r.hfMax)}</td>
                          <td style={TD_STYLE}>{fmtInt(r.kad)}</td>
                          <td style={TD_STYLE}>{fmtInt(r.watt)}</td>
                          <td style={TD_STYLE}>{fmtInt(r.np)}</td>
                          <td style={TD_STYLE}>{fmtInt(r.trimp)}</td>
                          <td style={TD_STYLE}>{r.ctl != null ? fmt(r.ctl) : "–"}</td>
                          <td style={TD_STYLE}>
                            {weather && weatherInfo ? (
                              <span
                                style={{ fontSize: ".72rem", cursor: "help", color: weatherInfo.color }}
                                onMouseEnter={(e) =>
                                  setWeatherHover({ x: e.clientX, y: e.clientY, weather })
                                }
                                onMouseMove={(e) =>
                                  setWeatherHover((cur) => (cur ? { ...cur, x: e.clientX, y: e.clientY } : cur))
                                }
                                onMouseLeave={() => setWeatherHover(null)}
                              >
                                {weatherIcon(weather.weatherCode)} {weather.temp}°C · {weatherInfo.windKmh} km/h
                              </span>
                            ) : r.wetter ? (
                              <span style={{ color: "var(--ink-3)" }}>{r.wetter}</span>
                            ) : (
                              "–"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </GlassCard>
      </div>

      {weatherHover &&
        (() => {
          const w = weatherHover.weather;
          const info = classifyWeather(w);
          return (
            <ChartTooltip x={weatherHover.x} y={weatherHover.y}>
              <div>
                {weatherIcon(w.weatherCode)} {w.temp}°C · gefühlt {w.tempFeel}°C
              </div>
              <div>💨 Wind: {info.windKmh} km/h {windDir(w.windDir)}</div>
              {w.humidity != null && <div>💧 Luftfeuchtigkeit: {w.humidity}%</div>}
              {w.cloudCover != null && <div>☁️ Bewölkung: {w.cloudCover}%</div>}
              {(w.precip || 0) > 0 && <div>🌧 Niederschlag: {w.precip}mm Regen</div>}
              <div style={{ marginTop: 4 }}>{info.condLabel}</div>
            </ChartTooltip>
          );
        })()}
    </PageShell>
  );
}

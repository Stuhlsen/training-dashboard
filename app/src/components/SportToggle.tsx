// api/ direkt statt über hooks/-Orchestrierung: schmale, bewusste Ausnahme
// wie `useActiveAthlete` in Layout.tsx — useActiveSport/useEffectiveSport sind
// reine localStorage-Hooks ohne I/O (AGENTS.md-Abhängigkeitstabelle).
import { useEffectiveSport, type ActiveSport } from "../api/hooks/useActiveSport";
import { usePlanningSportFilter, type PlanningSportFilter } from "../api/hooks/usePlanningSportFilter";

interface SportToggleProps {
  athleteId: string;
  /** `global` (Standard): der app-weite Sport-Umschalter. `planning-filter`
   *  (Fahrplan 44 E1): auf der Planungsseite derselbe Platz im Header, aber als
   *  Filter mit "Alle" — liest/schreibt nur `usePlanningSportFilter`, nie
   *  `useActiveSport`. Es gibt dort so keinen zweiten, widersprüchlichen
   *  Umschalter. */
  mode?: "global" | "planning-filter";
}

const SPORT_LABEL: Record<PlanningSportFilter, string> = {
  all: "Alle",
  ride: "Radfahren",
  run: "Laufen",
  swim: "Schwimmen",
};

/** Sport-Umschalter unter dem Athleten-Toggle (Fahrplan 10 E8a). Sichtbar NUR
 *  für Athleten mit mehr als einer Sportart (`config.ts::sports`) — für
 *  Athlet 1/2/4 rendert die Komponente `null`, die Oberfläche bleibt exakt wie
 *  bisher. Optik/Aktiv-Stil 1:1 wie `AthleteToggle.tsx` (heller Overlay-Fill,
 *  gleitender Highlight). */
export function SportToggle({ athleteId, mode = "global" }: SportToggleProps) {
  const { effectiveSport, setActiveSport, sports } = useEffectiveSport(athleteId);
  const planning = usePlanningSportFilter(athleteId);
  const isFilter = mode === "planning-filter";

  const sportPills = (sports as readonly string[]).filter(
    (s): s is ActiveSport => s === "ride" || s === "run" || s === "swim",
  );
  if (sportPills.length <= 1) return null;
  const pills: PlanningSportFilter[] = isFilter ? ["all", ...sportPills] : sportPills;
  const current: PlanningSportFilter = isFilter ? planning.filter : effectiveSport;
  const select = (s: PlanningSportFilter) => {
    if (isFilter) planning.setFilter(s);
    else if (s !== "all") setActiveSport(s);
  };

  const activeIndex = Math.max(0, pills.indexOf(current));

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        background: "var(--hair)",
        borderRadius: "var(--pill)",
        padding: 4,
        // Feste px-Breite statt min(100%, …) — Begründung wie AthleteToggle.tsx
        // (Prozent-Breite kollabiert hier auf Text-Mindestbreite statt zu
        // schrumpfen; Elterncontainer `.app-header-toggles` fängt schmale
        // Viewports über overflow-x:auto ab, Playwright-Nachtest 22.09.2026).
        width: pills.length * (isFilter ? 82 : 104), // Filter hat eine Pille mehr ("Alle") — schmaler, damit er auf dem Handy nicht scrollt
        backdropFilter: "blur(10px)",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 4,
          bottom: 4,
          left: 4,
          width: `calc(${100 / pills.length}% - 4px)`,
          borderRadius: "var(--pill)",
          background: "rgba(255,255,255,0.18)",
          boxShadow: "0 2px 10px rgba(0,0,0,.45)",
          transform: `translateX(${activeIndex * 100}%)`,
          transition: "transform .28s cubic-bezier(.4,0,.2,1)",
        }}
      />
      {pills.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => select(s)}
          aria-pressed={s === current}
          style={{
            position: "relative",
            zIndex: 1,
            flex: 1,
            border: 0,
            background: "transparent",
            padding: "6px 0",
            font: "inherit",
            fontSize: ".8rem",
            fontWeight: 500,
            color: "var(--ink)",
            cursor: "pointer",
          }}
        >
          {SPORT_LABEL[s]}
        </button>
      ))}
    </div>
  );
}

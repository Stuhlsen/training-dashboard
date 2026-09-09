// api/ direkt statt über hooks/-Orchestrierung: schmale, bewusste Ausnahme
// wie `useActiveAthlete` in Layout.tsx — useActiveSport/useEffectiveSport sind
// reine localStorage-Hooks ohne I/O (AGENTS.md-Abhängigkeitstabelle).
import { useEffectiveSport, type ActiveSport } from "../api/hooks/useActiveSport";

interface SportToggleProps {
  athleteId: string;
}

const SPORT_LABEL: Record<ActiveSport, string> = {
  ride: "Rad",
  run: "Lauf",
  swim: "Schwimm",
};

/** Sport-Umschalter unter dem Athleten-Toggle (Fahrplan 10 E8a). Sichtbar NUR
 *  für Athleten mit mehr als einer Sportart (`config.ts::sports`) — für
 *  Athlet 1/2/4 rendert die Komponente `null`, die Oberfläche bleibt exakt wie
 *  bisher. Optik/Aktiv-Stil 1:1 wie `AthleteToggle.tsx` (heller Overlay-Fill,
 *  gleitender Highlight). */
export function SportToggle({ athleteId }: SportToggleProps) {
  const { effectiveSport, setActiveSport, sports } = useEffectiveSport(athleteId);

  const pills = (sports as readonly string[]).filter(
    (s): s is ActiveSport => s === "ride" || s === "run" || s === "swim",
  );
  if (pills.length <= 1) return null;

  const activeIndex = Math.max(0, pills.indexOf(effectiveSport));

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        background: "var(--hair)",
        borderRadius: "var(--pill)",
        padding: 4,
        width: pills.length * 104,
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
          onClick={() => setActiveSport(s)}
          aria-pressed={s === effectiveSport}
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

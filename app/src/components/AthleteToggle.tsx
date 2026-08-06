import { ATHLETES } from "../config";

interface AthleteToggleProps {
  activeAthleteId: string;
  onChange: (id: string) => void;
}

/** Geteilter Pill-Toggle (Hero-Header, Etappe 4; wiederverwendet ab Etappe 5)
 *  — Athletennamen kommen aus `config.ts` (ATHLETES), keine hartkodierten
 *  Namen (Datenschutz-Konvention). */
export function AthleteToggle({ activeAthleteId, onChange }: AthleteToggleProps) {
  const activeIndex = Math.max(
    0,
    ATHLETES.findIndex((a) => a.id === activeAthleteId),
  );

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        background: "var(--hair)",
        borderRadius: "var(--pill)",
        padding: 4,
        width: 248,
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
          width: `calc(${100 / ATHLETES.length}% - 4px)`,
          borderRadius: "var(--pill)",
          background: "rgba(255,255,255,0.18)",
          boxShadow: "0 2px 10px rgba(0,0,0,.45)",
          transform: `translateX(${activeIndex * 100}%)`,
          transition: "transform .28s cubic-bezier(.4,0,.2,1)",
        }}
      />
      {ATHLETES.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => onChange(a.id)}
          aria-pressed={a.id === activeAthleteId}
          style={{
            position: "relative",
            zIndex: 1,
            flex: 1,
            border: 0,
            background: "transparent",
            padding: "8px 0",
            font: "inherit",
            fontSize: ".86rem",
            fontWeight: 500,
            color: "var(--ink)",
            cursor: "pointer",
          }}
        >
          {a.name}
        </button>
      ))}
    </div>
  );
}

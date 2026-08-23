import { GlassCard } from "../../components/GlassCard";
import type { HeroViewModel } from "./hero-view-model";

interface PowerScaleProps {
  powerScale: HeroViewModel["powerScale"];
  whatIf: HeroViewModel["whatIf"];
  whatIfFtp: number;
  onWhatIfChange: (value: number) => void;
  eftpVal: number | null;
}

const PIN_COLOR: Record<HeroViewModel["powerScale"]["pins"][number]["kind"], string> = {
  ramp: "var(--ink-2)",
  eftp: "var(--accent-2)",
  goal: "var(--ink)",
};

/** Leistungsskala (Coggan-Zonen) + What-if-Slider, eine Kachel mit zwei
 *  Spalten (Hero-Weitwinkel.dc.html: `grid-template-columns:minmax(0,2.15fr)
 *  minmax(0,1fr)`) statt zweier untereinander gestapelter Abschnitte wie im
 *  Vorgänger-Export. Zonensegmente/Pins kommen fertig berechnet aus
 *  hero-view-model.ts (`core/zones.js`/`core/ftp-progress.js`); der
 *  Sliderwert selbst ist reiner Komponenten-Zustand in HeroPage (nur
 *  Vorschau, kein Schreiben). */
export function PowerScale({ powerScale, whatIf, whatIfFtp, onWhatIfChange, eftpVal }: PowerScaleProps) {
  const remaining = eftpVal != null ? Math.max(0, whatIfFtp - eftpVal) : null;
  const fillPct = ((whatIfFtp - whatIf.min) / (whatIf.max - whatIf.min)) * 100;

  return (
    <GlassCard
      variant="soft"
      radius="24px"
      style={{
        padding: "28px clamp(24px,2.4vw,40px) 30px",
        display: "grid",
        gridTemplateColumns: "minmax(0,2.15fr) minmax(0,1fr)",
        gap: "clamp(24px,3vw,52px)",
        alignItems: "start",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        <span style={{ fontSize: "var(--fs-tile-title)", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--ink)", fontWeight: 700 }}>
          Leistungsskala · Watt
        </span>

        <div style={{ position: "relative", marginTop: 4 }}>
          <div style={{ display: "flex", height: 16, borderRadius: 9, overflow: "hidden" }}>
            {powerScale.segments.map((z) => (
              <div key={z.id} style={{ flex: `0 0 ${z.pct.toFixed(2)}%`, background: z.color }} />
            ))}
          </div>
          {powerScale.sweetSpot && (
            <div
              style={{
                position: "absolute",
                top: -4,
                bottom: -4,
                left: `${powerScale.sweetSpot.leftPct.toFixed(2)}%`,
                width: `${powerScale.sweetSpot.widthPct.toFixed(2)}%`,
                border: "1px solid var(--accent-2)",
                borderRadius: 4,
                pointerEvents: "none",
              }}
            />
          )}
          {powerScale.pins.map((p) => {
            const tall = p.kind === "eftp";
            return (
              <div
                key={p.label}
                title={p.label}
                style={{
                  position: "absolute",
                  top: tall ? -7 : -4,
                  bottom: tall ? -7 : -4,
                  left: `${p.pct.toFixed(2)}%`,
                  width: p.kind === "goal" ? 0 : 2,
                  background: p.kind === "goal" ? undefined : PIN_COLOR[p.kind],
                  borderLeft: p.kind === "goal" ? `2px dashed ${PIN_COLOR.goal}` : undefined,
                  boxShadow: tall ? "0 0 10px color-mix(in oklab, var(--accent) 60%, transparent)" : undefined,
                  transform: "translateX(-50%)",
                  borderRadius: 2,
                }}
              />
            );
          })}
        </div>

        <div style={{ display: "flex", fontSize: ".72rem", color: "var(--ink-3)", letterSpacing: ".05em" }}>
          {powerScale.segments.map((z) => (
            <span key={z.id} style={{ flex: `0 0 ${z.pct.toFixed(2)}%`, textAlign: "center" }}>
              {z.pct >= 6 ? z.id.toUpperCase() : ""}
            </span>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap", marginTop: 4 }}>
          {powerScale.pins.map((p) => (
            <span key={p.label} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: ".82rem", color: "var(--ink-2)" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: PIN_COLOR[p.kind] }} />
              {p.label}
            </span>
          ))}
          <span style={{ marginLeft: "auto", fontSize: ".78rem", color: "var(--ink-3)" }}>0 – {powerScale.scaleMax} W</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingLeft: "clamp(0px,2vw,28px)", borderLeft: "1px solid var(--hair)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16 }}>
          <span style={{ fontSize: ".72rem", letterSpacing: ".13em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>
            What-if · Ziel-FTP
          </span>
          <span style={{ fontSize: "1.6rem", fontWeight: 600, color: "var(--ink)" }}>{whatIfFtp} W</span>
        </div>
        <input
          type="range"
          min={whatIf.min}
          max={whatIf.max}
          step={1}
          value={whatIfFtp}
          onChange={(e) => onWhatIfChange(Number(e.target.value))}
          aria-label="Ziel-FTP für die Leistungsskala (nur Vorschau, ändert nicht das echte Saisonziel)"
          style={{
            WebkitAppearance: "none",
            appearance: "none",
            width: "100%",
            height: 5,
            borderRadius: "var(--pill)",
            background: `linear-gradient(var(--accent), var(--accent)) 0/${fillPct.toFixed(1)}% 100% no-repeat, rgba(255,255,255,.14)`,
            cursor: "pointer",
          }}
        />
        <span style={{ fontSize: ".8rem", color: "var(--ink-3)", lineHeight: 1.5 }}>
          {remaining == null
            ? `Ziel-FTP ${whatIfFtp} W`
            : remaining > 0
              ? `noch ${remaining} W bis ${whatIfFtp} W (Skala nur Vorschau — echtes Saisonziel siehe Ring)`
              : `Ziel-FTP ${whatIfFtp} W bereits erreicht`}
        </span>
      </div>
    </GlassCard>
  );
}

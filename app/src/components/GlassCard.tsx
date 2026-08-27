import type { CSSProperties, MouseEvent, ReactNode } from "react";

interface GlassCardProps {
  children: ReactNode;
  /** "strong" = Tier-1-Optik (--glass, größerer Schatten), "soft" = Tier-2/3
   *  (--glass-2, kleinerer Schatten) — Muster aus Hero-Ebenen.dc.html. */
  variant?: "strong" | "soft";
  radius?: string;
  style?: CSSProperties;
  className?: string;
  /** Optional — für Anker-Sprungnavigation (Settings-Redesign, Sprung-Nav). */
  id?: string;
  /** Optional — direkte `style`-Mutation am Hover-Ziel (Muster aus
   *  LogbookPage.tsx), da diese App keine CSS-Datei für `:hover` hat. */
  onMouseEnter?: (e: MouseEvent<HTMLDivElement>) => void;
  onMouseLeave?: (e: MouseEvent<HTMLDivElement>) => void;
}

/** Geteilte Glass/Blur-Card-Hülle — Design-Grundbaustein aus dem
 *  Hero-Redesign-Export (`--glass`/`--glass-2`, `--e2`/`--e3`), von allen
 *  drei Hero-Tiers genutzt und für spätere Bereiche wiederverwendbar. */
export function GlassCard({ children, variant = "soft", radius = "var(--radius-lg)", style, className, id, onMouseEnter, onMouseLeave }: GlassCardProps) {
  return (
    <div
      id={id}
      className={className}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        background: variant === "strong" ? "var(--glass)" : "var(--glass-2)",
        backdropFilter: "blur(var(--blur, 16px))",
        borderRadius: radius,
        boxShadow: variant === "strong" ? "var(--e3)" : "var(--e2)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

import type { CSSProperties, ReactNode } from "react";

interface GlassCardProps {
  children: ReactNode;
  /** "strong" = Tier-1-Optik (--glass, größerer Schatten), "soft" = Tier-2/3
   *  (--glass-2, kleinerer Schatten) — Muster aus Hero-Ebenen.dc.html. */
  variant?: "strong" | "soft";
  radius?: string;
  style?: CSSProperties;
  className?: string;
}

/** Geteilte Glass/Blur-Card-Hülle — Design-Grundbaustein aus dem
 *  Hero-Redesign-Export (`--glass`/`--glass-2`, `--e2`/`--e3`), von allen
 *  drei Hero-Tiers genutzt und für spätere Bereiche wiederverwendbar. */
export function GlassCard({ children, variant = "soft", radius = "var(--radius-lg)", style, className }: GlassCardProps) {
  return (
    <div
      className={className}
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

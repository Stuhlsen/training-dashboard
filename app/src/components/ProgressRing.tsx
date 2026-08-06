import type { ReactNode } from "react";

interface ProgressRingProps {
  size: number;
  strokeWidth: number;
  /** 0–1, geklemmt liefert der Aufrufer (core/ftp-progress.js::ringProgress) */
  progress: number;
  color: string;
  trackColor?: string;
  children?: ReactNode;
}

/** Geteilter SVG-Fortschrittsring (Muster Hero-Ebenen.dc.html: `pathLength`
 *  auf 100 fixiert, `stroke-dasharray` direkt in Prozent — kein manuelles
 *  Umrechnen über den Kreisumfang nötig). Hero braucht zwei Instanzen
 *  (eFTP/Ramp-Test), spätere Bereiche potenziell weitere. */
export function ProgressRing({ size, strokeWidth, progress, color, trackColor = "rgba(255,255,255,0.09)", children }: ProgressRingProps) {
  const r = (size - strokeWidth) / 2;
  const pct = Math.max(0, Math.min(1, progress)) * 100;
  const center = size / 2;

  return (
    <div style={{ position: "relative", width: size, height: size, flex: "none" }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle cx={center} cy={center} r={r} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${pct.toFixed(1)} 100`}
          style={{ transform: "rotate(-90deg)", transformOrigin: "center" }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
        }}
      >
        {children}
      </div>
    </div>
  );
}

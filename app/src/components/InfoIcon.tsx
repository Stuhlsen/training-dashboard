import type { CSSProperties } from "react";

interface InfoIconProps {
  /** Kantenlänge; Default 1em, damit das Symbol mit der Schriftgröße skaliert. */
  size?: string | number;
  style?: CSSProperties;
}

/** Info-Symbol (Kreis mit "i") als SVG statt des Unicode-Zeichens "ⓘ": das
 *  Zeichen kommt je nach System aus einer Ersatzschrift und sah in der
 *  Oberfläche altbacken und ungleichmäßig aus. Erbt die Farbe vom Text
 *  (`currentColor`), rein dekorativ — der Text daneben trägt die Bedeutung. */
export function InfoIcon({ size = "1em", style }: InfoIconProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      style={{ display: "inline-block", verticalAlign: "-0.15em", flexShrink: 0, ...style }}
    >
      <circle cx="8" cy="8" r="6.6" />
      <path d="M8 7.2v3.6" />
      <circle cx="8" cy="4.9" r="0.55" fill="currentColor" stroke="none" />
    </svg>
  );
}

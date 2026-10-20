import { getEnvironment } from "../api/supabase/config";

/** Kleine Pill statt nacktem Text (Etappe 11a) — nur sichtbar, wenn NICHT
 *  Prod: ein Dev-Stand soll im Header sofort auffallen, auf der echten
 *  Live-Seite hat die Markierung nichts zu suchen. "unknown" (z.B. eine
 *  Preview-URL) bleibt sichtbar, weil das gerade dann relevant ist.
 *  "demo" (Fahrplan 31): fiktive Daten — eigene, entwarnende Farbe (`--ok`),
 *  damit Demo und dev (echte Daten, `--warn`) nie verwechselt werden. */
const LABELS: Record<string, string> = { demo: "Demo" };

export function EnvBadge() {
  const env = getEnvironment();
  if (env === "prod") return null;
  const tone = env === "dev" ? "var(--warn)" : env === "demo" ? "var(--ok)" : null;
  return (
    <span
      data-testid="env-badge"
      style={{
        padding: "3px 10px",
        borderRadius: "var(--pill)",
        fontFamily: "var(--font-mono)",
        fontSize: ".68rem",
        fontWeight: 600,
        letterSpacing: ".08em",
        textTransform: "uppercase",
        color: tone ?? "var(--ink-3)",
        boxShadow: `inset 0 0 0 1px ${tone ? `color-mix(in oklab, ${tone} 45%, transparent)` : "var(--hair)"}`,
      }}
    >
      {LABELS[env] ?? env}
    </span>
  );
}

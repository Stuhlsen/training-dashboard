import { getEnvironment } from "../api/supabase/config";

/** Kleine Pill statt nacktem Text (Etappe 11a) — dev bekommt eine warme
 *  Akzentfarbe, damit ein Dev-Stand im Header sofort auffällt, prod/unknown
 *  bleiben neutral. */
export function EnvBadge() {
  const env = getEnvironment();
  const isDev = env === "dev";
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
        color: isDev ? "var(--warn)" : "var(--ink-3)",
        boxShadow: `inset 0 0 0 1px ${isDev ? "color-mix(in oklab, var(--warn) 45%, transparent)" : "var(--hair)"}`,
      }}
    >
      {env}
    </span>
  );
}

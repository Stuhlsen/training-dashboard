export type Environment = "dev" | "prod" | "unknown";

interface SupabaseHostConfig {
  env: "dev" | "prod";
  projectUrl: string;
  anonKey: string;
}

const SUPABASE_CONFIG: Record<string, SupabaseHostConfig> = {
  localhost: {
    env: "dev",
    projectUrl: "https://wxkuwhzpsbkmbhaqrurv.supabase.co",
    anonKey:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4a3V3aHpwc2JrbWJoYXFydXJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwNDg4NDQsImV4cCI6MjA5OTYyNDg0NH0.l3PuErI7TJr7IRBYE4wSAUH0ZHiDS2sLWehdHOlXk1Q",
  },
  "stuhlsen.github.io": {
    env: "prod",
    projectUrl: "https://hznvnkoglomzzjeeheit.supabase.co",
    anonKey:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6bnZua29nbG9tenpqZWVoZWl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0ODc5OTUsImV4cCI6MjEwMTA2Mzk5NX0.EmkPYDM4kVFWletJAzRzNClbqrQA1Y0DeTO3ORz4mCA",
  },
};

/** Liest den SUPABASE_CONFIG-Eintrag für den aktuellen Hostname (roh, ohne
 *  Vollständigkeitsprüfung) — von getConfig() und getEnvironment() geteilt,
 *  damit die Host/Port-Auflösung nur an einer Stelle steht. */
function resolveEntry(): SupabaseHostConfig | null {
  const host = window.location.hostname;
  const port = window.location.port ? `:${window.location.port}` : "";
  const fullHost = port ? `${host}${port}` : host;
  return SUPABASE_CONFIG[fullHost] || SUPABASE_CONFIG[host] || null;
}

/** Liefert die Supabase-Config für den aktuellen Hostname, oder null wenn
 *  der Host unbekannt ist oder die Config (noch) leere Platzhalter hat. */
export function getConfig(): SupabaseHostConfig | null {
  const cfg = resolveEntry();
  if (!cfg || !cfg.projectUrl || !cfg.anonKey) return null;
  return cfg;
}

/** Umgebungs-Label für die Header-Markierung — bewusst UNABHÄNGIG von
 *  projectUrl/anonKey (anders als getConfig()). 'unknown' für einen nicht
 *  gelisteten Host (z.B. eine Preview-URL). */
export function getEnvironment(): Environment {
  return resolveEntry()?.env ?? "unknown";
}

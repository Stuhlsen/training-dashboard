import { fmtDateFull } from "../core/format.js";
import { athleteConfig } from "../config";
// api/ direkt statt über hooks/-Orchestrierung: schmale, bewusste Ausnahme
// wie `config`/`auth` (AGENTS.md-Abhängigkeitstabelle) — useActiveAthlete
// ist ein reiner localStorage-Hook ohne I/O, kein Unterschied zur
// auth-Ausnahme in EnvBadge.tsx/Layout.tsx/ProtectedRoute.tsx.
import { useActiveAthlete } from "../api/hooks/useActiveAthlete";

/** App-Version + Build-Datum + Datenquelle des aktiven Athleten unten auf
 *  jeder Seite (Issue #6, Datenquelle ergänzt per Review-Kommentar
 *  23.08.2026 — saß vorher in der Hero-Kopfzeile, dort ohne erkennbaren
 *  Athletenbezug; hier neben dem global sichtbaren Athleten-Toggle in der
 *  Menüleiste ist die Zuordnung "wessen Daten, woher" eindeutig). Werte
 *  kommen von `vite.config.ts::define` (`__APP_VERSION__`/`__BUILD_DATE__`),
 *  zur Build-Zeit fest eingesetzt — kein Laufzeit-Fetch nötig. */
export function Footer() {
  const { activeAthleteId } = useActiveAthlete();
  const athleteCfg = athleteConfig(activeAthleteId);
  const sources = (athleteCfg?.dataSources ?? []).join(" + ");

  return (
    <footer
      style={{
        padding: "20px clamp(20px,3vw,48px) 32px",
        textAlign: "center",
        fontFamily: "var(--font-mono)",
        fontSize: ".72rem",
        color: "var(--ink-3)",
        opacity: 0.6,
      }}
    >
      {athleteCfg?.name}
      {sources ? ` · ${sources}` : ""} · {__APP_VERSION__} · gebaut am {fmtDateFull(__BUILD_DATE__.slice(0, 10))}
    </footer>
  );
}

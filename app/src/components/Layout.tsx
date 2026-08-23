import type { CSSProperties } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { EnvBadge } from "./EnvBadge";
import { Footer } from "./Footer";
import { AthleteToggle } from "./AthleteToggle";
import { useAuth } from "../api/auth/useAuth";
// api/ direkt statt über hooks/-Orchestrierung: schmale, bewusste Ausnahme
// wie `auth` oben — useActiveAthlete ist ein reiner localStorage-Hook ohne
// I/O (AGENTS.md-Abhängigkeitstabelle).
import { useActiveAthlete } from "../api/hooks/useActiveAthlete";

/** "Settings" bewusst NICHT hier — sitzt rechts bei den User-Funktionen
 *  (Abmelden/Anmelden), nicht bei den Inhalts-Tabs (Review-Kommentar,
 *  Hero-Tab-Redesign 23.08.2026). */
const NAV_ITEMS = [
  { to: "/", label: "Hero", end: true },
  { to: "/planning", label: "Planungstab" },
  { to: "/log", label: "Fahrtenbuch" },
  { to: "/analysis", label: "Analyse" },
  { to: "/events", label: "Events" },
];

const PILL_BUTTON_STYLE: CSSProperties = {
  padding: "8px 16px",
  borderRadius: "var(--pill)",
  border: "1px solid var(--hair)",
  fontFamily: "var(--font-disp)",
  fontWeight: 600,
  fontSize: ".86rem",
  whiteSpace: "nowrap",
  cursor: "pointer",
  textDecoration: "none",
};

/** Gemeinsame Kopfzeile für alle Hauptseiten (Etappe 11a) — vorher nacktes
 *  HTML ohne jede Gestaltung. Pill-Optik/Glass-Sticky-Bar aus
 *  assets/css/components.css::.tabs/.tab-btn übernommen, aber an die
 *  bereits im React-Port etablierte Pill-Konvention angeglichen (heller
 *  Overlay-Fill statt vollflächigem `--accent`, s. AthleteToggle.tsx/
 *  WellnessChart.tsx-Metrik-Umschalter) statt eine zweite, abweichende
 *  Pill-Optik einzuführen. */
export function Layout() {
  const { session, signOut } = useAuth();
  const { activeAthleteId, setActiveAthleteId } = useActiveAthlete();

  return (
    <div>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          gap: 20,
          padding: "14px clamp(20px,3vw,48px)",
          background: "color-mix(in oklab, var(--surface-page) 72%, transparent)",
          backdropFilter: "blur(14px)",
          borderBottom: "1px solid var(--hair)",
        }}
      >
        <nav style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, justifySelf: "start" }}>
          <EnvBadge />
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              style={({ isActive }) => ({
                ...PILL_BUTTON_STYLE,
                background: isActive ? "rgba(255,255,255,0.14)" : "transparent",
                color: isActive ? "var(--ink)" : "var(--ink-3)",
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ justifySelf: "center" }}>
          <AthleteToggle activeAthleteId={activeAthleteId} onChange={setActiveAthleteId} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifySelf: "end" }}>
          <NavLink
            to="/settings"
            style={({ isActive }) => ({
              ...PILL_BUTTON_STYLE,
              background: isActive ? "rgba(255,255,255,0.14)" : "transparent",
              color: isActive ? "var(--ink)" : "var(--ink-3)",
            })}
          >
            Settings
          </NavLink>
          {session ? (
            <button
              type="button"
              onClick={() => void signOut()}
              style={{ ...PILL_BUTTON_STYLE, background: "transparent", color: "var(--ink-3)" }}
            >
              Abmelden
            </button>
          ) : (
            <NavLink
              to="/login"
              style={({ isActive }) => ({
                ...PILL_BUTTON_STYLE,
                background: isActive ? "rgba(255,255,255,0.14)" : "var(--hair)",
                color: "var(--ink)",
              })}
            >
              Anmelden
            </NavLink>
          )}
        </div>
      </header>
      <main>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

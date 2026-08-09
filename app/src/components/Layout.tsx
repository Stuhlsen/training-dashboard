import type { CSSProperties } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { EnvBadge } from "./EnvBadge";
import { useAuth } from "../api/auth/useAuth";

const NAV_ITEMS = [
  { to: "/", label: "Hero", end: true },
  { to: "/planning", label: "Planungstab" },
  { to: "/explorer", label: "Explorer" },
  { to: "/log", label: "Fahrtenbuch" },
  { to: "/analysis", label: "Analyse" },
  { to: "/events", label: "Events" },
  { to: "/settings", label: "Settings" },
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

  return (
    <div>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          display: "flex",
          alignItems: "center",
          gap: 20,
          flexWrap: "wrap",
          padding: "14px clamp(20px,3vw,48px)",
          background: "color-mix(in oklab, var(--surface-page) 72%, transparent)",
          backdropFilter: "blur(14px)",
          borderBottom: "1px solid var(--hair)",
        }}
      >
        <EnvBadge />
        <nav style={{ display: "flex", flexWrap: "wrap", gap: 8, marginRight: "auto" }}>
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
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

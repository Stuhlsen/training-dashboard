import { NavLink, Outlet } from "react-router-dom";
import { EnvBadge } from "./EnvBadge";
import { Footer } from "./Footer";
import { AthleteToggle } from "./AthleteToggle";
import { SportToggle } from "./SportToggle";
import { UserMenu } from "./UserMenu";
import { PILL_BUTTON_STYLE } from "./pill-style";
import { useAuth } from "../api/auth/useAuth";
// api/ direkt statt über hooks/-Orchestrierung: schmale, bewusste Ausnahme
// wie `auth` oben — useActiveAthlete ist ein reiner localStorage-Hook ohne
// I/O (AGENTS.md-Abhängigkeitstabelle).
import { useActiveAthlete } from "../api/hooks/useActiveAthlete";
import { useAthleteSports } from "../api/hooks/useAthleteSports";
// hooks/-Schicht: darf api/ laden (AGENTS.md). Damit muss UserMenu (components/)
// den Namen nicht selbst aus api/hooks holen — bekommt ihn als Prop.
import { useAccountLabel } from "../hooks/account-label";

/** "Settings" bewusst NICHT hier — sitzt rechts bei den User-Funktionen
 *  (Abmelden/Anmelden), nicht bei den Inhalts-Tabs (Review-Kommentar,
 *  Hero-Tab-Redesign 23.08.2026). */
const BASE_NAV_ITEMS = [
  { to: "/", label: "Hero", end: true },
  { to: "/planning", label: "Planungstab" },
  { to: "/log", label: "Fahrtenbuch" },
  { to: "/analysis", label: "Analyse" },
  { to: "/events", label: "Events" },
];

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
  const accountLabel = useAccountLabel();

  const sports = useAthleteSports(activeAthleteId);
  const hasCycling = sports.includes("ride");

  const navItems = [
    ...BASE_NAV_ITEMS,
    ...(hasCycling ? [{ to: "/bikefit", label: "Bike-Fit" }] : []),
  ];

  return (
    <div>
      <header className="app-header">
        <nav className="app-header-nav">
          <EnvBadge />
          {navItems.map((item) => (
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
        <div className="app-header-toggles">
          <AthleteToggle activeAthleteId={activeAthleteId} onChange={setActiveAthleteId} />
          <SportToggle athleteId={activeAthleteId} />
        </div>
        <div className="app-header-actions">
          {session ? (
            // Name + Dropdown (Einstellungen / Abmelden) statt separater
            // "Settings"-Pille — s. UserMenu.tsx.
            <UserMenu label={accountLabel} onSignOut={() => void signOut()} />
          ) : (
            <NavLink
              to="/app/login"
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

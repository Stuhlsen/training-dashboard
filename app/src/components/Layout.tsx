import { NavLink, Outlet } from "react-router-dom";
import { EnvBadge } from "./EnvBadge";
import { useAuth } from "../api/auth/useAuth";

const NAV_ITEMS = [
  { to: "/", label: "Hero", end: true },
  { to: "/planning", label: "Planungstab" },
  { to: "/explorer", label: "Explorer" },
  { to: "/events", label: "Events" },
  { to: "/settings", label: "Settings" },
];

export function Layout() {
  const { session, signOut } = useAuth();

  return (
    <div>
      <header>
        <EnvBadge />
        <nav>
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        {session ? (
          <button type="button" onClick={() => void signOut()}>
            Abmelden
          </button>
        ) : (
          <NavLink to="/login">Anmelden</NavLink>
        )}
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

import { NavLink, Outlet } from "react-router-dom";
import { EnvBadge } from "./EnvBadge";
import { useAuth } from "../api/auth/useAuth";

const NAV_ITEMS = [
  { to: "/", label: "Hero", end: true },
  { to: "/planning", label: "Planungstab" },
  { to: "/trainer", label: "Trainer" },
  { to: "/explorer", label: "Explorer" },
  { to: "/events", label: "Events" },
  { to: "/settings", label: "Settings" },
];

export function Layout() {
  const { signOut } = useAuth();

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
        <button type="button" onClick={() => void signOut()}>
          Abmelden
        </button>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

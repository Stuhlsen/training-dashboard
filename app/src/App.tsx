import { Route, Routes } from "react-router-dom";
import { AppBackground } from "./components/AppBackground";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./features/auth/LoginPage";
import { HeroPage } from "./features/hero/HeroPage";
import { PlanningPage } from "./features/planning/PlanningPage";
import { ExplorerPage } from "./features/explorer/ExplorerPage";
import { EventsPage } from "./features/events/EventsPage";
import { LogbookPage } from "./features/logbook/LogbookPage";
import { SettingsPage } from "./features/settings/SettingsPage";

export default function App() {
  return (
    <>
      <AppBackground />
      {/* position:relative + z-index macht ALLE Routen zu "positionierten"
          Nachfahren (CSS-Stacking-Reihenfolge), unabhängig davon, ob die
          jeweilige Seite selbst eine Positionierung setzt — sonst würden
          unstyled Seiten (Login, Layout-Nav: kein position gesetzt) als
          "nicht positionierte" Inhalte UNTER dem fixierten Hintergrund
          gemalt (CSS2.1-Stapelreihenfolge: nicht-positionierte In-Flow-
          Inhalte kommen vor positionierten Nachfahren, auch bei z-index:0/
          auto) — der Hintergrund läge dann sichtbar über der Seite. */}
      <div style={{ position: "relative", zIndex: 1 }}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {/* Sichtbarkeits-Matrix E1 (docs/phase-6-konzept-sichtbarkeit.md):
              Lesedaten/goals/events/plan_cards/proposals sind öffentlich lesbar
              — Login gilt nur fürs Schreiben (bestehende canWrite-Gates) und
              für Settings (rein persönlich: Passwort, Profil, athletengated
              Ziele/FTP/Formate/Datenquellen). Layout wrappt beide Gruppen,
              ProtectedRoute gated deshalb nur noch die Settings-Unterroute,
              nicht mehr den ganzen Baum. */}
          <Route element={<Layout />}>
            <Route index element={<HeroPage />} />
            <Route path="planning" element={<PlanningPage />} />
            <Route path="explorer" element={<ExplorerPage />} />
            <Route path="log" element={<LogbookPage />} />
            <Route path="events" element={<EventsPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Route>
        </Routes>
      </div>
    </>
  );
}

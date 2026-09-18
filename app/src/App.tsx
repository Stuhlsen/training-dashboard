import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppBackground } from "./components/AppBackground";
import { AuthErrorBanner } from "./components/AuthErrorBanner";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { OnboardingGate } from "./features/onboarding/OnboardingGate";
import { LoginPage } from "./features/auth/LoginPage";
import { AcceptInvitePage } from "./features/onboarding/AcceptInvitePage";
import { HeroPage } from "./features/hero/HeroPage";
import { PlanningPage } from "./features/planning/PlanningPage";
import { EventsPage } from "./features/events/EventsPage";
import { LogbookPage } from "./features/logbook/LogbookPage";
import { AnalysisPage } from "./features/analysis/AnalysisPage";
import { SettingsPage } from "./features/settings/SettingsPage";

/** `<Navigate>` allein wuerde `location.state` (z. B. ein mitgereichtes
 *  `highlightDate`) beim Redirect verwerfen, statt es weiterzureichen — bei
 *  einem alten "/explorer"-Link mit State liesse das AnalysisPage.tsx auf
 *  dem "Kennzahlen"-Tab statt "Verläufe" landen, obwohl der Sprung genau
 *  dorthin wollte. */
function ExplorerRedirect() {
  const location = useLocation();
  return <Navigate to="/analysis" replace state={location.state} />;
}

export default function App() {
  return (
    <>
      <AppBackground />
      <AuthErrorBanner />
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
          <Route path="/onboarding/accept" element={<AcceptInvitePage />} />
          {/* Sichtbarkeits-Matrix E1 (docs/phase-6-konzept-sichtbarkeit.md):
              Lesedaten/goals/events/plan_cards/proposals sind öffentlich lesbar
              — Login gilt nur fürs Schreiben (bestehende canWrite-Gates) und
              für Settings (rein persönlich: Passwort, Profil, athletengated
              Ziele/FTP/Formate/Datenquellen). Layout wrappt beide Gruppen,
              ProtectedRoute gated deshalb nur noch die Settings-Unterroute,
              nicht mehr den ganzen Baum. */}
          {/* OnboardingGate wrapt die ganze eingeloggte App (nicht nur
              /settings wie ProtectedRoute): eine frisch eingeladene Person
              (has_password === false) landet nach dem Invite-Link auf
              irgendeiner Route — der Assistent muss dort greifen, nicht nur
              beim gezielten Settings-Aufruf (Fahrplan 17 E7). */}
          <Route element={<OnboardingGate />}>
            <Route element={<Layout />}>
              <Route index element={<HeroPage />} />
              <Route path="planning" element={<PlanningPage />} />
              {/* Explorer war bis Etappe Layout-Merge 2026-08-20 eine eigene
                  Route — jetzt der "Verläufe"-Tab in AnalysisPage.tsx (Critique-
                  Fund P1: "Analyse" hatte keine Charts). Redirect für alte
                  Lesezeichen/Links. */}
              <Route path="explorer" element={<ExplorerRedirect />} />
              <Route path="log" element={<LogbookPage />} />
              <Route path="analysis" element={<AnalysisPage />} />
              <Route path="events" element={<EventsPage />} />
              <Route element={<ProtectedRoute />}>
                <Route path="settings" element={<SettingsPage />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </div>
    </>
  );
}

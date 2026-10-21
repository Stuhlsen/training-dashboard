/* ============================================================
   FEATURES/ONBOARDING/ONBOARDINGGATE.TSX — Fahrplan 17 E7

   Gate für den Onboarding-Assistenten: eingeloggt + `has_password === false`
   → Assistent statt normaler App (ProtectedRoute.tsx-Äquivalent, s. V5-
   Contract). Bewusst NICHT in components/ProtectedRoute.tsx: der Assistent
   muss unabhängig von der angefragten Route greifen (eine frisch
   eingeladene Person landet z. B. auf der Hero-Seite, die öffentlich lesbar
   ist und deshalb NICHT hinter ProtectedRoute liegt — s. Sichtbarkeits-
   Matrix-Kommentar in App.tsx). Lebt deshalb in features/onboarding/ statt
   components/, weil er dafür `useProfileBasics()` (api/hooks) braucht —
   components/ darf `api/` laut Schichtenregel nicht direkt importieren
   (nur die schmale auth/config-Ausnahme, die genau dafür nicht reicht).

   `showWizard` ist eine EINMALIGE Entscheidung (nicht live aus dem
   `hasPassword`-Query-Cache abgeleitet): useSetInitialPassword() (Schritt 1
   im Assistenten) setzt den `profileBasics`-Cache sofort optimistisch auf
   `hasPassword: true`, sobald das Passwort steht — noch bevor Profil-/
   intervals.icu-Schritt liefen. Ein live abgeleitetes `basics.hasPassword
   === false` würde das Gate dadurch MITTEN im Assistenten auf die normale
   App zurückschalten. `showWizard` wird deshalb einmal beim ersten
   geladenen Stand fixiert und erst durch `onFinished` (nach dem letzten
   Schritt) wieder aufgehoben. Der `decidedForUserId`-Ref setzt diese
   Entscheidung zurück, wenn sich der eingeloggte User ändert (Logout +
   Login als andere Person, ohne vollen Reload).
   ============================================================ */

import { useEffect, useRef, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../api/auth/useAuth";
import { useProfileBasics } from "../../api/hooks/useProfile";
import { toResultError } from "../../api/result";
import { ACCOUNT_MISSING_NOTICE } from "../auth/login-notice";
import { OnboardingWizard } from "./OnboardingWizard";

export function OnboardingGate() {
  const { session, loading: authLoading, signOut } = useAuth();
  const {
    data: basics,
    isLoading: basicsLoading,
    isError: basicsError,
    error: basicsErr,
    errorUpdateCount,
  } = useProfileBasics();
  const [showWizard, setShowWizard] = useState<boolean | null>(null);
  const decidedForUserId = useRef<string | null>(null);
  const navigate = useNavigate();
  // Login ohne Profil (Konto gelöscht, Browser noch angemeldet): abmelden,
  // danach zur Login-Seite mit Hinweis.
  const profileMissing =
    !!session && basicsError && toResultError(basicsErr).code === "NO_DATA";

  useEffect(() => {
    if (!profileMissing) return;
    void signOut().then(() =>
      navigate("/app/login", { replace: true, state: { notice: ACCOUNT_MISSING_NOTICE } })
    );
  }, [profileMissing, signOut, navigate]);

  const userId = session?.user?.id ?? null;
  if (decidedForUserId.current !== userId) {
    decidedForUserId.current = userId;
    if (showWizard !== null) setShowWizard(null);
  }

  if (authLoading) return <p>Lade Session…</p>;
  if (!session) return <Outlet />;
  if (profileMissing) return <p>Abmelden…</p>;
  // Lade-Bildschirm nur beim ERSTEN Laden: nach einem Fehler würde er die
  // Seite abbauen, deren Wiederaufbau den Abruf neu startet — eine
  // Endlosschleife (Live-Fund: dutzende 406 auf profiles_own pro Sekunde).
  if (basicsLoading && errorUpdateCount === 0) return <p>Lade Session…</p>;
  // Fail open bei Ladefehler (z. B. Netzwerk-Hänger) — die App soll nicht
  // dauerhaft blockieren, nur weil dieser eine Read scheitert.
  if (basicsError || !basics) return <Outlet />;

  if (showWizard === null) {
    setShowWizard(basics.hasPassword === false);
  }
  if (showWizard) {
    return <OnboardingWizard onFinished={() => setShowWizard(false)} />;
  }
  return <Outlet />;
}

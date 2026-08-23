import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../api/auth/useAuth";

export function ProtectedRoute() {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) return <p>Lade Session…</p>;
  // `state.from` reicht die ursprünglich angefragte Route an LoginPage.tsx
  // weiter, damit ein Login nach diesem Redirect dorthin zurückführt statt
  // immer auf die Hero-Seite (Bug-Report: kein Weg zurück aus /login außer
  // dem Browser-Zurück-Button, s. LoginPage.tsx).
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

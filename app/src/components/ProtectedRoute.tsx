import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../api/auth/useAuth";

export function ProtectedRoute() {
  const { session, loading } = useAuth();

  if (loading) return <p>Lade Session…</p>;
  if (!session) return <Navigate to="/login" replace />;
  return <Outlet />;
}

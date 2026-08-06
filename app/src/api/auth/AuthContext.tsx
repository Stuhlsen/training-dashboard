import { createContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";
import {
  getCurrentSession,
  onAuthChange,
  signIn as apiSignIn,
  signOut as apiSignOut,
} from "../supabase/auth";
import type { Result } from "../types";

export interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<Result<{ user: User }>>;
  signOut: () => Promise<Result>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    getCurrentSession().then((initial) => {
      if (active) {
        lastUserId.current = initial?.user?.id ?? null;
        setSession(initial);
        setLoading(false);
      }
    });

    const subscription = onAuthChange((next) => {
      const nextUserId = next?.user?.id ?? null;
      // Kontowechsel oder Logout: den gesamten Query-Cache verwerfen.
      //
      // Ein Teil der Caches ist user-gebunden (Check-in, Profil, Schreib-
      // Berechtigung) und dürfte den Nutzerwechsel ohnehin nicht überleben.
      // Der Rest ist zwar athletengebunden und öffentlich lesbar, kann aber
      // unter einer Session MEHR enthalten haben als danach — RLS liefert
      // einem Trainer Vorschläge und Check-ins seines Athleten, einem
      // Ausgeloggten nicht. Ohne dieses Leeren bliebe das nach dem Logout
      // sichtbar, bis eine Query von selbst veraltet.
      if (nextUserId !== lastUserId.current) {
        lastUserId.current = nextUserId;
        queryClient.clear();
      }
      setSession(next);
    });

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, [queryClient]);

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    loading,
    signIn: apiSignIn,
    signOut: apiSignOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

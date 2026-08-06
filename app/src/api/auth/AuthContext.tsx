import { createContext, useEffect, useState, type ReactNode } from "react";
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

  useEffect(() => {
    let active = true;
    getCurrentSession().then((initial) => {
      if (active) {
        setSession(initial);
        setLoading(false);
      }
    });

    const subscription = onAuthChange((next) => {
      setSession(next);
    });

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    loading,
    signIn: apiSignIn,
    signOut: apiSignOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

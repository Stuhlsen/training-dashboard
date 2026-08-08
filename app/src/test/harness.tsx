/* ============================================================
   TEST/HARNESS.TSX — Geschirr für die Hook-Tests der Zugriffsschicht

   Ersetzt das `mock.module()`-Geschirr der Vanilla-Tests (das
   `--experimental-test-module-mocks` und damit Node ≥24 erzwang, s.
   AGENTS.md). Unter Vitest reicht `vi.mock()` auf die Adapter-Module —
   die Mock-Grenze bleibt exakt dieselbe: alles ab `api/supabase/*` ist
   gestubbt, die Hook-Logik darüber läuft echt.
   ============================================================ */

import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";
import { AuthContext, type AuthContextValue } from "../api/auth/AuthContext";
import { createQueryClient } from "../api/queryClient";

export interface HarnessOptions {
  /** Auth-User-ID des eingeloggten Users, oder `null` für ausgeloggt.
   *  Entspricht `auth.uid()` und zugleich `profiles.id`. */
  userId?: string | null;
}

/** Baut einen frischen QueryClient und einen Provider-Wrapper darum.
 *  Frisch je Test, damit kein Query-Ergebnis in den nächsten Fall leckt. */
export function createHarness({ userId = null }: HarnessOptions = {}) {
  const queryClient = createQueryClient();

  const user = userId ? ({ id: userId } as User) : null;
  const auth: AuthContextValue = {
    session: user ? ({ user } as Session) : null,
    user,
    loading: false,
    signIn: async () => ({ ok: false, error: { code: "UNKNOWN", message: "Testgeschirr" } }),
    signOut: async () => ({ ok: true }),
  };

  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
      </QueryClientProvider>
    );
  }

  return { wrapper, queryClient };
}

/** Ein Promise, dessen Auflösung der Test selbst in der Hand hat — damit
 *  sich zwei nebenläufige Schreibvorgänge deterministisch in beliebiger
 *  Reihenfolge zurückkommen lassen. Ohne das ließe sich das Überholen
 *  zweier Mutationen nicht reproduzierbar prüfen. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

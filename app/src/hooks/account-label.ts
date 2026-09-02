/* ============================================================
   HOOKS/ACCOUNT-LABEL.TS — Anzeigetext für die Konto-Pille oben rechts
   (components/UserMenu.tsx).

   Liegt in `hooks/` (Orchestrierung), NICHT in `api/hooks/`: er wird von
   `Layout.tsx` (`components/`) aufgerufen, und `components/` → `api/hooks/`
   wäre ein Schichtenbruch. Die Abhängigkeitstabelle (AGENTS.md) erlaubt
   genau diesen Weg: `hooks/` darf `api/` importieren, `components/` darf
   `hooks/` importieren. `accountLabel()` bleibt rein und einzeln testbar
   (account-label.test.ts).
   ============================================================ */

import { useAuth } from "../api/auth/useAuth";
import { useSessionProfile } from "../api/hooks/useSession";
import type { Profile } from "../api/types";

/** Minimalausschnitt des Supabase-Auth-Users, den das Label braucht. */
export interface UserLike {
  email?: string | null;
}

/** Priorität: Profil-`displayName` → E-Mail → neutraler Fallback. Nie leer,
 *  damit die Pille nie ohne Text dasteht (Profil lädt asynchron nach). */
export function accountLabel(profile: Profile | null, user: UserLike | null): string {
  const name = profile?.displayName?.trim();
  if (name) return name;
  const email = user?.email?.trim();
  if (email) return email;
  return "Konto";
}

/** Verdrahtet Profil (api/hooks) + Auth-User (api/auth) für die Konto-Pille. */
export function useAccountLabel(): string {
  const { user } = useAuth();
  const profile = useSessionProfile();
  return accountLabel(profile, user ?? null);
}

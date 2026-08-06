import { useQuery } from "@tanstack/react-query";
import { getProfile } from "../supabase/profiles";
import { useAuth } from "../auth/useAuth";
import { qk } from "../keys";
import { unwrap } from "../result";
import type { Profile } from "../types";

/** Das `profiles`-Zeile des eingeloggten Users — Rolle, coachId, isAdmin.
 *
 *  Tritt an die Stelle von `state/session.js::getSession()`, das dieselbe
 *  Zeile in einer Modulvariablen hielt und per onAuthChange nachzog. Hier
 *  liefert `AuthContext` den Auth-User (Session-Ereignisse) und diese Query
 *  das zugehörige Profil; der Key hängt an der User-ID, ein Kontowechsel
 *  ergibt also automatisch einen eigenen Eintrag statt eines überschriebenen.
 *
 *  Der Retry-Fall aus der Vanilla-Version bleibt erhalten: unmittelbar nach
 *  einem Signup kann die von `handle_new_user()` angelegte Zeile noch nicht
 *  sichtbar sein, wenn das Auth-Ereignis zuerst durchkommt. Ein Versuch
 *  reicht — kein Endlos-Polling. */
export function useCurrentProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.profile(user?.id ?? "anonymous"),
    enabled: !!user,
    retry: (failureCount) => failureCount < 1,
    retryDelay: 1000,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Profile> => unwrap(await getProfile(user!.id)).profile,
  });
}

/** Die auth.uid() des eingeloggten Users, oder `null`.
 *
 *  Das ist das richtige Gate für Schreibpfade — und ausdrücklich NICHT das
 *  Profil: das lädt asynchron nach, und ein Schreibversuch in diesem
 *  Fenster würde sonst mit "Nicht eingeloggt" abgewiesen, obwohl eine
 *  gültige Session besteht. Die Vanilla-Version hatte dieselbe Lücke, dort
 *  aber unvermeidbar, weil `getSession()` das Profil WAR.
 *
 *  Für die Frage "darf dieser User hier schreiben" (Rolle, isAdmin) wird
 *  weiterhin das Profil gebraucht — s. useCanWriteForAthlete(). */
export function useAuthUserId(): string | null {
  return useAuth().user?.id ?? null;
}

/** Der eingeloggte User als Profil, oder `null` solange es lädt. Für
 *  Rollen-Fragen (Trainer? Admin?), nicht als Login-Gate — s.
 *  useAuthUserId(). */
export function useSessionProfile(): Profile | null {
  return useCurrentProfile().data ?? null;
}

export function useIsAdmin(): boolean {
  return !!useSessionProfile()?.isAdmin;
}

export function useIsCoach(): boolean {
  return useSessionProfile()?.role === "coach";
}

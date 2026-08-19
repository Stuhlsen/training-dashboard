import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getConfig } from "./config";

const config = getConfig();

/** false wenn der aktuelle Host keine (vollständige) Supabase-Config hat —
 *  Auth-Funktionen degradieren dann graceful statt beim Modul-Laden zu crashen. */
export const isSupabaseConfigured = !!config;

export const supabase: SupabaseClient | null = config
  ? createClient(config.projectUrl, config.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

/** Der Singleton-`supabase`-Client aktualisiert seinen intern für REST-
 *  Requests genutzten Authorization-Header nach dem Login nicht zuverlässig
 *  (in der Vanilla-Version beobachtet: dauerhaft 403 ohne Bearer-Token auf
 *  .from()-Aufrufe). Für Aufrufe, die eine Session brauchen, wird stattdessen
 *  ein eigener, mit dem aktuellen access_token vorkonfigurierter Client
 *  zurückgegeben. persistSession/autoRefreshToken sind hier bewusst aus —
 *  dieser Client verwaltet keine eigene Session, er nutzt nur den fest
 *  gesetzten Header, und würde sonst um denselben LocalStorage-Key wie der
 *  Singleton konkurrieren. Solange sich der access_token nicht ändert, wird
 *  derselbe Client wiederverwendet; ändert er sich (Login/Refresh/Logout),
 *  baut der nächste Aufruf genau einen neuen.
 *
 *  Erwartete Nebenwirkung: die Supabase-SDK warnt in der Browser-Konsole
 *  ("Multiple GoTrueClient instances detected") sobald ein eingeloggter
 *  Aufruf den zweiten Client erstellt — harmlos hier, da `persistSession:
 *  false` genau die LocalStorage-Kollision verhindert, vor der die Warnung
 *  eigentlich schützen will. Nicht durch einen dritten Workaround
 *  wegzudesignen — das würde den oben dokumentierten 403-Bug riskieren. */
let cachedAuthedClient: SupabaseClient | null = null;
let cachedToken: string | null = null;

export async function getAuthedClient(): Promise<SupabaseClient | null> {
  if (!supabase || !config) return null;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;
  if (token === cachedToken && cachedAuthedClient) return cachedAuthedClient;
  cachedToken = token;
  cachedAuthedClient = createClient(config.projectUrl, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  return cachedAuthedClient;
}

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getConfig } from "./config.js";

const config = getConfig();

/** false wenn der aktuelle Host keine (vollständige) Supabase-Config hat —
 *  Auth-Funktionen degradieren dann graceful statt den ganzen Dashboard-
 *  Import-Graph beim Modul-Laden crashen zu lassen. */
export const isSupabaseConfigured = !!config;

export const supabase = config
  ? createClient(config.projectUrl, config.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

/** Der Singleton-`supabase`-Client aktualisiert seinen intern für REST-
 *  Requests genutzten Authorization-Header nach dem Login nicht zuverlässig
 *  (beobachtet: dauerhaft 403 ohne Bearer-Token auf .from()-Aufrufe, über
 *  mehrere Sekunden reproduzierbar — kein Timing-Problem). Für Aufrufe, die
 *  eine Session brauchen, wird stattdessen ein eigener, mit dem aktuellen
 *  access_token vorkonfigurierter Client zurückgegeben. persistSession/
 *  autoRefreshToken sind hier bewusst aus — dieser Client verwaltet keine
 *  eigene Session, er nutzt nur den fest gesetzten Header, und würde sonst
 *  um denselben LocalStorage-Key wie der Singleton konkurrieren.
 *  @returns {Promise<import("https://esm.sh/@supabase/supabase-js@2").SupabaseClient|null>} */
export async function getAuthedClient() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;
  return createClient(config.projectUrl, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

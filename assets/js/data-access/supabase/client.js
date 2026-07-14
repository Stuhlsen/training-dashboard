import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getConfig } from "./config.js";

const config = getConfig();

/** false wenn der aktuelle Host keine (vollständige) Supabase-Config hat —
 *  Auth-Funktionen degradieren dann graceful statt den ganzen Dashboard-
 *  Import-Graph beim Modul-Laden crashen zu lassen. */
export const isSupabaseConfigured = !!config;

export const supabase = config ? createClient(config.projectUrl, config.anonKey) : null;

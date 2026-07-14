import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getConfig } from "./config.js";

const { projectUrl, anonKey } = getConfig();

export const supabase = createClient(projectUrl, anonKey);

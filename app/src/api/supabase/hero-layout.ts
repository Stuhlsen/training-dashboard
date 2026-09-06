import { supabase, getAuthedClient } from "./client";
import type { Result } from "../types";

const NOT_CONFIGURED = { code: "UNKNOWN" as const, message: "Supabase nicht konfiguriert" };

export interface HeroTilePosition {
  i: string;
  x: number;
  y: number;
}

/** Liest die gespeicherte Hero-Kachel-Anordnung (2D-Positionen) eines
 *  Profils FÜR EINEN BESTIMMTEN Athleten-Tab (athleteId = interne
 *  App-Kennung, "athlete1"/"athlete2"/"athlete4" aus config.ts — nicht die
 *  Supabase-UUID des angesehenen Athleten: die Zeile gehört ohnehin nur
 *  dem Betrachter selbst, s. Migration 0033). `layout: null` bedeutet
 *  "noch nie gespeichert" — der Aufrufer (useHeroLayout) entscheidet über
 *  den Default (kanonisches Layout), diese Schicht kennt keine UI-Defaults
 *  (analog zu export-prefs.ts). */
export async function getHeroLayout(
  profileId: string,
  athleteId: string,
): Promise<Result<{ layout: HeroTilePosition[] | null }>> {
  if (!supabase) return { ok: true, layout: null };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("hero_tile_order")
    .select("layout")
    .eq("profile_id", profileId)
    .eq("athlete_id", athleteId)
    .maybeSingle<{ layout: HeroTilePosition[] | null }>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, layout: data?.layout && data.layout.length > 0 ? data.layout : null };
}

/** Speichert die Kachel-Anordnung für einen bestimmten Athleten-Tab (Upsert
 *  — ein (Profil, Athleten-Tab)-Paar hat höchstens eine Zeile,
 *  Primärschlüssel (profile_id, athlete_id) seit Migration 0033). */
export async function setHeroLayout(
  profileId: string,
  athleteId: string,
  layout: HeroTilePosition[],
): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client
    .from("hero_tile_order")
    .upsert({ profile_id: profileId, athlete_id: athleteId, layout }, { onConflict: "profile_id,athlete_id" });
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}

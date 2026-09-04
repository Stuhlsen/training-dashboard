import { supabase, getAuthedClient } from "./client";
import type { Result } from "../types";

const NOT_CONFIGURED = { code: "UNKNOWN" as const, message: "Supabase nicht konfiguriert" };

export interface HeroTilePosition {
  i: string;
  x: number;
  y: number;
}

/** Liest die gespeicherte Hero-Kachel-Anordnung (2D-Positionen) eines
 *  Profils. `layout: null` bedeutet "noch nie gespeichert" — der Aufrufer
 *  (useHeroLayout) entscheidet über den Default (kanonisches Layout),
 *  diese Schicht kennt keine UI-Defaults (analog zu export-prefs.ts). */
export async function getHeroLayout(profileId: string): Promise<Result<{ layout: HeroTilePosition[] | null }>> {
  if (!supabase) return { ok: true, layout: null };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("hero_tile_order")
    .select("layout")
    .eq("profile_id", profileId)
    .maybeSingle<{ layout: HeroTilePosition[] | null }>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, layout: data?.layout && data.layout.length > 0 ? data.layout : null };
}

/** Speichert die Kachel-Anordnung (Upsert — ein Profil hat höchstens eine
 *  Zeile, Primärschlüssel profile_id aus 0030_hero_tile_order.sql). */
export async function setHeroLayout(profileId: string, layout: HeroTilePosition[]): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client
    .from("hero_tile_order")
    .upsert({ profile_id: profileId, layout }, { onConflict: "profile_id" });
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}

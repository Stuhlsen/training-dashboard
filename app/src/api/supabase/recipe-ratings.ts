/* ============================================================
   API/SUPABASE/RECIPE-RATINGS.TS — Sterne für freigegebene Rezepte
   (Migration 0075, Fahrplan 30 B3)

   Lesen:    Schnitt + Anzahl aus der View recipe_rating_stats (ohne Athlet-ID),
             die eigenen Sterne aus recipe_ratings (RLS: nur die eigene Zeile).
   Schreiben: eigene Zeile anlegen/ändern (Upsert auf recipe_id + athlete_id)
             oder zurücknehmen (Delete). Ob das Rezept freigegeben und nicht das
             eigene ist, prüft die Datenbank (Trigger) — die App bietet es nur
             nicht erst an (core/recipe-rating.js::canRateRecipe).
   ============================================================ */

import { supabase, getAuthedClient } from "./client";
import type { MyRecipeRating, RecipeRatingStat, Result } from "../types";

const NOT_CONFIGURED = { code: "UNKNOWN" as const, message: "Supabase nicht konfiguriert" };

interface StatRow {
  recipe_id: string;
  avg_stars: number | string;
  rating_count: number;
}

interface MyRatingRow {
  recipe_id: string;
  stars: number;
}

/** Schnitt und Anzahl aller freigegebenen Rezepte mit mindestens einer Bewertung. */
export async function listRatingStats(): Promise<Result<{ stats: RecipeRatingStat[] }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };

  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client.from("recipe_rating_stats").select("recipe_id, avg_stars, rating_count");

  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  const stats = ((data as StatRow[]) || []).map((row) => ({
    recipeId: row.recipe_id,
    // numeric kommt je nach Treiber als String an
    avg: Number(row.avg_stars),
    count: row.rating_count,
  }));
  return { ok: true, stats };
}

/** Die eigenen Bewertungen des eingeloggten Athleten. */
export async function listMyRatings(userId: string): Promise<Result<{ ratings: MyRecipeRating[] }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };

  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client.from("recipe_ratings").select("recipe_id, stars").eq("athlete_id", userId);

  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  const ratings = ((data as MyRatingRow[]) || []).map((row) => ({ recipeId: row.recipe_id, stars: row.stars }));
  return { ok: true, ratings };
}

/** Legt die eigene Bewertung an oder ändert sie (eine Zeile je Athlet und Rezept). */
export async function setMyRating(recipeId: string, userId: string, stars: number): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  if (!recipeId || !userId) return { ok: false, error: { code: "SCHEMA", message: "Rezept oder Athlet fehlt." } };

  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client
    .from("recipe_ratings")
    .upsert({ recipe_id: recipeId, athlete_id: userId, stars }, { onConflict: "recipe_id,athlete_id" });

  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}

/** Nimmt die eigene Bewertung zurück. Ohne vorhandene Bewertung ist das kein Fehler. */
export async function deleteMyRating(recipeId: string, userId: string): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  if (!recipeId || !userId) return { ok: false, error: { code: "SCHEMA", message: "Rezept oder Athlet fehlt." } };

  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client.from("recipe_ratings").delete().eq("recipe_id", recipeId).eq("athlete_id", userId);

  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}

/* ============================================================
   API/SUPABASE/RECIPE-VOTES.TS — Daumen für Rezepte in Prüfung
   (Migration 0076, Fahrplan 30 B4)

   Lesen:    Zahlen aus der View recipe_vote_stats (ohne Athlet-ID), die eigenen
             Daumen aus recipe_votes (RLS: nur die eigene Zeile, der Admin alle —
             die App fragt trotzdem nur die eigene ab).
   Schreiben: eigene Zeile anlegen/ändern (Upsert auf recipe_id + athlete_id).
             Es gibt kein Zurücknehmen: ein Daumen wird geändert, nicht entfernt
             (0063). Ob das Rezept in Prüfung und nicht das eigene ist, prüft die
             Datenbank (Trigger) — die App bietet es nur nicht erst an
             (core/recipe-votes.js::canVoteRecipe).
   ============================================================ */

import { supabase, getAuthedClient } from "./client";
import type { MyRecipeVote, RecipeVote, RecipeVoteStat, Result } from "../types";

const NOT_CONFIGURED = { code: "UNKNOWN" as const, message: "Supabase nicht konfiguriert" };

interface StatRow {
  recipe_id: string;
  up_count: number;
  down_count: number;
}

interface MyVoteRow {
  recipe_id: string;
  vote: RecipeVote;
}

/** Daumen-Zahlen aller Rezepte in Prüfung mit mindestens einem Daumen. */
export async function listVoteStats(): Promise<Result<{ stats: RecipeVoteStat[] }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };

  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client.from("recipe_vote_stats").select("recipe_id, up_count, down_count");

  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  const stats = ((data as StatRow[]) || []).map((row) => ({
    recipeId: row.recipe_id,
    up: row.up_count,
    down: row.down_count,
  }));
  return { ok: true, stats };
}

/** Die eigenen Daumen des eingeloggten Athleten. */
export async function listMyVotes(userId: string): Promise<Result<{ votes: MyRecipeVote[] }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };

  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client.from("recipe_votes").select("recipe_id, vote").eq("athlete_id", userId);

  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  const votes = ((data as MyVoteRow[]) || []).map((row) => ({ recipeId: row.recipe_id, vote: row.vote }));
  return { ok: true, votes };
}

/** Legt den eigenen Daumen an oder ändert ihn (eine Zeile je Athlet und Rezept). */
export async function setMyVote(recipeId: string, userId: string, vote: RecipeVote): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  if (!recipeId || !userId) return { ok: false, error: { code: "SCHEMA", message: "Rezept oder Athlet fehlt." } };

  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client
    .from("recipe_votes")
    .upsert({ recipe_id: recipeId, athlete_id: userId, vote }, { onConflict: "recipe_id,athlete_id" });

  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}

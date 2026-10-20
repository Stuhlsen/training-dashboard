/* ============================================================
   API/SUPABASE/RECIPE-COMMENTS.TS — Kommentare zu Rezepten und Daumen darauf
   (Migration 0077, Fahrplan 30 B5)

   Lesen:     die View recipe_comment_feed (Pseudonym, Zahlen, is_mine, my_vote — nie eine
              Athlet-ID). Nur Kommentare zu Rezepten in Prüfung oder freigegebenen.
   Schreiben: Kommentar anlegen (Datenbank prüft Länge, Leerraum, Rezept-Status und ob ein
              Pseudonym gesetzt ist) und den eigenen löschen. Ändern gibt es nicht.
              Daumen: eigene Zeile anlegen/ändern (Upsert auf comment_id + athlete_id), kein
              Zurücknehmen. Der Admin löscht fremde Kommentare über die admin-api
              (api/admin-recipe-comments.ts), nicht hier.
   ============================================================ */

import { supabase, getAuthedClient } from "./client";
import type { RecipeComment, RecipeVote, Result } from "../types";

const NOT_CONFIGURED = { code: "UNKNOWN" as const, message: "Supabase nicht konfiguriert" };

interface FeedRow {
  id: string;
  recipe_id: string;
  author_name: string;
  is_mine: boolean;
  body: string;
  created_at: string;
  up_count: number;
  down_count: number;
  my_vote: RecipeVote | null;
}

const FEED_COLUMNS = "id, recipe_id, author_name, is_mine, body, created_at, up_count, down_count, my_vote";

/** Alle Kommentare eines Rezepts. Die Reihenfolge der Anzeige legt core/recipe-comments.js fest. */
export async function listRecipeComments(recipeId: string): Promise<Result<{ comments: RecipeComment[] }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  if (!recipeId) return { ok: false, error: { code: "SCHEMA", message: "Rezept fehlt." } };

  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("recipe_comment_feed")
    .select(FEED_COLUMNS)
    .eq("recipe_id", recipeId)
    .order("created_at", { ascending: true });

  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  const comments = ((data as FeedRow[]) || []).map((row) => ({
    id: row.id,
    recipeId: row.recipe_id,
    authorName: row.author_name,
    isMine: row.is_mine,
    body: row.body,
    createdAt: row.created_at,
    up: row.up_count,
    down: row.down_count,
    myVote: row.my_vote,
  }));
  return { ok: true, comments };
}

/** Legt einen Kommentar an. `body` ist schon geprüft und getrimmt (core/recipe-comments.js). */
export async function addRecipeComment(recipeId: string, userId: string, body: string): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  if (!recipeId || !userId) return { ok: false, error: { code: "SCHEMA", message: "Rezept oder Athlet fehlt." } };

  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client.from("recipe_comments").insert({ recipe_id: recipeId, athlete_id: userId, body });

  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}

/** Löscht einen eigenen Kommentar (RLS: nur die eigene Zeile; die Daumen gehen per cascade mit). */
export async function deleteOwnRecipeComment(commentId: string): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  if (!commentId) return { ok: false, error: { code: "SCHEMA", message: "Kommentar fehlt." } };

  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client.from("recipe_comments").delete().eq("id", commentId);

  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}

/** Legt den eigenen Daumen auf einen Kommentar an oder ändert ihn. */
export async function setCommentVote(commentId: string, userId: string, vote: RecipeVote): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  if (!commentId || !userId) return { ok: false, error: { code: "SCHEMA", message: "Kommentar oder Athlet fehlt." } };

  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client
    .from("recipe_comment_votes")
    .upsert({ comment_id: commentId, athlete_id: userId, vote }, { onConflict: "comment_id,athlete_id" });

  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}

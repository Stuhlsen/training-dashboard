import { supabase, getAuthedClient } from "./client";
import type { Recipe, Result, AllergenTag } from "../types";

const NOT_CONFIGURED = { code: "UNKNOWN" as const, message: "Supabase nicht konfiguriert" };

/* ── Snake-case DB-Row ──────────────────────────────────────── */

interface RecipeRow {
  id: string;
  external_id: string | null;
  submitted_by: string | null;
  status: string;
  rejection_reason: string | null;
  title: string;
  meal_type: string[];
  diet_tags: string[] | null;
  contains_tags: string[] | null;
  servings: number;
  ingredients: unknown[] | null;
  instructions: unknown[] | null;
  nutrition: unknown | null;
  image_url: string | null;
  source: string;
  created_at: string;
  updated_at: string;
}

/* ── Filters ────────────────────────────────────────────────── */

export interface RecipeFilters {
  status?: string;
  mealType?: string;
  dietTags?: string[];
  source?: string;
}

/* ── Mapper ─────────────────────────────────────────────────── */

function toRecipe(row: RecipeRow): Recipe {
  return {
    id: row.id,
    source: row.source as Recipe["source"],
    externalId: row.external_id,
    submittedBy: row.submitted_by,
    status: row.status as Recipe["status"],
    rejectionReason: row.rejection_reason,
    title: row.title,
    mealType: row.meal_type as Recipe["mealType"],
    dietTags: (row.diet_tags ?? null) as Recipe["dietTags"],
    containsTags: (Array.isArray(row.contains_tags) ? row.contains_tags.filter(Boolean) : []) as AllergenTag[],
    servings: row.servings,
    ingredients: row.ingredients as Recipe["ingredients"],
    instructions: row.instructions as Recipe["instructions"],
    nutrition: row.nutrition as Recipe["nutrition"],
    imageUrl: row.image_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* ── listRecipes ────────────────────────────────────────────── */

/**
 * Rezepte aus der shared library lesen (public.recipes).
 * Filter (alle optional): status (Default "approved"), mealType, dietTags, source.
 */
export async function listRecipes(filter: RecipeFilters = {}): Promise<Result<{ recipes: Recipe[] }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };

  const client = (await getAuthedClient()) ?? supabase;
  const status = filter.status ?? "approved";

  let query = client.from("recipes").select("*").eq("status", status);

  if (filter.mealType) {
    // meal_type ist ein Text-Array — contains prüft, ob der Wert im Array ist
    query = query.contains("meal_type", [filter.mealType]);
  }
  if (filter.dietTags && filter.dietTags.length > 0) {
    query = query.contains("diet_tags", filter.dietTags);
  }
  if (filter.source) {
    query = query.eq("source", filter.source);
  }

  query = query.order("title", { ascending: true });

  const { data, error } = await query;

  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, recipes: ((data as RecipeRow[]) || []).map(toRecipe) };
}
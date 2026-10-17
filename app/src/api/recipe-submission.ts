/* ============================================================
   API/RECIPE-SUBMISSION.TS — fetch-Wrapper für admin-api /api/*
   (Fahrplan 25, S2a; Server-Vertrag: admin-api/README.md,
   Abschnitt "Rezept-Einreichung")

   Gleiches Muster wie admin-invite.ts: Bearer-Token aus der Session,
   Basis-URL aus der Supabase-Config (Proxy /api/*), die Antwort ist schon
   in der Result-Form und wird nur durchgereicht. Gerechnet wird hier
   nichts — Nährwerte, Allergene und Diät-Tags liefert der Server.
   ============================================================ */

import { supabase } from "./supabase/client";
import { getConfig } from "./supabase/config";
import type { AllergenTag, DietTag, RecipeIngredient, RecipeNutrition, Result } from "./types";

/** Body für preview/POST (und später PUT) — Form siehe core/recipe-submission.js. */
export interface RecipeSubmissionBody {
  title: string;
  meal_type: string[];
  servings: number;
  ingredients: { name: string; amount: number; unit: string }[];
  instructions: { text: string; timerSeconds?: number }[];
  image_url?: string;
}

export interface IngredientHit {
  name: string;
  category: string;
  units: string[];
}

export interface RecipePreview {
  nutrition: RecipeNutrition;
  contains_tags: AllergenTag[];
  diet_tags: DietTag[];
  ingredients: RecipeIngredient[];
}

/** Die vom Server gespeicherte Zeile (snake_case, wie die DB). */
export interface SubmittedRecipeRow {
  id: string;
  status: string;
  title: string;
}

function isResultShape(body: unknown): body is Result<Record<string, unknown>> {
  return !!body && typeof body === "object" && "ok" in body;
}

async function call<T extends object>(method: string, path: string, body?: unknown): Promise<Result<T>> {
  const config = getConfig();
  if (!supabase || !config) {
    return { ok: false, error: { code: "UNKNOWN", message: "Supabase nicht konfiguriert" } };
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    return { ok: false, error: { code: "TOKEN_INVALID", message: "Nicht eingeloggt" } };
  }

  let res: Response;
  try {
    res = await fetch(`${config.projectUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, error: { code: "NETWORK", message: e instanceof Error ? e.message : String(e) } };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, error: { code: "UNKNOWN", message: `admin-api antwortete mit ${res.status}, kein JSON` } };
  }
  if (!isResultShape(json)) {
    return { ok: false, error: { code: "UNKNOWN", message: `admin-api antwortete mit ${res.status}, unerwartetes Format` } };
  }
  return json as Result<T>;
}

/** Zutaten-Suche (höchstens 20 Treffer). Leere Suche fragt den Server nicht. */
export async function searchIngredients(query: string): Promise<Result<{ ingredients: IngredientHit[] }>> {
  const q = query.trim();
  if (!q) return { ok: true, ingredients: [] };
  return call("GET", `/api/ingredients?q=${encodeURIComponent(q)}`);
}

/** Prüft und rechnet wie Einreichen, speichert nichts. */
export function previewRecipe(body: RecipeSubmissionBody): Promise<Result<RecipePreview>> {
  return call("POST", "/api/recipes/preview", body);
}

/** Reicht ein Rezept ein (landet als `pending`). */
export function submitRecipe(body: RecipeSubmissionBody): Promise<Result<{ recipe: SubmittedRecipeRow }>> {
  return call("POST", "/api/recipes", body);
}

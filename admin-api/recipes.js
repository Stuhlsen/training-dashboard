// Fahrplan 25 S1a — Rezept-Einreichung als Dienst.
// Validiert Athleten-Rezepte, leitet Naehrwerte/Tags aus der Zutatentabelle ab
// und speichert sie mit der Service-Rolle als source=athlete, status=pending.
//
// Die Ableitung ist EINE Quelle: dieselben ESM-Module wie das Seed-Skript
// (scripts/lib/recipe-nutrition.js, validate-recipe.js, ingredient-nutrition.json).
// admin-api bleibt CommonJS und laedt sie per dynamischem import(). Der relative
// Pfad ../scripts/lib stimmt im Repo und im Image (s. admin-api/Dockerfile).
//
// S1b: PUT (Rezept aendern) braucht Migration 0069 — der Trigger
// recipes_check_content_update (0062) lehnte Inhaltsaenderungen ab, wenn
// auth.uid() nicht der Einreicher ist, und der Service-Key hat kein sub.
// Zutaten-Wuensche (POST /api/ingredient-requests) brauchen Migration 0070.
//
// Fahrplan 29 V2 (braucht Migration 0071): verifizierte Autoren (profiles.is_verified_author,
// vom Admin gesetzt) veroeffentlichen sofort — POST legt ihr Rezept als 'approved' an — und
// duerfen ihre eigenen freigegebenen Rezepte aendern (PUT) und zurueckziehen (DELETE). Das
// Zurueckziehen scheitert, solange das Rezept in einem Essensplan liegt (FK restrict, 0064).
// Alle anderen bleiben bei 'pending'. Die Pruefung laeuft bei jedem Aufruf neu, ein Entzug
// wirkt also sofort (freigegebene Rezepte bleiben dabei freigegeben, V-5).

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const LIB_DIR = path.join(__dirname, "..", "scripts", "lib");

const LIMITS = {
  openRecipes: 5,
  ingredients: 30,
  steps: 20,
  title: 100,
  stepText: 500,
  servings: 50,
  prepMinutes: 600,
  maxTimerSeconds: 86400,
  ingredientRequests: 20,
  requestName: 100,
  requestNote: 300,
};
const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMAGE_SEGMENT_RE = /^[A-Za-z0-9._-]+$/;
const MAX_SEARCH_RESULTS = 20;

let derivationPromise = null;

/** Laedt die Ableitungs-Module einmalig (ESM aus CommonJS). */
function loadDerivation() {
  derivationPromise ??= (async () => {
    const [nutrition, validate] = await Promise.all([
      import(pathToFileURL(path.join(LIB_DIR, "recipe-nutrition.js")).href),
      import(pathToFileURL(path.join(LIB_DIR, "validate-recipe.js")).href),
    ]);
    const table = JSON.parse(fs.readFileSync(path.join(LIB_DIR, "ingredient-nutrition.json"), "utf8"));
    const tableErrors = nutrition.validateIngredientTable(table);
    if (tableErrors.length > 0) {
      throw new Error(`Zutatentabelle ungueltig: ${tableErrors[0]}`);
    }
    return {
      buildRecipe: nutrition.buildRecipe,
      validateRecipes: validate.validateRecipes,
      table,
      searchIndex: buildSearchIndex(table),
    };
  })();
  derivationPromise.catch(() => {
    derivationPromise = null; // naechster Aufruf versucht es erneut
  });
  return derivationPromise;
}

/** Klein, Umlaute und ae/oe/ue gleichgesetzt, Akzente weg ("Grünkohl" = "gruenkohl"). */
function foldText(text) {
  return String(text)
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ae/g, "a")
    .replace(/oe/g, "o")
    .replace(/ue/g, "u");
}

function buildSearchIndex(table) {
  return Object.entries(table.zutaten)
    .map(([name, entry]) => ({
      name,
      folded: foldText(name),
      category: entry.kategorie,
      units: ["g", "ml", ...Object.keys(entry.einheiten ?? {}).filter((u) => u !== "ml")],
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
}

/** Zutaten-Suche: Anfang-Treffer vor Teilstring-Treffern, hoechstens 20. */
async function searchIngredients(query) {
  const { searchIndex } = await loadDerivation();
  const q = foldText(String(query ?? "").trim());
  if (!q) return [];
  const starts = [];
  const contains = [];
  for (const item of searchIndex) {
    if (item.folded.startsWith(q)) starts.push(item);
    else if (item.folded.includes(q)) contains.push(item);
  }
  return [...starts, ...contains]
    .slice(0, MAX_SEARCH_RESULTS)
    .map(({ name, category, units }) => ({ name, category, units }));
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Pfad muss <sub>/<datei> im Bucket recipe-images sein, nichts Fremdes. */
function checkImagePath(imageUrl, sub) {
  if (typeof imageUrl !== "string") return "image_url muss ein Text sein";
  if (imageUrl.length > 200) return "image_url zu lang";
  const segments = imageUrl.split("/");
  if (segments.length < 2 || segments[0] !== sub) {
    return "image_url muss auf einen Pfad im eigenen Ordner zeigen";
  }
  if (!segments.every((s) => IMAGE_SEGMENT_RE.test(s) && s !== "." && s !== "..")) {
    return "image_url enthaelt ungueltige Pfadteile";
  }
  return null;
}

function addDetail(details, field, message) {
  (details[field] ??= []).push(message);
}

/**
 * Formularpruefung (Grenzen, Typen) — liefert die Quelle fuer buildRecipe.
 * prep_minutes ist beim Einreichen und Aendern Pflicht; die Vorschau rechnet ohne Zeit
 * (requirePrep = false), prueft einen mitgeschickten Wert aber trotzdem.
 */
function checkInput(body, sub, requirePrep = true) {
  const details = {};
  const input = isPlainObject(body) ? body : {};

  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) addDetail(details, "title", "Titel fehlt");
  else if (title.length > LIMITS.title) addDetail(details, "title", `Titel hoechstens ${LIMITS.title} Zeichen`);

  const mealType = input.meal_type;
  if (!Array.isArray(mealType) || mealType.length === 0 || !mealType.every((m) => MEAL_TYPES.includes(m))) {
    addDetail(details, "meal_type", `meal_type: mindestens einer aus ${MEAL_TYPES.join(", ")}`);
  }

  const servings = input.servings;
  if (typeof servings !== "number" || !Number.isFinite(servings) || servings <= 0 || servings > LIMITS.servings) {
    addDetail(details, "servings", `Portionen: Zahl groesser 0, hoechstens ${LIMITS.servings}`);
  }

  const prepMinutes = input.prep_minutes;
  const hasPrep = prepMinutes !== undefined && prepMinutes !== null;
  if (!hasPrep && requirePrep) {
    addDetail(details, "prep_minutes", "Zubereitungszeit fehlt");
  } else if (hasPrep && (!Number.isInteger(prepMinutes) || prepMinutes < 1 || prepMinutes > LIMITS.prepMinutes)) {
    addDetail(details, "prep_minutes", `Zubereitungszeit: ganze Minuten von 1 bis ${LIMITS.prepMinutes}`);
  }

  const ingredients = [];
  if (!Array.isArray(input.ingredients) || input.ingredients.length === 0) {
    addDetail(details, "ingredients", "mindestens eine Zutat");
  } else if (input.ingredients.length > LIMITS.ingredients) {
    addDetail(details, "ingredients", `hoechstens ${LIMITS.ingredients} Zutaten`);
  } else {
    input.ingredients.forEach((ing, i) => {
      const ok =
        isPlainObject(ing) &&
        typeof ing.name === "string" &&
        typeof ing.unit === "string" &&
        typeof ing.amount === "number" &&
        Number.isFinite(ing.amount) &&
        ing.amount > 0;
      if (!ok) addDetail(details, "ingredients", `Zutat #${i + 1}: name, amount (> 0) und unit noetig`);
      else ingredients.push([ing.name, ing.amount, ing.unit]);
    });
  }

  const instructions = [];
  if (!Array.isArray(input.instructions) || input.instructions.length === 0) {
    addDetail(details, "instructions", "mindestens ein Schritt");
  } else if (input.instructions.length > LIMITS.steps) {
    addDetail(details, "instructions", `hoechstens ${LIMITS.steps} Schritte`);
  } else {
    input.instructions.forEach((step, i) => {
      const text = isPlainObject(step) && typeof step.text === "string" ? step.text.trim() : "";
      if (!text) {
        addDetail(details, "instructions", `Schritt #${i + 1}: Text fehlt`);
        return;
      }
      if (text.length > LIMITS.stepText) {
        addDetail(details, "instructions", `Schritt #${i + 1}: hoechstens ${LIMITS.stepText} Zeichen`);
        return;
      }
      const timer = step.timerSeconds;
      if (timer === undefined || timer === null) {
        instructions.push(text);
      } else if (Number.isInteger(timer) && timer > 0 && timer <= LIMITS.maxTimerSeconds) {
        instructions.push([text, timer]);
      } else {
        addDetail(details, "instructions", `Schritt #${i + 1}: timerSeconds ungueltig`);
      }
    });
  }

  let imageUrl;
  if (input.image_url !== undefined && input.image_url !== null) {
    const problem = checkImagePath(input.image_url, sub);
    if (problem) addDetail(details, "image_url", problem);
    else imageUrl = input.image_url;
  }

  if (Object.keys(details).length > 0) return { ok: false, details };
  return {
    ok: true,
    source: {
      title,
      meal_type: mealType,
      servings,
      prep_minutes: hasPrep ? prepMinutes : undefined,
      ingredients,
      instructions,
      image_url: imageUrl,
    },
  };
}

function validationFailure(details) {
  return {
    ok: false,
    status: 422,
    error: { code: "VALIDATION", message: "Rezept ungueltig", details },
  };
}

/** Prueft und rechnet wie das Einreichen; speichert nichts. */
async function deriveRecipe(body, sub, requirePrep = true) {
  const checked = checkInput(body, sub, requirePrep);
  if (!checked.ok) return validationFailure(checked.details);

  const { buildRecipe, validateRecipes, table } = await loadDerivation();
  const built = buildRecipe(checked.source, table);
  if (!built.ok) return validationFailure({ ingredients: built.errors });

  const validation = validateRecipes([built.recipe]);
  if (!validation.ok) return validationFailure({ recipe: validation.errors });
  // Die Zeit ist kein Ableitungsergebnis: unveraendert aus der Eingabe, nach der Seed-Validierung
  return { ok: true, recipe: { ...built.recipe, prep_minutes: checked.source.prep_minutes } };
}

function previewOf(recipe) {
  return {
    nutrition: recipe.nutrition,
    contains_tags: recipe.contains_tags,
    diet_tags: recipe.diet_tags,
    ingredients: recipe.ingredients,
  };
}

async function previewRecipe(body, sub) {
  const derived = await deriveRecipe(body, sub, false);
  if (!derived.ok) return derived;
  return { ok: true, status: 200, preview: previewOf(derived.recipe) };
}

function serviceHeaders(env, extra = {}) {
  return {
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    ...extra,
  };
}

const networkFailure = (what) => ({
  ok: false,
  status: 502,
  error: { code: "NETWORK", message: `${what} nicht erreichbar` },
});
const httpFailure = (what, status) => ({
  ok: false,
  status: 502,
  error: { code: "HTTP", message: `${what} antwortete mit ${status}` },
});

/** Ist der Einreicher ein verifizierter Autor? (Migration 0071) Liefert { verified } oder { error }. */
async function isVerifiedAuthor(sub, env, fetchImpl) {
  const res = await fetchImpl(
    `${env.POSTGREST_INTERNAL_URL}/profiles?id=eq.${encodeURIComponent(sub)}&select=is_verified_author`,
    { headers: serviceHeaders(env) }
  );
  if (!res.ok) return { error: httpFailure("PostgREST", res.status) };
  const rows = await res.json();
  return { verified: Array.isArray(rows) && rows[0]?.is_verified_author === true };
}

const IN_MEAL_PLANS_MESSAGE =
  "Das Rezept liegt in Essensplaenen und laesst sich nicht zurueckziehen. Bitte den Admin fragen.";
const inMealPlans = () => ({
  ok: false,
  status: 409,
  error: { code: "VALIDATION", message: IN_MEAL_PLANS_MESSAGE, details: { in_meal_plans: [IN_MEAL_PLANS_MESSAGE] } },
});

/** Liegt das Rezept in irgendeinem Essensplan? (meal_plan_entries.recipe_id: on delete restrict, 0064) */
async function isInMealPlan(id, env, fetchImpl) {
  const res = await fetchImpl(`${env.POSTGREST_INTERNAL_URL}/meal_plan_entries?recipe_id=eq.${id}&select=id&limit=1`, {
    headers: serviceHeaders(env),
  });
  if (!res.ok) return { error: httpFailure("PostgREST", res.status) };
  const rows = await res.json();
  return { used: Array.isArray(rows) && rows.length > 0 };
}

async function countOpenRecipes(sub, env, fetchImpl) {
  const url =
    `${env.POSTGREST_INTERNAL_URL}/recipes?submitted_by=eq.${encodeURIComponent(sub)}` +
    `&status=eq.pending&select=id&limit=${LIMITS.openRecipes + 1}`;
  const res = await fetchImpl(url, { headers: serviceHeaders(env) });
  if (!res.ok) return { error: httpFailure("PostgREST", res.status) };
  const rows = await res.json();
  return { count: Array.isArray(rows) ? rows.length : 0 };
}

/** Die Inhaltsspalten eines abgeleiteten Rezepts (Einreichen und Aendern teilen sie). */
function contentFields(recipe) {
  return {
    title: recipe.title,
    meal_type: recipe.meal_type,
    diet_tags: recipe.diet_tags,
    contains_tags: recipe.contains_tags,
    servings: recipe.servings,
    prep_minutes: recipe.prep_minutes ?? null,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
    nutrition: recipe.nutrition,
    image_url: recipe.image_url ?? null,
  };
}

/** Einreichen: validieren, ableiten, als source=athlete/pending speichern. */
async function submitRecipe(body, sub, env, fetchImpl = fetch) {
  const derived = await deriveRecipe(body, sub);
  if (!derived.ok) return derived;

  // Fahrplan 29 V-3: verifizierte Autoren veroeffentlichen sofort und haben kein Limit offener Rezepte.
  let author;
  try {
    author = await isVerifiedAuthor(sub, env, fetchImpl);
  } catch {
    return networkFailure("PostgREST");
  }
  if (author.error) return author.error;

  let open = { count: 0 };
  if (!author.verified) {
    try {
      open = await countOpenRecipes(sub, env, fetchImpl);
    } catch {
      return networkFailure("PostgREST");
    }
    if (open.error) return open.error;
  }
  if (open.count >= LIMITS.openRecipes) {
    return {
      ok: false,
      status: 409,
      error: {
        code: "VALIDATION",
        message: "zu viele offene Rezepte",
        details: { open_recipes: [`hoechstens ${LIMITS.openRecipes} offene Rezepte gleichzeitig`] },
      },
    };
  }

  const { recipe } = derived;
  const row = {
    source: "athlete",
    status: author.verified ? "approved" : "pending",
    submitted_by: sub,
    external_id: `athlete-${crypto.randomUUID()}`,
    ...contentFields(recipe),
  };

  let res;
  try {
    res = await fetchImpl(`${env.POSTGREST_INTERNAL_URL}/recipes`, {
      method: "POST",
      headers: serviceHeaders(env, { "Content-Type": "application/json", Prefer: "return=representation" }),
      body: JSON.stringify(row),
    });
  } catch {
    return networkFailure("PostgREST");
  }
  if (!res.ok) return httpFailure("PostgREST", res.status);
  const rows = await res.json();
  return { ok: true, status: 201, recipe: Array.isArray(rows) ? rows[0] : rows };
}

const recipeNotFound = () => ({
  ok: false,
  status: 404,
  error: { code: "NO_DATA", message: "Rezept nicht gefunden" },
});
const notPending = (message) => ({ ok: false, status: 409, error: { code: "VALIDATION", message } });

/**
 * Laedt das Rezept und prueft Besitz + Status (gemeinsam fuer PUT und DELETE).
 * Offen ist ein eigenes pending-Rezept; ein freigegebenes (approved) nur fuer einen verifizierten
 * Autor (Fahrplan 29 V-4). Liefert { ok: true, status } mit dem geprueften Status oder die fertige
 * Fehlerantwort (404 fremd/fehlend, 409 nicht mehr aenderbar).
 */
async function checkOwnRecipe(id, sub, env, fetchImpl, notPendingMessage) {
  if (!UUID_RE.test(id)) return recipeNotFound();

  let rows;
  try {
    const res = await fetchImpl(
      `${env.POSTGREST_INTERNAL_URL}/recipes?id=eq.${id}&select=id,submitted_by,status`,
      { headers: serviceHeaders(env) }
    );
    if (!res.ok) return httpFailure("PostgREST", res.status);
    rows = await res.json();
  } catch {
    return networkFailure("PostgREST");
  }

  const row = Array.isArray(rows) ? rows[0] : null;
  // Fremdes Rezept sieht aus wie ein fehlendes — nichts ueber andere verraten.
  if (!row || row.submitted_by !== sub) return recipeNotFound();
  if (row.status === "pending") return { ok: true, status: "pending" };

  if (row.status === "approved") {
    let author;
    try {
      author = await isVerifiedAuthor(sub, env, fetchImpl);
    } catch {
      return networkFailure("PostgREST");
    }
    if (author.error) return author.error;
    if (author.verified) return { ok: true, status: "approved" };
  }
  return notPending(notPendingMessage);
}

/**
 * Eigenes pending-Rezept aendern: wie Einreichen pruefen und neu ableiten, dann ersetzen.
 * Alle Stimmen zum Rezept werden geloescht (S1-10) — sie bezogen sich auf den alten Inhalt.
 */
async function updateRecipe(id, body, sub, env, fetchImpl = fetch) {
  const own = await checkOwnRecipe(id, sub, env, fetchImpl, "nur offene Rezepte koennen geaendert werden");
  if (!own.ok) return own;

  const derived = await deriveRecipe(body, sub);
  if (!derived.ok) return derived;

  let rows;
  try {
    // Filter wiederholt Besitzer + Status: kein Fenster zwischen Pruefen und Schreiben.
    const res = await fetchImpl(
      `${env.POSTGREST_INTERNAL_URL}/recipes?id=eq.${id}&submitted_by=eq.${encodeURIComponent(sub)}&status=eq.${own.status}`,
      {
        method: "PATCH",
        headers: serviceHeaders(env, { "Content-Type": "application/json", Prefer: "return=representation" }),
        body: JSON.stringify(contentFields(derived.recipe)),
      }
    );
    if (!res.ok) return httpFailure("PostgREST", res.status);
    rows = await res.json();
  } catch {
    return networkFailure("PostgREST");
  }
  // Leer = zwischen Pruefen und Schreiben entschieden/zurueckgezogen.
  if (!Array.isArray(rows) || rows.length === 0) {
    return notPending("nur offene Rezepte koennen geaendert werden");
  }

  // Erst nach dem erfolgreichen Schreiben: scheitert dies hier, ist der Inhalt neu und
  // die alten Stimmen bleiben stehen — ein erneutes PUT raeumt sie dann ab.
  try {
    const res = await fetchImpl(`${env.POSTGREST_INTERNAL_URL}/recipe_votes?recipe_id=eq.${id}`, {
      method: "DELETE",
      headers: serviceHeaders(env),
    });
    if (!res.ok) return httpFailure("PostgREST", res.status);
  } catch {
    return networkFailure("PostgREST");
  }
  return { ok: true, status: 200, recipe: rows[0] };
}

/**
 * Eigenes Rezept zurueckziehen (pending; freigegeben nur als verifizierter Autor). Stimmen gehen
 * per ON DELETE CASCADE mit. Ein freigegebenes Rezept, das in einem Essensplan liegt, laesst sich
 * nicht loeschen (FK restrict, 0064) — das melden wir vorher als 409 statt eines rohen FK-Fehlers.
 */
async function deleteRecipe(id, sub, env, fetchImpl = fetch) {
  const own = await checkOwnRecipe(id, sub, env, fetchImpl, "nur offene Rezepte koennen zurueckgezogen werden");
  if (!own.ok) return own;

  try {
    if (own.status === "approved") {
      const plan = await isInMealPlan(id, env, fetchImpl);
      if (plan.error) return plan.error;
      if (plan.used) return inMealPlans();
    }

    // Filter wiederholt Besitzer + Status: kein Fenster zwischen Pruefen und Loeschen.
    const res = await fetchImpl(
      `${env.POSTGREST_INTERNAL_URL}/recipes?id=eq.${id}&submitted_by=eq.${encodeURIComponent(sub)}&status=eq.${own.status}`,
      { method: "DELETE", headers: serviceHeaders(env) }
    );
    // 409 = FK-Verletzung: zwischen Pruefen und Loeschen kam ein Essensplan-Eintrag dazu.
    if (res.status === 409) return inMealPlans();
    if (!res.ok) return httpFailure("PostgREST", res.status);
  } catch {
    return networkFailure("PostgREST");
  }
  return { ok: true, status: 200 };
}

/** Formularpruefung fuer einen Zutaten-Wunsch: { name, note? }. */
function checkRequestInput(body) {
  const details = {};
  const input = isPlainObject(body) ? body : {};

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) addDetail(details, "name", "Name fehlt");
  else if (name.length > LIMITS.requestName) addDetail(details, "name", `Name hoechstens ${LIMITS.requestName} Zeichen`);

  let note = null;
  if (input.note !== undefined && input.note !== null) {
    if (typeof input.note !== "string") addDetail(details, "note", "note muss ein Text sein");
    else if (input.note.trim().length > LIMITS.requestNote) {
      addDetail(details, "note", `Hinweis hoechstens ${LIMITS.requestNote} Zeichen`);
    } else note = input.note.trim() || null;
  }

  if (Object.keys(details).length > 0) return { ok: false, details };
  return { ok: true, name, note };
}

/** Zutaten-Wunsch speichern (Migration 0070); hoechstens 20 je Athlet. */
async function submitIngredientRequest(body, sub, env, fetchImpl = fetch) {
  const checked = checkRequestInput(body);
  if (!checked.ok) return validationFailure(checked.details);

  let res;
  try {
    res = await fetchImpl(
      `${env.POSTGREST_INTERNAL_URL}/ingredient_requests?requested_by=eq.${encodeURIComponent(sub)}` +
        `&select=id&limit=${LIMITS.ingredientRequests}`,
      { headers: serviceHeaders(env) }
    );
    if (!res.ok) return httpFailure("PostgREST", res.status);
    const existing = await res.json();
    if (Array.isArray(existing) && existing.length >= LIMITS.ingredientRequests) {
      return {
        ok: false,
        status: 409,
        error: {
          code: "VALIDATION",
          message: "zu viele Zutaten-Wuensche",
          details: { requests: [`hoechstens ${LIMITS.ingredientRequests} Wuensche je Athlet`] },
        },
      };
    }

    res = await fetchImpl(`${env.POSTGREST_INTERNAL_URL}/ingredient_requests`, {
      method: "POST",
      headers: serviceHeaders(env, { "Content-Type": "application/json", Prefer: "return=representation" }),
      body: JSON.stringify({ requested_by: sub, name: checked.name, note: checked.note }),
    });
  } catch {
    return networkFailure("PostgREST");
  }
  if (!res.ok) return httpFailure("PostgREST", res.status);
  const rows = await res.json();
  return { ok: true, status: 201, request: Array.isArray(rows) ? rows[0] : rows };
}

module.exports = {
  LIMITS,
  searchIngredients,
  previewRecipe,
  submitRecipe,
  updateRecipe,
  deleteRecipe,
  submitIngredientRequest,
  deriveRecipe,
  foldText,
  loadDerivation,
};

/* ============================================================
   CORE/RECIPE-IMAGE.JS — Bildquelle eines Rezepts (kein I/O)
   (Fahrplan 25, R1; Entscheidungen Q2, Q3, Q9)

   Löst auf, WELCHES Bild ein Rezept zeigt und ob es ein KI-Bild
   ist (dann trägt die Oberfläche das Label "Serviervorschlag
   (KI-Bild)"). Reine Funktion, kein Dateizugriff.

   Reihenfolge: 1) `imageUrl` (Athleten-Foto aus dem Bucket, Q9 — kein
   KI-Label), 2) KI-Bild der eigenen Rezepte (F3): steht die
   `externalId` im Manifest, liegt das Bild unter
   `<baseUrl>recipe-images/<externalId>.webp` (Q3) und trägt das Label.
   3) sonst null → Platzhalter. Das Manifest kommt von außen (Set),
   damit die Funktion rein und testbar bleibt.
   ============================================================ */

/** @typedef {{ src: string, ai: boolean }} RecipeImageSource */

/**
 * @param {{ imageUrl?: string | null, externalId?: string | null } | null | undefined} recipe
 * @param {ReadonlySet<string>} [manifest] external_ids mit vorhandenem KI-Bild
 * @param {string} [baseUrl] Basis-Pfad der App, endet auf "/" (Vite: BASE_URL)
 * @returns {RecipeImageSource | null} null = kein Bild vorhanden (Platzhalter zeigen)
 */
export function recipeImageSource(recipe, manifest = new Set(), baseUrl = "/") {
  const url = typeof recipe?.imageUrl === "string" ? recipe.imageUrl.trim() : "";
  if (url !== "") return { src: url, ai: false };
  const id = typeof recipe?.externalId === "string" ? recipe.externalId : "";
  if (id !== "" && manifest.has(id)) return { src: `${baseUrl}recipe-images/${id}.webp`, ai: true };
  return null;
}

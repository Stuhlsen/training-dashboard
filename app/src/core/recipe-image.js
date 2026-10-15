/* ============================================================
   CORE/RECIPE-IMAGE.JS — Bildquelle eines Rezepts (kein I/O)
   (Fahrplan 25, R1; Entscheidungen Q2, Q3, Q9)

   Löst auf, WELCHES Bild ein Rezept zeigt und ob es ein KI-Bild
   ist (dann trägt die Oberfläche das Label "Serviervorschlag
   (KI-Bild)"). Reine Funktion, kein Dateizugriff.

   Heute: nur `imageUrl` (Athleten-Foto aus dem Bucket, Q9 — kein
   KI-Label). Die KI-Bilder der eigenen Rezepte (F3) hängen hier
   später per Manifest über `externalId` ein: der Rückgabewert
   behält die Form { src, ai }, die Komponente ändert sich nicht.
   ============================================================ */

/** @typedef {{ src: string, ai: boolean }} RecipeImageSource */

/**
 * @param {{ imageUrl?: string | null, externalId?: string | null } | null | undefined} recipe
 * @returns {RecipeImageSource | null} null = kein Bild vorhanden (Platzhalter zeigen)
 */
export function recipeImageSource(recipe) {
  const url = typeof recipe?.imageUrl === "string" ? recipe.imageUrl.trim() : "";
  if (url !== "") return { src: url, ai: false };
  return null;
}

/* ============================================================
   SCRIPTS/BUILD-RECIPE-NUTRITION.JS — Rezept-Bestand mit Nährwerten bauen
   (Fahrplan 23, Etappe E3c, Entscheidungen E23–E27)

   Liest Quellrezepte (ohne Nährwerte/Tags), rechnet je Portion kcal,
   Eiweiß, Kohlenhydrate und Fett aus der Zutatentabelle
   (scripts/lib/ingredient-nutrition.json; Quelle BLS 4.0 / USDA FDC) und
   leitet contains_tags und diet_tags aus den Zutaten ab. Das Ergebnis
   wird mit scripts/lib/validate-recipe.js geprüft und kann mit
   scripts/seed-own-recipes.js eingespielt werden.

   Kein Schreibzugriff auf eine Datenbank. Die Rezepte selbst liegen
   privat in planning/seed/ (gitignored) — nur dieses Skript ist im Repo.

   Aufruf:
     node scripts/build-recipe-nutrition.js --in <quelle.json> [--out <seed.json>]
          [--table <tabelle.json>] [--samples <datei.md> --sample "<Titel>" ...]

   Exit-Code 1 bei Rechenfehlern (unbekannte Zutat/Einheit), Validator-
   Fehlern oder wenn die Abdeckung (>= 3 Rezepte je Slot und Allergen)
   unterschritten wird.
   ============================================================ */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAll, explainIngredients, validateIngredientTable } from "./lib/recipe-nutrition.js";
import { coverageReport, mixReport, SLOTS } from "./lib/recipe-coverage.js";
import { validateRecipes } from "./lib/validate-recipe.js";
import { log } from "./lib/log.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_TABLE = path.join(here, "lib", "ingredient-nutrition.json");

/** Einfacher Argument-Parser: --key wert, --sample darf mehrfach vorkommen. */
export function parseArgs(argv) {
  const args = { sample: [] };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    if (key === "sample") args.sample.push(argv[i + 1]);
    else if (key) args[key] = argv[i + 1];
  }
  return args;
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const pct = (x) => `${Math.round(x * 100)} %`;

/** Markdown-Stichproben: Zutaten, Rechenweg und abgeleitete Tags zum Gegenprüfen. */
export function renderSamples(titles, sources, recipes, table) {
  const lines = [
    "# E3c — Stichproben zum Gegenprüfen",
    "",
    "Je Rezept: Zutaten mit Gramm, kcal-Anteil, Quelle und Allergenen, darunter Nährwerte je Portion",
    "und die abgeleiteten Tags. Bitte prüfen: Stimmen Mengen, Allergene und Tags?",
    "",
  ];
  for (const title of titles) {
    const src = sources.find((s) => s.title === title);
    const rec = recipes.find((r) => r.title === title);
    if (!src || !rec) throw new Error(`Stichprobe "${title}" nicht gefunden`);
    lines.push(
      `## ${title}`,
      "",
      `Slots: ${rec.meal_type.join(", ")} · Portionen: ${rec.servings}`,
      ""
    );
    lines.push(
      "| Zutat | Menge | ≈ Gramm | kcal gesamt | Quelle | Allergene |",
      "|---|---|---|---|---|---|"
    );
    for (const e of explainIngredients(src, table)) {
      lines.push(
        `| ${e.name} | ${e.amount} ${e.unit} | ${e.grams} | ${e.kcal} | ${e.quelle} | ${e.allergene.join(", ") || "–"} |`
      );
    }
    const n = rec.nutrition;
    lines.push(
      "",
      `**Je Portion:** ${n.kcal} kcal · ${n.protein} g Eiweiß · ${n.carbs} g Kohlenhydrate · ${n.fat} g Fett`
    );
    lines.push(
      `**contains_tags:** ${rec.contains_tags.join(", ") || "–"} · **diet_tags:** ${rec.diet_tags.join(", ")}`,
      ""
    );
  }
  return lines.join("\n");
}

function printReport(recipes, sources) {
  const meta = new Map(sources.map((s) => [s.title, s]));
  const mix = mixReport(recipes, meta);
  log.info(`\nRezepte: ${mix.count}`);
  log.info(
    `Slots (Mehrfachzugehörigkeit zählt je Slot): ${SLOTS.map((s) => `${s} ${mix.slots[s]}`).join(", ")}`
  );
  log.info(
    `Vegetarisch/vegan ${pct(mix.vegOrVegan)} · glutenfrei ${pct(mix.glutenFree)} · laktosefrei ${pct(mix.lactoseFree)}`
  );
  log.info(`Höchstens 30 Min ${pct(mix.quick30)} · radsportspezifisch ${pct(mix.cycling)}`);
  const cov = coverageReport(recipes);
  log.info("\nAbdeckung nach Allergen-Filter (Rezepte je Slot):");
  log.info(
    `  ${"ohne Filter".padEnd(14)}${SLOTS.map((s) => String(cov.total[s]).padStart(10)).join("")}`
  );
  for (const [key, counts] of Object.entries(cov.perAllergen)) {
    log.info(`  ${key.padEnd(14)}${SLOTS.map((s) => String(counts[s]).padStart(10)).join("")}`);
  }
  log.info(`  (Spalten: ${SLOTS.join(", ")})`);
  return cov.shortfalls;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.in) {
    log.error("Fehlt: --in <quelle.json>");
    process.exit(1);
  }
  const table = readJson(args.table ?? DEFAULT_TABLE);
  const tableErrors = validateIngredientTable(table);
  const sources = readJson(args.in);
  const { recipes, errors } = buildAll(sources, table);
  const validation = recipes.length > 0 ? validateRecipes(recipes) : { ok: true };
  const problems = [...tableErrors, ...errors, ...(validation.ok ? [] : validation.errors)];
  problems.forEach((p) => log.error(`FEHLER: ${p}`));
  if (problems.length > 0) process.exit(1);

  const shortfalls = printReport(recipes, sources);
  shortfalls.forEach((s) => log.error(`ABDECKUNG: ${s}`));

  if (args.out) fs.writeFileSync(args.out, `${JSON.stringify(recipes, null, 2)}\n`);
  if (args.samples) {
    fs.writeFileSync(args.samples, renderSamples(args.sample, sources, recipes, table));
  }
  if (shortfalls.length > 0) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

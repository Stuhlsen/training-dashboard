#!/usr/bin/env node
/**
 * generate-data.js
 * Ersetzt die Netlify Serverless Function.
 * Zieht Trainingsdaten aus Notion und schreibt data/rides.json.
 *
 * Verwendung:
 *   NOTION_API_KEY=ntn_... NOTION_DATABASE_ID=33d4... node scripts/generate-data.js
 *
 * Oder mit .env (lokal):
 *   Erstelle eine .env-Datei im Projekt-Root mit:
 *     NOTION_API_KEY=ntn_...
 *     NOTION_DATABASE_ID=33d4...
 *   Dann: node scripts/generate-data.js
 */

const fs = require("fs");
const path = require("path");

// .env laden (falls vorhanden, für lokale Entwicklung)
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...rest] = trimmed.split("=");
      process.env[key.trim()] = rest.join("=").trim();
    }
  }
}

const NOTION_KEY = process.env.NOTION_API_KEY;
const DB_ID = process.env.NOTION_DATABASE_ID;
const DB_ID_PLAN2 = process.env.NOTION_DATABASE_ID_PLAN2 || "";
const OUT_FILE = path.join(__dirname, "..", "data", "rides.json");

if (!NOTION_KEY || !DB_ID) {
  console.error("❌ NOTION_API_KEY oder NOTION_DATABASE_ID nicht gesetzt.");
  console.error("   Setze sie als Umgebungsvariablen oder in einer .env-Datei.");
  process.exit(1);
}

// === Notion Property Helper (identisch mit der Netlify Function) ===
function getTitle(prop) {
  if (!prop || prop.type !== "title") return "";
  return prop.title?.map((t) => t.plain_text).join("") || "";
}
function getSelect(prop) {
  if (!prop) return null;
  if (prop.type === "select") return prop.select?.name || null;
  if (prop.type === "multi_select") return prop.multi_select?.map((s) => s.name).join(", ") || null;
  if (prop.type === "status") return prop.status?.name || null;
  return null;
}
function getNum(prop) {
  if (!prop || prop.type !== "number") return null;
  return prop.number;
}
function getCheckbox(prop) {
  if (!prop || prop.type !== "checkbox") return false;
  return prop.checkbox || false;
}
function getDate(prop) {
  if (!prop || prop.type !== "date" || !prop.date) return null;
  return prop.date.start || null;
}
function getRichText(prop) {
  if (!prop || prop.type !== "rich_text") return "";
  return prop.rich_text?.map((t) => t.plain_text).join("") || "";
}

async function queryNotionDB(dbId, defaultPlan) {
  console.log(`📡 Notion-Datenbank abfragen (${defaultPlan})...`);

  let allResults = [];
  let hasMore = true;
  let startCursor = undefined;

  while (hasMore) {
    const body = {
      page_size: 100,
      sorts: [{ property: "Datum", direction: "ascending" }],
    };
    if (startCursor) body.start_cursor = startCursor;

    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NOTION_KEY}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`❌ Notion API Fehler (${res.status}):`, err);
      process.exit(1);
    }

    const data = await res.json();
    allResults = allResults.concat(data.results);
    hasMore = data.has_more;
    startCursor = data.next_cursor;
    console.log(`   ... ${allResults.length} Einträge geladen`);
  }

  return allResults
    .filter((p) => {
      const st = p.properties?.Status;
      const name = st?.select?.name || st?.status?.name;
      return name === "Erledigt";
    })
    .map((page) => {
      const pr = page.properties;

      const rawName = getTitle(pr["Einheit"]);
      const cleanName = rawName
        .replace(/^W\d+\s*[·\-]\s*\S+\s*[·\-]\s*/, "")
        .trim();

      const notizen = getRichText(pr["Notizen"]);
      let ftpWatt = null;
      if (getSelect(pr["Typ"]) === "FTP-Test" && notizen) {
        const ftpMatch = notizen.match(/(?:Neues FTP|FTP)[:\s]+(\d+)\s*W/i);
        if (ftpMatch) ftpWatt = parseInt(ftpMatch[1], 10);
      }

      return {
        notionId: page.id,
        name: cleanName || rawName,
        date: getDate(pr["Datum"]),
        week: getSelect(pr["Woche"]),
        phase: getSelect(pr["Phase"]),
        typ: getSelect(pr["Typ"]),
        plan: getSelect(pr["Plan"]) || defaultPlan,
        km: getNum(pr["Distanz (km)"]),
        min: getNum(pr["Dauer (min)"]),
        kmh: getNum(pr["Avg-Tempo (km/h)"]),
        hf: getNum(pr["Avg-HF"]),
        hfMax: getNum(pr["HF-Max"]),
        kad: getNum(pr["Avg-Kadenz"]),
        watt: getNum(pr["Avg-Watt"]),
        np: getNum(pr["NP (W)"]),
        ftpWatt,
        maxWatt: getNum(pr["Max-Watt"]),
        trimp: getNum(pr["TRIMP"]),
        ctl: getNum(pr["CTL (Fitness)"]),
        atl: getNum(pr["ATL (Ermüdung)"]),
        tsb: getNum(pr["TSB (Form)"]),
        tss: getNum(pr["TSS"]),
        vi: getNum(pr["VI"]),
        ruhepuls: getNum(pr["Ruhepuls"]),
        hrv: getNum(pr["HRV"]),
        dtl: getNum(pr["DTL"]),
        hoehe: getNum(pr["Hoehengewinn (m)"] || pr["Hoehengewinn"]),
        feel: getSelect(pr["Befinden"]),
        heu: getCheckbox(pr["Heuschnupfen"]),
        wetter: getRichText(pr["Wetter"]),
        notizen,
      };
    });
}

async function main() {
  // Plan 1 Datenbank
  let rides = await queryNotionDB(DB_ID, "Plan 1");

  // Plan 2 Datenbank (optional)
  if (DB_ID_PLAN2) {
    const plan2Rides = await queryNotionDB(DB_ID_PLAN2, "Plan 2");
    rides = rides.concat(plan2Rides);
  }

  // Nach Datum sortieren, IDs neu vergeben
  rides.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  rides.forEach((r, i) => (r.id = i + 1));

  // Datum-Formate
  rides.forEach((r) => {
    if (r.date) {
      const [y, m, d] = r.date.split("-");
      r.dateShort = `${d}.${m}`;
      r.dateISO = r.date;
    }
  });

  // Verfügbare Pläne ermitteln
  const plans = [...new Set(rides.map((r) => r.plan))].sort();

  const output = {
    rides,
    plans,
    updated: new Date().toISOString(),
    source: "notion",
    count: rides.length,
  };

  // Schreiben
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2), "utf-8");

  console.log(`✅ ${rides.length} Fahrten → ${OUT_FILE}`);
  console.log(`   Pläne: ${plans.join(", ")}`);
  console.log(`   Zeitraum: ${rides[0]?.dateISO || "?"} bis ${rides[rides.length - 1]?.dateISO || "?"}`);
}

main().catch((err) => {
  console.error("❌ Fehler:", err.message);
  process.exit(1);
});

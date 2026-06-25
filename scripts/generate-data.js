#!/usr/bin/env node
/**
 * generate-data.js
 * Generiert rides.json aus zwei Quellen:
 *   Plan 1: Notion-Datenbank (historisch, alle Felder)
 *   Plan 2: intervals.icu API (Rides + Wellness) + Notion (Befinden/Notizen)
 *
 * Secrets (env oder .env):
 *   NOTION_API_KEY, NOTION_DATABASE_ID, NOTION_DATABASE_ID_PLAN2
 *   INTERVALS_API_KEY, INTERVALS_ATHLETE_ID
 */

const fs = require("fs");
const path = require("path");

// === .env laden ===
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (t && !t.startsWith("#")) {
      const [key, ...rest] = t.split("=");
      process.env[key.trim()] = rest.join("=").trim();
    }
  }
}

const NOTION_KEY = process.env.NOTION_API_KEY;
const DB_ID = process.env.NOTION_DATABASE_ID;
const DB_ID_PLAN2 = process.env.NOTION_DATABASE_ID_PLAN2 || "";
const INTERVALS_KEY = process.env.INTERVALS_API_KEY || "";
const INTERVALS_ATHLETE = process.env.INTERVALS_ATHLETE_ID || "";
const OUT_FILE = path.join(__dirname, "..", "data", "rides.json");

if (!NOTION_KEY || !DB_ID) {
  console.error("❌ NOTION_API_KEY oder NOTION_DATABASE_ID nicht gesetzt.");
  process.exit(1);
}

// === Plan 2 Woche/Phase-Mapping (datumsbasiert) ===
const PLAN2_SCHEDULE = [
  { week: "P2-W0",  phase: "Übergang",   start: "2026-06-22", end: "2026-06-28" },
  { week: "P2-W1",  phase: "Sweet Spot", start: "2026-06-29", end: "2026-07-05" },
  { week: "P2-W2",  phase: "Sweet Spot", start: "2026-07-06", end: "2026-07-12" },
  { week: "P2-W3",  phase: "Sweet Spot", start: "2026-07-13", end: "2026-07-19" },
  { week: "P2-W4",  phase: "Erholung",   start: "2026-07-20", end: "2026-07-26" },
  { week: "P2-W5",  phase: "Schwelle",   start: "2026-07-27", end: "2026-08-02" },
  { week: "P2-W6",  phase: "Schwelle",   start: "2026-08-03", end: "2026-08-09" },
  { week: "P2-W7",  phase: "Schwelle",   start: "2026-08-10", end: "2026-08-16" },
  { week: "P2-W8",  phase: "Erholung",   start: "2026-08-17", end: "2026-08-23" },
  { week: "P2-W9",  phase: "VO2max",     start: "2026-08-24", end: "2026-08-30" },
  { week: "P2-W10", phase: "VO2max",     start: "2026-08-31", end: "2026-09-06" },
  { week: "P2-W11", phase: "VO2max",     start: "2026-09-07", end: "2026-09-13" },
  { week: "P2-W12", phase: "Taper",      start: "2026-09-14", end: "2026-09-20" },
];

function getPlan2WeekPhase(dateStr) {
  for (const s of PLAN2_SCHEDULE) {
    if (dateStr >= s.start && dateStr <= s.end) return { week: s.week, phase: s.phase };
  }
  return { week: null, phase: null };
}

// === Notion Helpers ===
function getTitle(p) { return p?.type === "title" ? p.title?.map(t => t.plain_text).join("") || "" : ""; }
function getSelect(p) {
  if (!p) return null;
  if (p.type === "select") return p.select?.name || null;
  if (p.type === "multi_select") return p.multi_select?.map(s => s.name).join(", ") || null;
  if (p.type === "status") return p.status?.name || null;
  return null;
}
function getNum(p) { return p?.type === "number" ? p.number : null; }
function getCheckbox(p) { return p?.type === "checkbox" ? p.checkbox || false : false; }
function getDate(p) { return p?.type === "date" && p.date ? p.date.start || null : null; }
function getRichText(p) { return p?.type === "rich_text" ? p.rich_text?.map(t => t.plain_text).join("") || "" : ""; }

// === Notion: Plan 1 Daten (alle Felder) ===
async function queryNotionPlan1() {
  console.log("📡 Notion-Datenbank abfragen (Plan 1)...");
  let all = [], hasMore = true, cursor;

  while (hasMore) {
    const body = { page_size: 100, sorts: [{ property: "Datum", direction: "ascending" }] };
    if (cursor) body.start_cursor = cursor;
    const res = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${NOTION_KEY}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) { console.error(`❌ Notion Plan 1 (${res.status}):`, await res.text()); process.exit(1); }
    const data = await res.json();
    all = all.concat(data.results);
    hasMore = data.has_more;
    cursor = data.next_cursor;
  }
  console.log(`   ... ${all.length} Einträge geladen`);

  return all
    .filter(p => { const st = p.properties?.Status; return (st?.select?.name || st?.status?.name) === "Erledigt"; })
    .map(page => {
      const pr = page.properties;
      const rawName = getTitle(pr["Einheit"]);
      const cleanName = rawName.replace(/^W\d+\s*[·\-]\s*\S+\s*[·\-]\s*/, "").trim();
      const notizen = getRichText(pr["Notizen"]);
      let ftpWatt = null;
      if (getSelect(pr["Typ"]) === "FTP-Test" && notizen) {
        const m = notizen.match(/(?:Neues FTP|FTP)[:\s]+(\d+)\s*W/i);
        if (m) ftpWatt = parseInt(m[1], 10);
      }
      return {
        name: cleanName || rawName, date: getDate(pr["Datum"]),
        week: getSelect(pr["Woche"]), phase: getSelect(pr["Phase"]),
        typ: getSelect(pr["Typ"]), plan: "Plan 1",
        km: getNum(pr["Distanz (km)"]), min: getNum(pr["Dauer (min)"]),
        kmh: getNum(pr["Avg-Tempo (km/h)"]), hf: getNum(pr["Avg-HF"]),
        hfMax: getNum(pr["HF-Max"]), kad: getNum(pr["Avg-Kadenz"]),
        watt: getNum(pr["Avg-Watt"]), np: getNum(pr["NP (W)"]),
        ftpWatt, maxWatt: getNum(pr["Max-Watt"]),
        trimp: getNum(pr["TRIMP"]), ctl: getNum(pr["CTL (Fitness)"]),
        atl: getNum(pr["ATL (Ermüdung)"]), tsb: getNum(pr["TSB (Form)"]),
        tss: getNum(pr["TSS"]), vi: getNum(pr["VI"]),
        ruhepuls: getNum(pr["Ruhepuls"]), hrv: getNum(pr["HRV"]),
        decoupling: null,
        dtl: getNum(pr["DTL"]),
        hoehe: getNum(pr["Hoehengewinn (m)"] || pr["Hoehengewinn"]),
        feel: getSelect(pr["Befinden"]), heu: getCheckbox(pr["Heuschnupfen"]),
        wetter: getRichText(pr["Wetter"]), notizen,
      };
    });
}

// === Notion: Plan 2 subjektive Daten (nur Befinden + Notizen) ===
async function queryNotionPlan2Subjective() {
  if (!DB_ID_PLAN2) return [];
  console.log("📡 Notion-Datenbank abfragen (Plan 2 subjektiv)...");
  let all = [], hasMore = true, cursor;

  while (hasMore) {
    const body = { page_size: 100, sorts: [{ property: "Datum", direction: "ascending" }] };
    if (cursor) body.start_cursor = cursor;
    const res = await fetch(`https://api.notion.com/v1/databases/${DB_ID_PLAN2}/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${NOTION_KEY}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) { console.error(`❌ Notion Plan 2 (${res.status}):`, await res.text()); process.exit(1); }
    const data = await res.json();
    all = all.concat(data.results);
    hasMore = data.has_more;
    cursor = data.next_cursor;
  }
  console.log(`   ... ${all.length} Einträge geladen`);

  const entries = {};
  for (const page of all) {
    const pr = page.properties;
    const date = getDate(pr["Datum"]);
    if (date) {
      entries[date] = {
        feel: getSelect(pr["Befinden"]),
        notizen: getRichText(pr["Notizen"]),
        typ: getSelect(pr["Typ"]),
        name: getTitle(pr["Einheit"]),
      };
    }
  }
  return entries;
}

// === intervals.icu API ===
async function intervalsGet(endpoint) {
  const url = `https://intervals.icu/api/v1${endpoint}`;
  const auth = Buffer.from(`API_KEY:${INTERVALS_KEY}`).toString("base64");
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });
  if (!res.ok) {
    console.error(`❌ intervals.icu (${res.status}): ${url}`, await res.text());
    return null;
  }
  return res.json();
}

async function getIntervalsActivities(oldest, newest) {
  console.log(`🔄 intervals.icu Activities (${oldest} bis ${newest})...`);
  const data = await intervalsGet(
    `/athlete/${INTERVALS_ATHLETE}/activities?oldest=${oldest}&newest=${newest}`
  );
  if (!data) return [];
  const rides = data.filter(a => a.type === "Ride");
  console.log(`   ... ${rides.length} Rides geladen`);
  return rides;
}

async function getIntervalsWellness(oldest, newest) {
  console.log(`🔄 intervals.icu Wellness (${oldest} bis ${newest})...`);
  const data = await intervalsGet(
    `/athlete/${INTERVALS_ATHLETE}/wellness?oldest=${oldest}&newest=${newest}`
  );
  if (!data) return {};
  const map = {};
  for (const w of data) map[w.id] = w;
  console.log(`   ... ${Object.keys(map).length} Tage geladen`);
  return map;
}

// === intervals.icu Activity → Ride-Objekt ===
function mapActivity(act, wellness, subjective) {
  const date = act.start_date_local.split("T")[0];
  const { week, phase } = getPlan2WeekPhase(date);
  const w = wellness[date] || {};
  const s = subjective[date] || {};

  return {
    name: s.name || act.name || "Radfahren",
    date,
    week,
    phase,
    typ: s.typ || "Gruppenfahrt",
    plan: "Plan 2",
    km: Math.round((act.distance || 0) / 100) / 10,
    min: Math.round((act.moving_time || 0) / 60),
    kmh: Math.round((act.average_speed || 0) * 3.6 * 10) / 10,
    watt: act.icu_average_watts,
    maxWatt: null,
    np: act.icu_weighted_avg_watts,
    hf: act.average_heartrate,
    hfMax: act.max_heartrate,
    kad: act.average_cadence ? Math.round(act.average_cadence) : null,
    hoehe: act.total_elevation_gain,
    tss: act.icu_training_load,
    if: act.icu_intensity ? Math.round(act.icu_intensity) / 100 : null,
    vi: act.icu_variability_index ? Math.round(act.icu_variability_index * 100) / 100 : null,
    trimp: act.trimp ? Math.round(act.trimp) : null,
    ctl: act.icu_ctl ? Math.round(act.icu_ctl * 10) / 10 : null,
    atl: act.icu_atl ? Math.round(act.icu_atl * 10) / 10 : null,
    tsb: (act.icu_ctl != null && act.icu_atl != null)
      ? Math.round((act.icu_ctl - act.icu_atl) * 10) / 10 : null,
    decoupling: act.decoupling != null ? Math.round(act.decoupling * 10) / 10 : null,
    dtl: act.icu_training_load,
    ruhepuls: w.restingHR || null,
    hrv: w.hrvSDNN || null,
    avgSleepingHR: w.avgSleepingHR || null,
    sleepHours: w.sleepSecs ? Math.round(w.sleepSecs / 360) / 10 : null,
    feel: s.feel || null,
    notizen: s.notizen || null,
    wetter: act.average_temp ? `~${Math.round(act.average_temp)}°C` : null,
    source: "intervals.icu",
  };
}

// === Main ===
async function main() {
  // 1. Plan 1: komplett aus Notion
  const plan1 = await queryNotionPlan1();

  // 2. Plan 2: intervals.icu + Notion subjektiv
  let plan2 = [];
  if (INTERVALS_KEY && INTERVALS_ATHLETE) {
    const oldest = PLAN2_SCHEDULE[0].start;
    const today = new Date().toISOString().split("T")[0];
    const newest = today > "2026-09-20" ? "2026-09-20" : today;

    const activities = await getIntervalsActivities(oldest, newest);
    const wellness = await getIntervalsWellness(oldest, newest);
    const subjective = await queryNotionPlan2Subjective();

    plan2 = activities.map(act => mapActivity(act, wellness, subjective));
    console.log(`✅ Plan 2: ${plan2.length} Rides aus intervals.icu`);
  } else if (DB_ID_PLAN2) {
    // Fallback: Plan 2 komplett aus Notion (wenn kein intervals.icu Key)
    console.log("⚠️  Kein intervals.icu Key — Plan 2 aus Notion laden...");
    plan2 = await queryNotionPlan1_compat(DB_ID_PLAN2, "Plan 2");
  } else {
    console.log("ℹ️  Kein Plan 2 konfiguriert");
  }

  // 3. Zusammenführen
  const rides = [...plan1, ...plan2];
  rides.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  rides.forEach((r, i) => {
    r.id = i + 1;
    if (r.date) {
      const [y, m, d] = r.date.split("-");
      r.dateShort = `${d}.${m}`;
      r.dateISO = r.date;
    }
  });

  const plans = [...new Set(rides.map(r => r.plan))].filter(Boolean).sort();

  const output = {
    rides,
    plans,
    updated: new Date().toISOString(),
    source: INTERVALS_KEY ? "notion+intervals" : "notion",
    count: rides.length,
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2), "utf-8");

  console.log(`\n✅ ${rides.length} Fahrten → ${OUT_FILE}`);
  console.log(`   Pläne: ${plans.join(", ")}`);
  console.log(`   Zeitraum: ${rides[0]?.dateISO || "?"} bis ${rides[rides.length - 1]?.dateISO || "?"}`);
  console.log(`   Quelle: ${output.source}`);
}

// Fallback: Notion als Plan-2-Quelle (identisch mit Plan-1-Logik)
async function queryNotionPlan1_compat(dbId, planName) {
  console.log(`📡 Notion-Datenbank abfragen (${planName} Fallback)...`);
  let all = [], hasMore = true, cursor;
  while (hasMore) {
    const body = { page_size: 100, sorts: [{ property: "Datum", direction: "ascending" }] };
    if (cursor) body.start_cursor = cursor;
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${NOTION_KEY}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) { console.error(`❌ Notion (${res.status}):`, await res.text()); return []; }
    const data = await res.json();
    all = all.concat(data.results);
    hasMore = data.has_more;
    cursor = data.next_cursor;
  }
  console.log(`   ... ${all.length} Einträge geladen`);
  return all
    .filter(p => { const st = p.properties?.Status; return (st?.select?.name || st?.status?.name) === "Erledigt"; })
    .map(page => {
      const pr = page.properties;
      return {
        name: getTitle(pr["Einheit"]), date: getDate(pr["Datum"]),
        week: getSelect(pr["Woche"]), phase: getSelect(pr["Phase"]),
        typ: getSelect(pr["Typ"]), plan: planName,
        km: getNum(pr["Distanz (km)"]), min: getNum(pr["Dauer (min)"]),
        kmh: getNum(pr["Avg-Tempo (km/h)"]), hf: getNum(pr["Avg-HF"]),
        hfMax: getNum(pr["HF-Max"]), kad: getNum(pr["Avg-Kadenz"]),
        watt: getNum(pr["Avg-Watt"]), np: getNum(pr["NP (W)"]),
        trimp: getNum(pr["TRIMP"]), ctl: getNum(pr["CTL (Fitness)"]),
        atl: getNum(pr["ATL (Ermüdung)"]), tss: getNum(pr["TSS"]),
        ruhepuls: getNum(pr["Ruhepuls"]), hrv: getNum(pr["HRV"]),
        decoupling: null,
        hoehe: getNum(pr["Hoehengewinn (m)"]),
        feel: getSelect(pr["Befinden"]),
        notizen: getRichText(pr["Notizen"]),
      };
    });
}

main().catch(err => { console.error("❌ Fehler:", err.message); process.exit(1); });

#!/usr/bin/env node
/**
 * generate-data.js
 * Generiert rides.json aus zwei Quellen:
 *   Plan 1: Notion-Datenbank (historisch, alle Felder)
 *   Plan 2: intervals.icu API (Rides + Wellness) + data/subjective.json (Befinden)
 *
 * Secrets (env oder .env):
 *   NOTION_API_KEY, NOTION_DATABASE_ID
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
const INTERVALS_KEY = process.env.INTERVALS_API_KEY || "";
const INTERVALS_ATHLETE = process.env.INTERVALS_ATHLETE_ID || "";
const OUT_FILE = path.join(__dirname, "..", "data", "rides.json");
const SUBJECTIVE_FILE = path.join(__dirname, "..", "data", "subjective.json");

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

// === Geplante Einheiten — Datum → Name + Typ ===
// Di = Gruppenfahrt, Do = Intervalle (Sweet Spot/Schwelle/VO2max), Sa = Z2 Lang
// Erholung: Di = Recovery, Do = Z2 Locker, Sa = moderate Z2
const PLANNED_SESSIONS = {
  // W0 Übergang
  "2026-06-23": { name: "Gruppenfahrt W0",         typ: "Gruppenfahrt" },
  "2026-06-25": { name: "Aktivierung W0",           typ: "Z1 Recovery"  },
  "2026-06-27": { name: "Z2 Lang W0",              typ: "Z2 Lang"      },
  // W1 Sweet Spot
  "2026-06-30": { name: "Gruppenfahrt W1",         typ: "Gruppenfahrt" },
  "2026-07-02": { name: "SS 3×10 min W1",          typ: "Sweet Spot"   },
  "2026-07-04": { name: "Z2 Lang W1",              typ: "Z2 Lang"      },
  // W2 Sweet Spot
  "2026-07-07": { name: "Gruppenfahrt W2",         typ: "Gruppenfahrt" },
  "2026-07-09": { name: "SS 3×12 min W2",          typ: "Sweet Spot"   },
  "2026-07-11": { name: "Z2 Lang W2",              typ: "Z2 Lang"      },
  // W3 Sweet Spot
  "2026-07-14": { name: "Gruppenfahrt W3",         typ: "Gruppenfahrt" },
  "2026-07-16": { name: "SS 2×20 min W3",          typ: "Sweet Spot"   },
  "2026-07-18": { name: "Z2 Lang W3",              typ: "Z2 Lang"      },
  // W4 Erholung
  "2026-07-21": { name: "Recovery Fahrt W4",       typ: "Z1 Recovery"  },
  "2026-07-23": { name: "Z2 Locker W4",            typ: "Z2 Dauer"     },
  "2026-07-25": { name: "Z2 Lang W4",              typ: "Z2 Lang"      },
  // W5 Schwelle
  "2026-07-28": { name: "Gruppenfahrt W5",         typ: "Gruppenfahrt" },
  "2026-07-30": { name: "Schwelle 3×8 min W5",     typ: "Schwelle"     },
  "2026-08-01": { name: "Z2 Lang W5",              typ: "Z2 Lang"      },
  // W6 Schwelle
  "2026-08-04": { name: "Gruppenfahrt W6",         typ: "Gruppenfahrt" },
  "2026-08-06": { name: "Schwelle 3×10 min W6",    typ: "Schwelle"     },
  "2026-08-08": { name: "Z2 Lang W6",              typ: "Z2 Lang"      },
  // W7 Schwelle
  "2026-08-11": { name: "Gruppenfahrt W7",         typ: "Gruppenfahrt" },
  "2026-08-13": { name: "Schwelle 2×20 min W7",    typ: "Schwelle"     },
  "2026-08-15": { name: "Z2 Lang W7",              typ: "Z2 Lang"      },
  // W8 Erholung
  "2026-08-18": { name: "Recovery Fahrt W8",       typ: "Z1 Recovery"  },
  "2026-08-20": { name: "Z2 Locker W8",            typ: "Z2 Dauer"     },
  "2026-08-22": { name: "Z2 Lang W8",              typ: "Z2 Lang"      },
  // W9 VO2max
  "2026-08-25": { name: "Gruppenfahrt W9",         typ: "Gruppenfahrt" },
  "2026-08-27": { name: "VO2max 5×3 min W9",       typ: "VO2max"       },
  "2026-08-29": { name: "Z2 Lang W9",              typ: "Z2 Lang"      },
  // W10 VO2max
  "2026-09-01": { name: "Gruppenfahrt W10",        typ: "Gruppenfahrt" },
  "2026-09-03": { name: "VO2max 6×3 min W10",      typ: "VO2max"       },
  "2026-09-05": { name: "Z2 Lang W10",             typ: "Z2 Lang"      },
  // W11 VO2max
  "2026-09-08": { name: "Gruppenfahrt W11",        typ: "Gruppenfahrt" },
  "2026-09-10": { name: "VO2max 4×4 min W11",      typ: "VO2max"       },
  "2026-09-12": { name: "Z2 Lang W11",             typ: "Z2 Lang"      },
  // W12 Taper
  "2026-09-15": { name: "Gruppenfahrt W12",        typ: "Gruppenfahrt" },
  "2026-09-17": { name: "Aktivierung vor Test W12",typ: "Z1 Recovery"  },
  "2026-09-19": { name: "FTP Ramp Test W12",       typ: "FTP-Test"     },
};

function getPlan2WeekPhase(dateStr) {
  for (const s of PLAN2_SCHEDULE) {
    if (dateStr >= s.start && dateStr <= s.end) return { week: s.week, phase: s.phase };
  }
  return { week: null, phase: null };
}

// === subjective.json laden ===
function loadSubjective() {
  try {
    if (fs.existsSync(SUBJECTIVE_FILE)) {
      return JSON.parse(fs.readFileSync(SUBJECTIVE_FILE, "utf-8"));
    }
  } catch (e) {
    console.warn("⚠️  subjective.json nicht lesbar:", e.message);
  }
  return {};
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
  const planned = PLANNED_SESSIONS[date] || {};

  // Priorität: subjective.json > Trainingsplan-Mapping > intervals.icu/Strava
  return {
    name: s.name || planned.name || act.name || "Radfahren",
    date,
    week,
    phase,
    typ: s.typ || planned.typ || "Außerplanmäßig",
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
  let wellnessList = [];
  if (INTERVALS_KEY && INTERVALS_ATHLETE) {
    const oldest = PLAN2_SCHEDULE[0].start;
    const today = new Date().toISOString().split("T")[0];
    const newest = today > "2026-09-20" ? "2026-09-20" : today;

    // Wellness ab Plan-1-Start für Schlaf-Chart (Apple Health sync in intervals.icu)
    const PLAN1_START = "2026-03-24";
    const activities = await getIntervalsActivities(oldest, newest);
    const wellness = await getIntervalsWellness(PLAN1_START, newest);
    const subjective = loadSubjective();
    console.log(`📋 subjective.json: ${Object.keys(subjective).length} Einträge`);

    plan2 = activities.map(act => mapActivity(act, wellness, subjective));
    console.log(`✅ Plan 2: ${plan2.length} Rides aus intervals.icu`);

    // Wellness-Einträge als eigenständige Liste (für Schlaf-Chart)
    wellnessList = Object.entries(wellness)
      .filter(([, w]) => w.sleepSecs || w.avgSleepingHR)
      .map(([date, w]) => ({
        date,
        sleepHours: w.sleepSecs ? Math.round(w.sleepSecs / 360) / 10 : null,
        avgSleepingHR: w.avgSleepingHR || null,
        restingHR: w.restingHR || null,
        hrv: w.hrvSDNN || null,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
    console.log(`✅ Wellness: ${wellnessList.length} Tage mit Schlafdaten`);
  } else {
    console.log("ℹ️  Kein intervals.icu Key — Plan 2 wird übersprungen");
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
    wellness: wellnessList,
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

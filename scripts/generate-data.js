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
const ADJUSTMENTS_FILE = path.join(__dirname, "..", "data", "adjustments.json");

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
  // ── W0 Übergang ────────────────────────────────────────────────
  "2026-06-23": { name: "Gruppenfahrt",          typ: "Gruppenfahrt", week: "P2-W0", phase: "Übergang",   km: 70,  details: "Gruppenfahrt Di · HF frei · Spaß im Vordergrund" },
  "2026-06-25": { name: "Aktivierung W0",            typ: "Z1 Recovery",  week: "P2-W0", phase: "Übergang",   km: 30,  details: "Lockere Aktivierungsfahrt · HF <123 bpm" },
  "2026-06-27": { name: "Z2 Lang",               typ: "Z2 Lang",      week: "P2-W0", phase: "Übergang",   km: 70,  details: "Lange Z2 · HF 123–152 bpm · keine Intervalle" },

  // ── W1 Sweet Spot ───────────────────────────────────────────────
  "2026-06-29": { name: "Z2 Dauer",           typ: "Z2 Dauer",     week: "P2-W1", phase: "Sweet Spot", km: 25,  details: "Kurze Z2 · HF 123–152 bpm · Beine locker halten" },
  "2026-06-30": { name: "Gruppenfahrt",           typ: "Gruppenfahrt", week: "P2-W1", phase: "Sweet Spot", km: 70,  details: "Gruppenfahrt Di · HF frei" },
  "2026-07-02": { name: "Sweet Spot 3×10 min",       typ: "Sweet Spot",   week: "P2-W1", phase: "Sweet Spot", km: 55,
    workout: { warmup: 10, intervals: 3, duration: 10, rest: 3, cooldown: 8, zone: "SS", pct: [84, 97], watts: [162, 187], label: "3×10 min @ SS (84–97% FTP)" } },
  "2026-07-03": { name: "Z2 Kurz",            typ: "Z2 Dauer",     week: "P2-W1", phase: "Sweet Spot", km: 25,  details: "Kurze Z2 · HF 123–152 bpm · Erholung nach Intervallen" },
  "2026-07-04": { name: "Z2 Lang",               typ: "Z2 Lang",      week: "P2-W1", phase: "Sweet Spot", km: 80,  details: "Lange Z2 · HF 123–152 bpm · ≥3h anstreben" },

  // ── W2 Sweet Spot ───────────────────────────────────────────────
  "2026-07-06": { name: "Z2 Dauer",           typ: "Z2 Dauer",     week: "P2-W2", phase: "Sweet Spot", km: 25,  details: "Kurze Z2 · HF 123–152 bpm" },
  "2026-07-07": { name: "Gruppenfahrt",           typ: "Gruppenfahrt", week: "P2-W2", phase: "Sweet Spot", km: 70,  details: "Gruppenfahrt Di · HF frei" },
  "2026-07-09": { name: "Sweet Spot 3×12 min",       typ: "Sweet Spot",   week: "P2-W2", phase: "Sweet Spot", km: 58,
    workout: { warmup: 10, intervals: 3, duration: 12, rest: 3, cooldown: 8, zone: "SS", pct: [84, 97], watts: [162, 187], label: "3×12 min @ SS (84–97% FTP)" } },
  "2026-07-10": { name: "Z2 Kurz",           typ: "Z2 Dauer",     week: "P2-W2", phase: "Sweet Spot", km: 25,  details: "Kurze Z2 · HF 123–152 bpm · Erholung nach Intervallen" },
  "2026-07-11": { name: "Z2 Lang",               typ: "Z2 Lang",      week: "P2-W2", phase: "Sweet Spot", km: 85,  details: "Lange Z2 · HF 123–152 bpm" },

  // ── W3 Sweet Spot ───────────────────────────────────────────────
  "2026-07-13": { name: "Z2 Dauer",           typ: "Z2 Dauer",     week: "P2-W3", phase: "Sweet Spot", km: 30,  details: "Kurze Z2 · HF 123–152 bpm" },
  "2026-07-14": { name: "Gruppenfahrt",           typ: "Gruppenfahrt", week: "P2-W3", phase: "Sweet Spot", km: 70,  details: "Gruppenfahrt Di · HF frei" },
  "2026-07-16": { name: "Sweet Spot 2×20 min",       typ: "Sweet Spot",   week: "P2-W3", phase: "Sweet Spot", km: 62,
    workout: { warmup: 10, intervals: 2, duration: 20, rest: 5, cooldown: 8, zone: "SS", pct: [84, 97], watts: [162, 187], label: "2×20 min @ SS (84–97% FTP)" } },
  "2026-07-17": { name: "Z2 Kurz",           typ: "Z2 Dauer",     week: "P2-W3", phase: "Sweet Spot", km: 30,  details: "Kurze Z2 · HF 123–152 bpm · Erholung nach Intervallen" },
  "2026-07-18": { name: "Z2 Lang",               typ: "Z2 Lang",      week: "P2-W3", phase: "Sweet Spot", km: 90,  details: "Lange Z2 · HF 123–152 bpm" },

  // ── W4 Erholung ─────────────────────────────────────────────────
  "2026-07-20": { name: "Z2 Dauer",           typ: "Z2 Dauer",     week: "P2-W4", phase: "Erholung",   km: 20,  details: "Lockere Z2 · HF 123–145 bpm · sehr locker" },
  "2026-07-21": { name: "Recovery",         typ: "Z1 Recovery",  week: "P2-W4", phase: "Erholung",   km: 25,  details: "Recovery · HF <123 bpm · sehr locker" },
  "2026-07-23": { name: "Z2 Locker",             typ: "Z2 Dauer",     week: "P2-W4", phase: "Erholung",   km: 30,  details: "Lockere Z2 · kein Druck · −50% Volumen" },
  "2026-07-24": { name: "Z2 Kurz",           typ: "Z2 Dauer",     week: "P2-W4", phase: "Erholung",   km: 20,  details: "Lockere Z2 · HF 123–145 bpm" },
  "2026-07-25": { name: "Z2 Lang",               typ: "Z2 Lang",      week: "P2-W4", phase: "Erholung",   km: 60,  details: "Kurze Z2 Lang · Erholungswoche · −50% Volumen" },

  // ── W5 Schwelle ─────────────────────────────────────────────────
  "2026-07-27": { name: "Z2 Dauer",           typ: "Z2 Dauer",     week: "P2-W5", phase: "Schwelle",   km: 25,  details: "Kurze Z2 · HF 123–152 bpm" },
  "2026-07-28": { name: "Gruppenfahrt",           typ: "Gruppenfahrt", week: "P2-W5", phase: "Schwelle",   km: 70,  details: "Gruppenfahrt Di · HF frei" },
  "2026-07-30": { name: "Schwelle 3×8 min",          typ: "Schwelle",     week: "P2-W5", phase: "Schwelle",   km: 55,
    workout: { warmup: 10, intervals: 3, duration: 8,  rest: 3, cooldown: 8, zone: "T",  pct: [95, 105], watts: [183, 202], label: "3×8 min @ Schwelle (95–105% FTP)" } },
  "2026-07-31": { name: "Z2 Kurz",           typ: "Z2 Dauer",     week: "P2-W5", phase: "Schwelle",   km: 25,  details: "Kurze Z2 · HF 123–152 bpm · Erholung nach Intervallen" },
  "2026-08-01": { name: "Z2 Lang",               typ: "Z2 Lang",      week: "P2-W5", phase: "Schwelle",   km: 85,  details: "Lange Z2 · HF 123–152 bpm" },

  // ── W6 Schwelle ─────────────────────────────────────────────────
  "2026-08-03": { name: "Z2 Dauer",           typ: "Z2 Dauer",     week: "P2-W6", phase: "Schwelle",   km: 25,  details: "Kurze Z2 · HF 123–152 bpm" },
  "2026-08-04": { name: "Gruppenfahrt",           typ: "Gruppenfahrt", week: "P2-W6", phase: "Schwelle",   km: 70,  details: "Gruppenfahrt Di · HF frei" },
  "2026-08-06": { name: "Schwelle 3×10 min",         typ: "Schwelle",     week: "P2-W6", phase: "Schwelle",   km: 58,
    workout: { warmup: 10, intervals: 3, duration: 10, rest: 3, cooldown: 8, zone: "T",  pct: [95, 105], watts: [183, 202], label: "3×10 min @ Schwelle (95–105% FTP)" } },
  "2026-08-07": { name: "Z2 Kurz",           typ: "Z2 Dauer",     week: "P2-W6", phase: "Schwelle",   km: 25,  details: "Kurze Z2 · HF 123–152 bpm · Erholung nach Intervallen" },
  "2026-08-08": { name: "Z2 Lang",               typ: "Z2 Lang",      week: "P2-W6", phase: "Schwelle",   km: 90,  details: "Lange Z2 · HF 123–152 bpm" },

  // ── W7 Schwelle ─────────────────────────────────────────────────
  "2026-08-10": { name: "Z2 Dauer",           typ: "Z2 Dauer",     week: "P2-W7", phase: "Schwelle",   km: 30,  details: "Kurze Z2 · HF 123–152 bpm" },
  "2026-08-11": { name: "Gruppenfahrt",           typ: "Gruppenfahrt", week: "P2-W7", phase: "Schwelle",   km: 70,  details: "Gruppenfahrt Di · HF frei" },
  "2026-08-13": { name: "Schwelle 2×20 min",         typ: "Schwelle",     week: "P2-W7", phase: "Schwelle",   km: 65,
    workout: { warmup: 10, intervals: 2, duration: 20, rest: 5, cooldown: 8, zone: "T",  pct: [95, 105], watts: [183, 202], label: "2×20 min @ Schwelle (95–105% FTP)" } },
  "2026-08-14": { name: "Z2 Kurz",           typ: "Z2 Dauer",     week: "P2-W7", phase: "Schwelle",   km: 30,  details: "Kurze Z2 · HF 123–152 bpm · Erholung nach Intervallen" },
  "2026-08-15": { name: "Z2 Lang",               typ: "Z2 Lang",      week: "P2-W7", phase: "Schwelle",   km: 95,  details: "Lange Z2 · HF 123–152 bpm" },

  // ── W8 Erholung ─────────────────────────────────────────────────
  "2026-08-17": { name: "Z2 Dauer",           typ: "Z2 Dauer",     week: "P2-W8", phase: "Erholung",   km: 20,  details: "Lockere Z2 · HF 123–145 bpm" },
  "2026-08-18": { name: "Recovery",         typ: "Z1 Recovery",  week: "P2-W8", phase: "Erholung",   km: 25,  details: "Recovery · HF <123 bpm · sehr locker" },
  "2026-08-20": { name: "Z2 Locker",             typ: "Z2 Dauer",     week: "P2-W8", phase: "Erholung",   km: 30,  details: "Lockere Z2 · Erholungswoche" },
  "2026-08-21": { name: "Z2 Kurz",           typ: "Z2 Dauer",     week: "P2-W8", phase: "Erholung",   km: 20,  details: "Lockere Z2 · HF 123–145 bpm" },
  "2026-08-22": { name: "Z2 Lang",               typ: "Z2 Lang",      week: "P2-W8", phase: "Erholung",   km: 60,  details: "Kurze Z2 Lang · −50% Volumen" },

  // ── W9 VO2max ───────────────────────────────────────────────────
  "2026-08-24": { name: "Z2 Dauer",           typ: "Z2 Dauer",     week: "P2-W9", phase: "VO2max",     km: 25,  details: "Kurze Z2 · HF 123–152 bpm" },
  "2026-08-25": { name: "Gruppenfahrt",           typ: "Gruppenfahrt", week: "P2-W9", phase: "VO2max",     km: 70,  details: "Gruppenfahrt Di · HF frei" },
  "2026-08-27": { name: "VO₂max 5×3 min",           typ: "VO2max",       week: "P2-W9", phase: "VO2max",     km: 50,
    workout: { warmup: 10, intervals: 5, duration: 3,  rest: 4, cooldown: 8, zone: "V",  pct: [106, 120], watts: [205, 232], label: "5×3 min @ VO₂max (106–120% FTP)" } },
  "2026-08-28": { name: "Z2 Kurz",           typ: "Z2 Dauer",     week: "P2-W9", phase: "VO2max",     km: 25,  details: "Kurze Z2 · HF 123–152 bpm · Erholung nach Intervallen" },
  "2026-08-29": { name: "Z2 Lang",               typ: "Z2 Lang",      week: "P2-W9", phase: "VO2max",     km: 85,  details: "Lange Z2 · HF 123–152 bpm" },

  // ── W10 VO2max ──────────────────────────────────────────────────
  "2026-08-31": { name: "Z2 Dauer",          typ: "Z2 Dauer",     week: "P2-W10", phase: "VO2max",    km: 25,  details: "Kurze Z2 · HF 123–152 bpm" },
  "2026-09-01": { name: "Gruppenfahrt",          typ: "Gruppenfahrt", week: "P2-W10", phase: "VO2max",    km: 70,  details: "Gruppenfahrt Di · HF frei" },
  "2026-09-03": { name: "VO₂max 6×3 min",           typ: "VO2max",       week: "P2-W10", phase: "VO2max",    km: 52,
    workout: { warmup: 10, intervals: 6, duration: 3,  rest: 4, cooldown: 8, zone: "V",  pct: [106, 120], watts: [205, 232], label: "6×3 min @ VO₂max (106–120% FTP)" } },
  "2026-09-04": { name: "Z2 Kurz",          typ: "Z2 Dauer",     week: "P2-W10", phase: "VO2max",    km: 25,  details: "Kurze Z2 · HF 123–152 bpm · Erholung nach Intervallen" },
  "2026-09-05": { name: "Z2 Lang",              typ: "Z2 Lang",      week: "P2-W10", phase: "VO2max",    km: 90,  details: "Lange Z2 · HF 123–152 bpm" },

  // ── W11 VO2max ──────────────────────────────────────────────────
  "2026-09-07": { name: "Z2 Dauer",          typ: "Z2 Dauer",     week: "P2-W11", phase: "VO2max",    km: 25,  details: "Kurze Z2 · HF 123–152 bpm" },
  "2026-09-08": { name: "Gruppenfahrt",          typ: "Gruppenfahrt", week: "P2-W11", phase: "VO2max",    km: 70,  details: "Gruppenfahrt Di · HF frei" },
  "2026-09-10": { name: "VO₂max 4×4 min",           typ: "VO2max",       week: "P2-W11", phase: "VO2max",    km: 52,
    workout: { warmup: 10, intervals: 4, duration: 4,  rest: 4, cooldown: 8, zone: "V",  pct: [106, 120], watts: [205, 232], label: "4×4 min @ VO₂max (106–120% FTP)" } },
  "2026-09-11": { name: "Z2 Kurz",          typ: "Z2 Dauer",     week: "P2-W11", phase: "VO2max",    km: 25,  details: "Kurze Z2 · HF 123–152 bpm · Erholung nach Intervallen" },
  "2026-09-12": { name: "Z2 Lang",              typ: "Z2 Lang",      week: "P2-W11", phase: "VO2max",    km: 90,  details: "Lange Z2 · HF 123–152 bpm" },

  // ── W12 Taper ───────────────────────────────────────────────────
  "2026-09-14": { name: "Z2 Dauer",          typ: "Z2 Dauer",     week: "P2-W12", phase: "Taper",     km: 20,  details: "Kurze lockere Z2 · Taper · Beine frisch halten" },
  "2026-09-15": { name: "Gruppenfahrt",          typ: "Gruppenfahrt", week: "P2-W12", phase: "Taper",     km: 60,  details: "Letzte Gruppenfahrt · locker bleiben" },
  "2026-09-17": { name: "Aktivierung vor Test",      typ: "Z1 Recovery",  week: "P2-W12", phase: "Taper",     km: 30,  details: "Kurze Aktivierung · Beine locker halten vor Ramp Test" },
  "2026-09-19": { name: "FTP Ramp Test",             typ: "FTP-Test",     week: "P2-W12", phase: "Taper",     km: 25,
    workout: { warmup: 10, intervals: null, duration: null, rest: null, cooldown: 5, zone: "RAMP", pct: null, watts: null, label: "FTP Ramp Test · alle 1 min +20W bis zum Abbruch" } },
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

// === adjustments.json laden ===
function loadAdjustments() {
  try {
    if (fs.existsSync(ADJUSTMENTS_FILE)) {
      return JSON.parse(fs.readFileSync(ADJUSTMENTS_FILE, "utf-8"));
    }
  } catch (e) {
    console.warn("⚠️  adjustments.json nicht lesbar:", e.message);
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
        wetter: null, notionWetter: getRichText(pr["Wetter"]), notizen,
      };
    });
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

async function getIntervalsPowerCurves(oldest, newest) {
  console.log(`🔄 intervals.icu Power Curves (${oldest} bis ${newest})...`);
  const data = await intervalsGet(
    `/athlete/${INTERVALS_ATHLETE}/power-curves?oldest=${oldest}&newest=${newest}&type=Ride`
  );
  if (!data) return null;
  console.log(`   ... Power Curve geladen`);
  return data;
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

// === Typ-Berechnung aus NP/FTP wenn kein Plan-Match ===
const FTP = 193; // wird aktualisiert wenn neuer Ramp-Test

// === Open-Meteo Wetter-Integration ===
const WEATHER_LAT = 51.5253; // Senftenberg
const WEATHER_LON = 14.0016;

async function getHistoricalWeather(startDate, endDate) {
  console.log(`🌤️  Open-Meteo Wetter (${startDate} bis ${endDate})...`);
  const params = [
    `latitude=${WEATHER_LAT}`, `longitude=${WEATHER_LON}`,
    `start_date=${startDate}`, `end_date=${endDate}`,
    `hourly=temperature_2m,apparent_temperature,relative_humidity_2m,` +
      `wind_speed_10m,wind_direction_10m,precipitation,cloud_cover,weather_code`,
    `timezone=Europe/Berlin`,
  ].join("&");

  try {
    const res = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params}`);
    if (!res.ok) {
      console.warn(`⚠️  Open-Meteo Archive (${res.status}): ${await res.text()}`);
      return null;
    }
    const data = await res.json();
    console.log(`   ... ${data.hourly?.time?.length || 0} Stundenwerte geladen`);
    return data;
  } catch (e) {
    console.warn(`⚠️  Open-Meteo Fehler:`, e.message);
    return null;
  }
}

async function getRecentWeather() {
  // Forecast-API liefert auch vergangene Stunden der letzten Tage (kein Delay wie Archive)
  console.log(`🌤️  Open-Meteo Forecast (letzte 2 Tage)...`);
  const params = [
    `latitude=${WEATHER_LAT}`, `longitude=${WEATHER_LON}`,
    `past_days=3`,
    `forecast_days=1`,
    `hourly=temperature_2m,apparent_temperature,relative_humidity_2m,` +
      `wind_speed_10m,wind_direction_10m,precipitation,cloud_cover,weather_code`,
    `timezone=Europe/Berlin`,
  ].join("&");

  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!res.ok) {
      console.warn(`⚠️  Open-Meteo Forecast (${res.status}): ${await res.text()}`);
      return null;
    }
    const data = await res.json();
    console.log(`   ... ${data.hourly?.time?.length || 0} Forecast-Stundenwerte geladen`);
    return data;
  } catch (e) {
    console.warn(`⚠️  Open-Meteo Forecast Fehler:`, e.message);
    return null;
  }
}

/**
 * Baut eine Map: "YYYY-MM-DDTHH:00" → { temp, tempFeel, humidity, windSpeed, windDir, precip, cloudCover, weatherCode }
 */
function buildWeatherMap(data) {
  if (!data?.hourly?.time) return {};
  const map = {};
  const h = data.hourly;
  for (let i = 0; i < h.time.length; i++) {
    map[h.time[i]] = {
      temp: h.temperature_2m[i],
      tempFeel: h.apparent_temperature[i],
      humidity: h.relative_humidity_2m[i],
      windSpeed: h.wind_speed_10m[i],
      windDir: h.wind_direction_10m[i],
      precip: h.precipitation[i],
      cloudCover: h.cloud_cover[i],
      weatherCode: h.weather_code[i],
    };
  }
  return map;
}

/**
 * Mittelt Wetter über das Zeitfenster einer Fahrt.
 * @param {Object} weatherMap - Stündliche Wetterdaten
 * @param {string} date - ISO-Datum (YYYY-MM-DD)
 * @param {number|null} startHour - Startstunde (0-23), null → 09:00 (Fallback für Plan 1)
 * @param {number} durationMin - Fahrtdauer in Minuten
 */
function getWeatherForRide(weatherMap, date, startHour, durationMin) {
  const sH = startHour != null ? startHour : 9;
  const hours = Math.max(1, Math.ceil((durationMin || 120) / 60));
  const endH = Math.min(23, sH + hours);

  const vals = { temp: [], tempFeel: [], humidity: [], windSpeed: [], windDir: [], precip: [], cloudCover: [], weatherCode: [] };

  for (let h = sH; h <= endH; h++) {
    const key = `${date}T${String(h).padStart(2, "0")}:00`;
    const w = weatherMap[key];
    if (!w) continue;
    for (const k of Object.keys(vals)) {
      if (w[k] != null) vals[k].push(w[k]);
    }
  }

  if (!vals.temp.length) return null;

  const mean = arr => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10;

  return {
    temp: mean(vals.temp),
    tempFeel: mean(vals.tempFeel),
    humidity: Math.round(mean(vals.humidity)),
    windSpeed: mean(vals.windSpeed),
    windDir: Math.round(mean(vals.windDir)),
    precip: Math.round(vals.precip.reduce((a, b) => a + b, 0) * 10) / 10,
    cloudCover: Math.round(mean(vals.cloudCover)),
    weatherCode: Math.max(...vals.weatherCode), // schlechteste Bedingung
  };
}

function inferTypFromIF(np, min) {
  if (!np || !FTP) return "Außerplanmäßig";
  const ifVal = np / FTP;
  // Kurze Fahrten (<30 min) mit hohem IF = Intervall/Test
  if (min < 30 && ifVal > 0.95) return "FTP-Test";
  if (ifVal < 0.75)              return "Z1 Recovery";
  if (ifVal < 0.85)              return "Z2 Dauer";
  if (ifVal < 0.90)              return "Tempo";
  if (ifVal < 0.95)              return "Sweet Spot";
  if (ifVal < 1.05)              return "Schwelle";
  return "VO2max";
}

// === intervals.icu Activity → Ride-Objekt ===
function mapActivity(act, wellness, subjective, weatherMap) {
  const date = act.start_date_local.split("T")[0];
  const { week, phase } = getPlan2WeekPhase(date);
  const w = wellness[date] || {};
  const s = subjective[date] || {};
  const planned = PLANNED_SESSIONS[date] || {};

  const np  = act.icu_weighted_avg_watts;
  const min = Math.round((act.moving_time || 0) / 60);

  // Priorität: 1) subjective.json  2) Trainingsplan  3) IF-Berechnung
  const typ = s.typ || planned.typ || inferTypFromIF(np, min);
  const name = s.name || planned.name || act.name || "Radfahren";

  // Wetter: exakte Startzeit aus intervals.icu
  const startHour = act.start_date_local
    ? parseInt(act.start_date_local.split("T")[1]?.split(":")[0])
    : null;
  const weather = getWeatherForRide(weatherMap, date, startHour, min);

  return {
    name,
    date,
    week,
    phase,
    typ,
    plan: "Plan 2",
    km: Math.round((act.distance || 0) / 100) / 10,
    min,
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
    weather,
    wetter: weather ? `${weather.temp}°C` : (act.average_temp ? `~${Math.round(act.average_temp)}°C` : null),
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
  let athleteWeight = null;
  let powerCurves = null;

  // 2a. Wetter: Open-Meteo für gesamten Zeitraum (unabhängig von intervals.icu)
  const PLAN1_START = "2026-03-24";
  const PLAN1_FIRST_DATE = plan1.length > 0 ? plan1[0].date : PLAN1_START;
  const weatherEndDate = new Date();
  weatherEndDate.setDate(weatherEndDate.getDate() - 2); // Archive hat ~2 Tage Verzögerung
  const weatherEnd = weatherEndDate.toISOString().split("T")[0];
  const weatherData = await getHistoricalWeather(PLAN1_FIRST_DATE, weatherEnd);
  const weatherMap = buildWeatherMap(weatherData);
  // Forecast-API für die letzten 2 Tage (überbrückt Archive-Delay)
  const recentData = await getRecentWeather();
  const recentMap = buildWeatherMap(recentData);
  Object.assign(weatherMap, recentMap); // recentMap überschreibt ggf. ältere Archive-Werte

  // 2b. Plan 2: intervals.icu + Notion subjektiv
  if (INTERVALS_KEY && INTERVALS_ATHLETE) {
    const oldest = PLAN2_SCHEDULE[0].start;
    const today = new Date().toISOString().split("T")[0];
    const newest = today > "2026-09-20" ? "2026-09-20" : today;

    const activities = await getIntervalsActivities(oldest, newest);
    const wellness = await getIntervalsWellness(PLAN1_START, newest);
    powerCurves = await getIntervalsPowerCurves(PLAN1_START, newest);
    const subjective = loadSubjective();
    const adjustments = loadAdjustments();
    console.log(`📋 subjective.json: ${Object.keys(subjective).length} Einträge`);
    console.log(`📋 adjustments.json: ${Object.keys(adjustments).length} Anpassungen`);

    plan2 = activities.map(act => mapActivity(act, wellness, subjective, weatherMap));
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
    // Letztes bekanntes Gewicht aus Wellness (Apple Health → intervals.icu)
    const weightEntries = Object.entries(wellness)
      .filter(([, w]) => w.weight && w.weight > 0)
      .sort((a, b) => b[0].localeCompare(a[0])); // neuestes zuerst
    if (weightEntries.length > 0) {
      athleteWeight = Math.round(weightEntries[0][1].weight * 10) / 10;
      console.log(`✅ Gewicht: ${athleteWeight} kg (Stand: ${weightEntries[0][0]})`);
    } else {
      console.log("⚠️  Kein Gewicht in Wellness-Daten gefunden");
    }

    console.log(`✅ Wellness: ${wellnessList.length} Tage mit Schlafdaten`);
  } else {
    console.log("ℹ️  Kein intervals.icu Key — Plan 2 wird übersprungen");
  }

  // 3. Wetter: Open-Meteo für ALLE Fahrten (Plan 1 + Plan 2)
  // Plan 1 Rides bekommen nachträglich Wetter zugewiesen (Tageszeitfenster 09–17 Uhr)
  if (Object.keys(weatherMap).length > 0) {
    let weatherAdded = 0;
    for (const r of plan1) {
      if (!r.date) continue;
      const w = getWeatherForRide(weatherMap, r.date, 9, r.min || 120);
      if (w) {
        r.weather = w;
        r.wetter = `${w.temp}°C`;
        weatherAdded++;
      } else {
        // Fallback: Notion-Freitext wenn kein Open-Meteo-Wert
        r.wetter = r.notionWetter || null;
      }
      delete r.notionWetter;
    }
    console.log(`✅ Wetter: ${weatherAdded} Plan-1-Fahrten + ${plan2.filter(r => r.weather).length} Plan-2-Fahrten`);
  }

  // 4. Zusammenführen
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
    powerCurves: powerCurves || null,
    athleteWeight,
    plannedSessions: Object.entries(PLANNED_SESSIONS).map(([date, s]) => ({ date, ...s })),
    adjustments: loadAdjustments(),
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

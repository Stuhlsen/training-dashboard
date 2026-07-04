/* ============================================================
   SCRIPTS/LIB/PLAN2.JS — Plan-2-Struktur (Wochen, Phasen,
   geplante Sessions). Reine Daten + Datums-Mapping, kein I/O.
   ============================================================ */

// === Plan 2 Woche/Phase-Mapping (datumsbasiert) ===
export const PLAN2_SCHEDULE = [
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
export const PLANNED_SESSIONS = {
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

export function getPlan2WeekPhase(dateStr) {
  for (const s of PLAN2_SCHEDULE) {
    if (dateStr >= s.start && dateStr <= s.end) return { week: s.week, phase: s.phase };
  }
  return { week: null, phase: null };
}

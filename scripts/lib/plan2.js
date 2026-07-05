/* ============================================================
   SCRIPTS/LIB/PLAN2.JS — Plan-2-Struktur (Wochen, Phasen,
   geplante Sessions). Reine Daten + Datums-Mapping, kein I/O.

   Ausrichtung ab W2 (Revision 2026-07-06): klarer Fokus auf
   Leistungsaufbau (FTP 193 → ≥210 W). Wochen-Architektur:
     Mo  lockere Z2      · OPTIONAL (fällt zuerst raus)
     Di  Gruppenfahrt    · ~65 km, variabel
     Mi  Ruhetag
     Do  Intervalle      · phasenspezifischer Schlüsselreiz
     Fr  Recovery-Spin   · OPTIONAL (fällt zuerst raus)
     Sa  Sweet-Spot-Ausdauerfahrt · zweite Qualitätseinheit
     So  Ruhetag
   Zwei strukturierte Qualitätstage (Do + Sa) mit Ruhe/Locker
   dazwischen; Mo/Fr sind die Stoßdämpfer bei müden Beinen.
   W0/W1 stehen als abgeschlossene Historie unverändert.
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
// Ab W2: Mo/Fr = optionale Recovery (bei müden Beinen streichen),
// Di = Gruppenfahrt ~65 km, Do = Intervalle, Sa = Sweet-Spot-Ausdauerfahrt.
// SS-Watts bei FTP 193: 84–97 % = 162–187 W.
export const PLANNED_SESSIONS = {
  // ── W0 Übergang (Historie, unverändert) ─────────────────────────
  "2026-06-23": { name: "Gruppenfahrt",          typ: "Gruppenfahrt", week: "P2-W0", phase: "Übergang",   km: 70,  details: "Gruppenfahrt Di · HF frei · Spaß im Vordergrund" },
  "2026-06-25": { name: "Aktivierung W0",            typ: "Z1 Recovery",  week: "P2-W0", phase: "Übergang",   km: 30,  details: "Lockere Aktivierungsfahrt · HF <123 bpm" },
  "2026-06-27": { name: "Z2 Lang",               typ: "Z2 Lang",      week: "P2-W0", phase: "Übergang",   km: 70,  details: "Lange Z2 · HF 123–152 bpm · keine Intervalle" },

  // ── W1 Sweet Spot (Historie, unverändert) ───────────────────────
  "2026-06-29": { name: "Z2 Dauer",           typ: "Z2 Dauer",     week: "P2-W1", phase: "Sweet Spot", km: 25,  details: "Kurze Z2 · HF 123–152 bpm · Beine locker halten" },
  "2026-06-30": { name: "Gruppenfahrt",           typ: "Gruppenfahrt", week: "P2-W1", phase: "Sweet Spot", km: 70,  details: "Gruppenfahrt Di · HF frei" },
  "2026-07-02": { name: "Sweet Spot 3×10 min",       typ: "Sweet Spot",   week: "P2-W1", phase: "Sweet Spot", km: 55,
    workout: { warmup: 10, intervals: 3, duration: 10, rest: 3, cooldown: 8, zone: "SS", pct: [84, 97], watts: [162, 187], label: "3×10 min @ SS (84–97% FTP)" } },
  "2026-07-03": { name: "Z2 Kurz",            typ: "Z2 Dauer",     week: "P2-W1", phase: "Sweet Spot", km: 25,  details: "Kurze Z2 · HF 123–152 bpm · Erholung nach Intervallen" },
  "2026-07-04": { name: "Z2 Lang",               typ: "Z2 Lang",      week: "P2-W1", phase: "Sweet Spot", km: 80,  details: "Lange Z2 · HF 123–152 bpm · ≥3h anstreben" },

  // ── W2 Sweet Spot ───────────────────────────────────────────────
  "2026-07-06": { name: "Z2 Locker",          typ: "Z2 Dauer",     week: "P2-W2", phase: "Sweet Spot", km: 25,  details: "Lockere Z2 · HF <145 bpm · optional (bei müden Beinen streichen)" },
  "2026-07-07": { name: "Gruppenfahrt",           typ: "Gruppenfahrt", week: "P2-W2", phase: "Sweet Spot", km: 65,  details: "Gruppenfahrt Di · ~60–70 km · HF frei" },
  "2026-07-09": { name: "Sweet Spot 3×12 min",       typ: "Sweet Spot",   week: "P2-W2", phase: "Sweet Spot", km: 58,
    workout: { warmup: 10, intervals: 3, duration: 12, rest: 3, cooldown: 8, zone: "SS", pct: [84, 97], watts: [162, 187], label: "3×12 min @ SS (84–97% FTP)" } },
  "2026-07-10": { name: "Recovery",         typ: "Z1 Recovery",  week: "P2-W2", phase: "Sweet Spot", km: 25,  details: "Recovery-Spin nach Intervallen · HF <123 bpm · optional (bei müden Beinen streichen)" },
  "2026-07-11": { name: "SS-Ausdauer 3×15 min",      typ: "Sweet Spot",   week: "P2-W2", phase: "Sweet Spot", km: 80,
    workout: { warmup: 45, intervals: 3, duration: 15, rest: 5, cooldown: 50, zone: "SS", pct: [84, 97], watts: [162, 187], label: "3×15 min @ SS (84–97% FTP) im Ausdauerrahmen" },
    details: "Lange Z2-Ausfahrt mit 3×15 min Sweet Spot · zweite Qualitätseinheit der Woche" },

  // ── W3 Sweet Spot ───────────────────────────────────────────────
  "2026-07-13": { name: "Z2 Locker",          typ: "Z2 Dauer",     week: "P2-W3", phase: "Sweet Spot", km: 25,  details: "Lockere Z2 · HF <145 bpm · optional (bei müden Beinen streichen)" },
  "2026-07-14": { name: "Gruppenfahrt",           typ: "Gruppenfahrt", week: "P2-W3", phase: "Sweet Spot", km: 65,  details: "Gruppenfahrt Di · ~60–70 km · HF frei" },
  "2026-07-16": { name: "Sweet Spot 2×20 min",       typ: "Sweet Spot",   week: "P2-W3", phase: "Sweet Spot", km: 62,
    workout: { warmup: 10, intervals: 2, duration: 20, rest: 5, cooldown: 8, zone: "SS", pct: [84, 97], watts: [162, 187], label: "2×20 min @ SS (84–97% FTP)" } },
  "2026-07-17": { name: "Recovery",         typ: "Z1 Recovery",  week: "P2-W3", phase: "Sweet Spot", km: 25,  details: "Recovery-Spin nach Intervallen · HF <123 bpm · optional (bei müden Beinen streichen)" },
  "2026-07-18": { name: "SS-Ausdauer 2×25 min",      typ: "Sweet Spot",   week: "P2-W3", phase: "Sweet Spot", km: 85,
    workout: { warmup: 45, intervals: 2, duration: 25, rest: 8, cooldown: 55, zone: "SS", pct: [84, 97], watts: [162, 187], label: "2×25 min @ SS (84–97% FTP) im Ausdauerrahmen" },
    details: "Lange Z2-Ausfahrt mit 2×25 min Sweet Spot · zweite Qualitätseinheit der Woche" },

  // ── W4 Erholung ─────────────────────────────────────────────────
  "2026-07-20": { name: "Z2 Dauer",           typ: "Z2 Dauer",     week: "P2-W4", phase: "Erholung",   km: 20,  details: "Lockere Z2 · HF 123–145 bpm · optional (Erholungswoche)" },
  "2026-07-21": { name: "Recovery",         typ: "Z1 Recovery",  week: "P2-W4", phase: "Erholung",   km: 25,  details: "Recovery · HF <123 bpm · sehr locker" },
  "2026-07-23": { name: "Z2 Locker",             typ: "Z2 Dauer",     week: "P2-W4", phase: "Erholung",   km: 30,  details: "Lockere Z2 · kein Druck · −50% Volumen" },
  "2026-07-24": { name: "Recovery",           typ: "Z1 Recovery",  week: "P2-W4", phase: "Erholung",   km: 20,  details: "Recovery · HF <123 bpm · optional (Erholungswoche)" },
  "2026-07-25": { name: "Z2 Lang",               typ: "Z2 Lang",      week: "P2-W4", phase: "Erholung",   km: 60,  details: "Kurze Z2 Lang · Erholungswoche · −50% Volumen · keine Intervalle" },

  // ── W5 Schwelle ─────────────────────────────────────────────────
  "2026-07-27": { name: "Z2 Locker",          typ: "Z2 Dauer",     week: "P2-W5", phase: "Schwelle",   km: 25,  details: "Lockere Z2 · HF <145 bpm · optional (bei müden Beinen streichen)" },
  "2026-07-28": { name: "Gruppenfahrt",           typ: "Gruppenfahrt", week: "P2-W5", phase: "Schwelle",   km: 65,  details: "Gruppenfahrt Di · ~60–70 km · HF frei" },
  "2026-07-30": { name: "Schwelle 3×8 min",          typ: "Schwelle",     week: "P2-W5", phase: "Schwelle",   km: 55,
    workout: { warmup: 10, intervals: 3, duration: 8,  rest: 3, cooldown: 8, zone: "T",  pct: [95, 105], watts: [183, 202], label: "3×8 min @ Schwelle (95–105% FTP)" } },
  "2026-07-31": { name: "Recovery",         typ: "Z1 Recovery",  week: "P2-W5", phase: "Schwelle",   km: 25,  details: "Recovery-Spin nach Intervallen · HF <123 bpm · optional (bei müden Beinen streichen)" },
  "2026-08-01": { name: "SS-Durability 3×15 min",    typ: "Sweet Spot",   week: "P2-W5", phase: "Schwelle",   km: 82,
    workout: { warmup: 80, intervals: 3, duration: 15, rest: 5, cooldown: 30, zone: "SS", pct: [84, 97], watts: [162, 187], label: "3×15 min @ SS (84–97% FTP) spät in der Fahrt" },
    details: "Lange Z2-Ausfahrt · SS-Blöcke im hinteren Drittel (Durability/Ermüdungsresistenz) · unter Do-Intensität" },

  // ── W6 Schwelle ─────────────────────────────────────────────────
  "2026-08-03": { name: "Z2 Locker",          typ: "Z2 Dauer",     week: "P2-W6", phase: "Schwelle",   km: 25,  details: "Lockere Z2 · HF <145 bpm · optional (bei müden Beinen streichen)" },
  "2026-08-04": { name: "Gruppenfahrt",           typ: "Gruppenfahrt", week: "P2-W6", phase: "Schwelle",   km: 65,  details: "Gruppenfahrt Di · ~60–70 km · HF frei" },
  "2026-08-06": { name: "Schwelle 3×10 min",         typ: "Schwelle",     week: "P2-W6", phase: "Schwelle",   km: 58,
    workout: { warmup: 10, intervals: 3, duration: 10, rest: 3, cooldown: 8, zone: "T",  pct: [95, 105], watts: [183, 202], label: "3×10 min @ Schwelle (95–105% FTP)" } },
  "2026-08-07": { name: "Recovery",         typ: "Z1 Recovery",  week: "P2-W6", phase: "Schwelle",   km: 25,  details: "Recovery-Spin nach Intervallen · HF <123 bpm · optional (bei müden Beinen streichen)" },
  "2026-08-08": { name: "SS-Durability 2×20 min",    typ: "Sweet Spot",   week: "P2-W6", phase: "Schwelle",   km: 85,
    workout: { warmup: 85, intervals: 2, duration: 20, rest: 8, cooldown: 30, zone: "SS", pct: [84, 97], watts: [162, 187], label: "2×20 min @ SS (84–97% FTP) spät in der Fahrt" },
    details: "Lange Z2-Ausfahrt · SS-Blöcke im hinteren Drittel (Durability) · unter Do-Intensität" },

  // ── W7 Schwelle ─────────────────────────────────────────────────
  "2026-08-10": { name: "Z2 Locker",          typ: "Z2 Dauer",     week: "P2-W7", phase: "Schwelle",   km: 25,  details: "Lockere Z2 · HF <145 bpm · optional (bei müden Beinen streichen)" },
  "2026-08-11": { name: "Gruppenfahrt",           typ: "Gruppenfahrt", week: "P2-W7", phase: "Schwelle",   km: 65,  details: "Gruppenfahrt Di · ~60–70 km · HF frei" },
  "2026-08-13": { name: "Schwelle 2×20 min",         typ: "Schwelle",     week: "P2-W7", phase: "Schwelle",   km: 65,
    workout: { warmup: 10, intervals: 2, duration: 20, rest: 5, cooldown: 8, zone: "T",  pct: [95, 105], watts: [183, 202], label: "2×20 min @ Schwelle (95–105% FTP)" } },
  "2026-08-14": { name: "Recovery",         typ: "Z1 Recovery",  week: "P2-W7", phase: "Schwelle",   km: 25,  details: "Recovery-Spin nach Intervallen · HF <123 bpm · optional (bei müden Beinen streichen)" },
  "2026-08-15": { name: "SS-Durability 3×20 min",    typ: "Sweet Spot",   week: "P2-W7", phase: "Schwelle",   km: 92,
    workout: { warmup: 80, intervals: 3, duration: 20, rest: 8, cooldown: 25, zone: "SS", pct: [84, 97], watts: [162, 187], label: "3×20 min @ SS (84–97% FTP) spät in der Fahrt" },
    details: "Längste Ausfahrt des Blocks · 60 min SS im hinteren Drittel (Durability-Peak) · unter Do-Intensität" },

  // ── W8 Erholung ─────────────────────────────────────────────────
  "2026-08-17": { name: "Z2 Dauer",           typ: "Z2 Dauer",     week: "P2-W8", phase: "Erholung",   km: 20,  details: "Lockere Z2 · HF 123–145 bpm · optional (Erholungswoche)" },
  "2026-08-18": { name: "Recovery",         typ: "Z1 Recovery",  week: "P2-W8", phase: "Erholung",   km: 25,  details: "Recovery · HF <123 bpm · sehr locker" },
  "2026-08-20": { name: "Z2 Locker",             typ: "Z2 Dauer",     week: "P2-W8", phase: "Erholung",   km: 30,  details: "Lockere Z2 · Erholungswoche · −50% Volumen" },
  "2026-08-21": { name: "Recovery",           typ: "Z1 Recovery",  week: "P2-W8", phase: "Erholung",   km: 20,  details: "Recovery · HF <123 bpm · optional (Erholungswoche)" },
  "2026-08-22": { name: "Z2 Lang",               typ: "Z2 Lang",      week: "P2-W8", phase: "Erholung",   km: 60,  details: "Kurze Z2 Lang · −50% Volumen · keine Intervalle" },

  // ── W9 VO2max ───────────────────────────────────────────────────
  "2026-08-24": { name: "Z2 Locker",          typ: "Z2 Dauer",     week: "P2-W9", phase: "VO2max",     km: 25,  details: "Lockere Z2 · HF <145 bpm · optional (bei müden Beinen streichen)" },
  "2026-08-25": { name: "Gruppenfahrt",           typ: "Gruppenfahrt", week: "P2-W9", phase: "VO2max",     km: 65,  details: "Gruppenfahrt Di · ~60–70 km · HF frei" },
  "2026-08-27": { name: "VO₂max 5×3 min",           typ: "VO2max",       week: "P2-W9", phase: "VO2max",     km: 50,
    workout: { warmup: 10, intervals: 5, duration: 3,  rest: 4, cooldown: 8, zone: "V",  pct: [106, 120], watts: [205, 232], label: "5×3 min @ VO₂max (106–120% FTP)" } },
  "2026-08-28": { name: "Recovery",         typ: "Z1 Recovery",  week: "P2-W9", phase: "VO2max",     km: 25,  details: "Recovery-Spin nach Intervallen · HF <123 bpm · optional (bei müden Beinen streichen)" },
  "2026-08-29": { name: "SS-Erhaltung 2×20 min",     typ: "Sweet Spot",   week: "P2-W9", phase: "VO2max",     km: 80,
    workout: { warmup: 45, intervals: 2, duration: 20, rest: 8, cooldown: 47, zone: "SS", pct: [84, 97], watts: [162, 187], label: "2×20 min @ SS (84–97% FTP) im Ausdauerrahmen" },
    details: "Lange Z2-Ausfahrt · hält die FTP-Basis warm, während Do den VO₂max-Reiz setzt · kein zweiter Top-End-Tag" },

  // ── W10 VO2max ──────────────────────────────────────────────────
  "2026-08-31": { name: "Z2 Locker",         typ: "Z2 Dauer",     week: "P2-W10", phase: "VO2max",    km: 25,  details: "Lockere Z2 · HF <145 bpm · optional (bei müden Beinen streichen)" },
  "2026-09-01": { name: "Gruppenfahrt",          typ: "Gruppenfahrt", week: "P2-W10", phase: "VO2max",    km: 65,  details: "Gruppenfahrt Di · ~60–70 km · HF frei" },
  "2026-09-03": { name: "VO₂max 6×3 min",           typ: "VO2max",       week: "P2-W10", phase: "VO2max",    km: 52,
    workout: { warmup: 10, intervals: 6, duration: 3,  rest: 4, cooldown: 8, zone: "V",  pct: [106, 120], watts: [205, 232], label: "6×3 min @ VO₂max (106–120% FTP)" } },
  "2026-09-04": { name: "Recovery",         typ: "Z1 Recovery",  week: "P2-W10", phase: "VO2max",    km: 25,  details: "Recovery-Spin nach Intervallen · HF <123 bpm · optional (bei müden Beinen streichen)" },
  "2026-09-05": { name: "SS-Erhaltung 3×15 min",     typ: "Sweet Spot",   week: "P2-W10", phase: "VO2max",    km: 85,
    workout: { warmup: 45, intervals: 3, duration: 15, rest: 5, cooldown: 45, zone: "SS", pct: [84, 97], watts: [162, 187], label: "3×15 min @ SS (84–97% FTP) im Ausdauerrahmen" },
    details: "Lange Z2-Ausfahrt · hält die FTP-Basis warm, während Do den VO₂max-Reiz setzt · kein zweiter Top-End-Tag" },

  // ── W11 VO2max ──────────────────────────────────────────────────
  "2026-09-07": { name: "Z2 Locker",         typ: "Z2 Dauer",     week: "P2-W11", phase: "VO2max",    km: 25,  details: "Lockere Z2 · HF <145 bpm · optional (bei müden Beinen streichen)" },
  "2026-09-08": { name: "Gruppenfahrt",          typ: "Gruppenfahrt", week: "P2-W11", phase: "VO2max",    km: 65,  details: "Gruppenfahrt Di · ~60–70 km · HF frei" },
  "2026-09-10": { name: "VO₂max 4×4 min",           typ: "VO2max",       week: "P2-W11", phase: "VO2max",    km: 52,
    workout: { warmup: 10, intervals: 4, duration: 4,  rest: 4, cooldown: 8, zone: "V",  pct: [106, 120], watts: [205, 232], label: "4×4 min @ VO₂max (106–120% FTP)" } },
  "2026-09-11": { name: "Recovery",         typ: "Z1 Recovery",  week: "P2-W11", phase: "VO2max",    km: 25,  details: "Recovery-Spin nach Intervallen · HF <123 bpm · optional (bei müden Beinen streichen)" },
  "2026-09-12": { name: "SS-Erhaltung 2×20 min",     typ: "Sweet Spot",   week: "P2-W11", phase: "VO2max",    km: 82,
    workout: { warmup: 45, intervals: 2, duration: 20, rest: 8, cooldown: 45, zone: "SS", pct: [84, 97], watts: [162, 187], label: "2×20 min @ SS (84–97% FTP) im Ausdauerrahmen" },
    details: "Letzte Ausdauer-Qualität vor dem Taper · hält die FTP-Basis warm · kein zweiter Top-End-Tag" },

  // ── W12 Taper ───────────────────────────────────────────────────
  "2026-09-14": { name: "Z2 Locker",         typ: "Z2 Dauer",     week: "P2-W12", phase: "Taper",     km: 20,  details: "Kurze lockere Z2 · Taper · Beine frisch halten · optional" },
  "2026-09-15": { name: "Gruppenfahrt",          typ: "Gruppenfahrt", week: "P2-W12", phase: "Taper",     km: 55,  details: "Letzte Gruppenfahrt · locker bleiben" },
  "2026-09-17": { name: "Aktivierung vor Test",      typ: "Z1 Recovery",  week: "P2-W12", phase: "Taper",     km: 30,  details: "Kurze Aktivierung mit 2–3 kurzen Antritten · Beine wecken vor Ramp Test" },
  "2026-09-19": { name: "FTP Ramp Test",             typ: "FTP-Test",     week: "P2-W12", phase: "Taper",     km: 25,
    workout: { warmup: 10, intervals: null, duration: null, rest: null, cooldown: 5, zone: "RAMP", pct: null, watts: null, label: "FTP Ramp Test · alle 1 min +20W bis zum Abbruch" } },
};

export function getPlan2WeekPhase(dateStr) {
  for (const s of PLAN2_SCHEDULE) {
    if (dateStr >= s.start && dateStr <= s.end) return { week: s.week, phase: s.phase };
  }
  return { week: null, phase: null };
}

/**
 * Leitet die Trainingsblöcke für den Power-Curve-Vergleich ab:
 * Plan 1 als Ganzes plus die zusammenhängenden Plan-2-Phasenblöcke
 * (Sweet Spot / Schwelle / VO2max) aus PLAN2_SCHEDULE. Rein und testbar.
 * @param {string} todayISO Blöcke, die noch nicht begonnen haben, entfallen;
 *                          laufende Blöcke werden auf heute gekappt.
 * @returns {Array<{key: string, label: string, from: string, to: string}>}
 */
export function getPlan2Blocks(todayISO) {
  const blocks = [{ key: "plan1", label: "Plan 1", from: "2026-03-24", to: "2026-06-21" }];

  const PHASES = ["Sweet Spot", "Schwelle", "VO2max"];
  let current = null;
  for (const w of PLAN2_SCHEDULE) {
    if (PHASES.includes(w.phase)) {
      if (current && current.label === w.phase) {
        current.to = w.end;
      } else {
        if (current) blocks.push(current);
        current = {
          key: w.phase.toLowerCase().replace(/\s+/g, "-"),
          label: w.phase,
          from: w.start,
          to: w.end,
        };
      }
    } else if (current) {
      blocks.push(current);
      current = null;
    }
  }
  if (current) blocks.push(current);

  return blocks
    .filter((b) => b.from <= todayISO)
    .map((b) => ({ ...b, to: b.to > todayISO ? todayISO : b.to }));
}

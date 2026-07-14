/* ============================================================
   SCRIPTS/LIB/PLAN-ATHLETE2.JS — GFNY Bremen 2026 Trainingsplan
   (Athlet 2). Nur PLANNED_SESSIONS_ATHLETE2 (Datum → Name/Typ/Woche/
   Phase/Details), kein I/O. Anders als plan2.js (Athlet 1) kein
   separates Schedule-Array — week/phase stehen bereits pro Session.
   Quelle: Notion-Trainings-Hub (manueller Export).

   Renntag: 30.08.2026 (So, bestätigt — fester externer Termin), Ziel
   unter 3:00h (100km).
   FTP-Basis: 265W (Ramp-Test 24.06.2026). FTP-Ziel: 280W
   (Notion-Korridor 275–285W, s. state/config.js athletes[]).

   Datumskorrektur (13.07.2026): alle WOCHENSCHEMA-Termine (Mo–So-Muster
   Ruhetag/Crit/Z2/Intervalle/Rennsim.) waren einheitlich einen Tag zu spät
   eingetragen (jeder Wochenblock begann auf Di statt Mo — gegen ISO-
   Kalenderwochen geprüft) und wurden um -1 Tag korrigiert. Der Renntag
   selbst (30.08., So) ist ein fester externer Termin, kein Wochenschema-
   Ableger, und blieb unverändert — deshalb liegt zwischen "Ruhetag —
   Ausrüstung checken" (28.08., Fr) und dem Renntag (30.08.) bewusst ein
   freier Tag (29.08., Sa, kein Eintrag).

   Blockstruktur:
     Block 1 Basis        KW23–26 (01.06.–28.06.)  Aerobe Basis + Sweetspot
     Block 2 Aufbau       KW27–30 (29.06.–26.07.)  Threshold + Over-Under
     Block 3 Rennhärte    KW31–34 (27.07.–23.08.)  Rennsimulation + Sprint
     Taper                KW35    (24.–30.08.)     Volumen halbieren
   Standard-Wochenstruktur (Mo–So):
     Mo Ruhetag · Di MyWhoosh Crit (~30min) · Mi Z2 Rolle 90min ·
     Do Intervalle 90min · Fr Ruhetag · Sa MyWhoosh Rennen 60–75min ·
     So Z2 outdoor/Rolle 90min
   Ausnahmen: NLS6 (17.–19.06., KW25) und NLS7 (29.07.–31.07., KW31)
   ersetzen Do–Sa durch Abfahrt/Renntag/Heimfahrt, kein Nachholen.

   Phasen-Keys (Basis/Aufbau/Rennhärte) sind eigenständig in state/config.js
   CONFIG.phases eingetragen — kein Namenskonflikt mit Athlet 1s Plan-1/2-
   Phasen. Einzige Ausnahme "Taper": wird mit Athlet 1s Plan-2-Taper
   geteilt (identische Farbe, .label wird im UI nirgends gerendert —
   nur .color über CONFIG.phaseColor()).
   ============================================================ */

// === Geplante Einheiten — Datum → Name/Typ/Woche/Phase/Details ===
// Kein separates Schedule-Array (im Unterschied zu plan2.js/PLAN2_SCHEDULE):
// week/phase stehen bereits direkt an jeder Session; ein zusätzliches
// Datumsbereichs-Mapping wäre nur eine unbenutzte Duplikation dieser Info
// (mapActivity2 setzt ride.week/ride.phase bewusst nicht, s. map-activity.js).
export const PLANNED_SESSIONS_ATHLETE2 = {
  // ── KW23 — 01.06.–07.06. ─────────────────────────────────────────
  "2026-06-01": { name: "Ruhetag", typ: "Ruhetag", week: "KW23", phase: "Basis" },
  "2026-06-02": {
    name: "MyWhoosh Crit",
    typ: "VO2max",
    week: "KW23",
    phase: "Basis",
    details: "~30 Min · Stream · >258W (Z5)",
  },
  "2026-06-03": {
    name: "Z2 Rolle",
    typ: "Z2",
    week: "KW23",
    phase: "Basis",
    details: "90 Min · 155–207W",
  },
  "2026-06-04": {
    name: "Sweetspot 2×15 Min",
    typ: "Sweet Spot",
    week: "KW23",
    phase: "Basis",
    workout: { warmup: 15, intervals: 2, duration: 15, rest: 5, cooldown: 10, zone: "SS", watts: [232, 245], label: "2×15 Min @ SS (232–245W)" },
  },
  "2026-06-05": { name: "Ruhetag", typ: "Ruhetag", week: "KW23", phase: "Basis" },
  "2026-06-06": {
    name: "MyWhoosh längeres Rennen",
    typ: "Rennen",
    week: "KW23",
    phase: "Basis",
    details: "60–75 Min · Z3/Z4 · 207–245W",
  },
  "2026-06-07": {
    name: "Z2 outdoor",
    typ: "Z2",
    week: "KW23",
    phase: "Basis",
    details: "90 Min · 155–207W",
  },

  // ── KW24 — 08.06.–14.06. ─────────────────────────────────────────
  "2026-06-08": { name: "Ruhetag", typ: "Ruhetag", week: "KW24", phase: "Basis" },
  "2026-06-09": {
    name: "MyWhoosh Crit",
    typ: "VO2max",
    week: "KW24",
    phase: "Basis",
    details: "~30 Min · Stream · >258W (Z5)",
  },
  "2026-06-10": {
    name: "Z2 Rolle",
    typ: "Z2",
    week: "KW24",
    phase: "Basis",
    details: "90 Min · 155–207W",
  },
  "2026-06-11": {
    name: "Sweetspot 3×12 Min",
    typ: "Sweet Spot",
    week: "KW24",
    phase: "Basis",
    workout: { warmup: 15, intervals: 3, duration: 12, rest: 5, cooldown: 10, zone: "SS", watts: [232, 245], label: "3×12 Min @ SS (232–245W)" },
  },
  "2026-06-12": { name: "Ruhetag", typ: "Ruhetag", week: "KW24", phase: "Basis" },
  "2026-06-13": {
    name: "MyWhoosh längeres Rennen",
    typ: "Rennen",
    week: "KW24",
    phase: "Basis",
    details: "75 Min · Z3/Z4 · 207–245W",
  },
  "2026-06-14": {
    name: "Z2 outdoor",
    typ: "Z2",
    week: "KW24",
    phase: "Basis",
    details: "90 Min · 155–207W",
  },

  // ── KW25 — 15.06.–21.06. | ⚠️ NLS6 Eifel Trophy ──────────────────
  "2026-06-15": { name: "Ruhetag", typ: "Ruhetag", week: "KW25", phase: "Basis" },
  "2026-06-16": {
    name: "MyWhoosh Crit",
    typ: "VO2max",
    week: "KW25",
    phase: "Basis",
    details: "~30 Min · Stream · >258W (Z5)",
  },
  "2026-06-17": {
    name: "Z2 Rolle (vor Abfahrt)",
    typ: "Z2",
    week: "KW25",
    phase: "Basis",
    details: "60 Min · 155–207W · danach Abfahrt NLS 14:00 Uhr",
  },
  "2026-06-18": {
    name: "NLS6 Renntag",
    typ: "NLS",
    week: "KW25",
    phase: "Basis",
    details: "Eifel Trophy · kein Training",
  },
  "2026-06-19": {
    name: "NLS6 + Heimfahrt",
    typ: "NLS",
    week: "KW25",
    phase: "Basis",
    details: "kein Training",
  },
  "2026-06-20": {
    name: "Regeneration leicht",
    typ: "Z1",
    week: "KW25",
    phase: "Basis",
    details: "45 Min · Z1 · <155W",
  },

  // ── KW26 — 22.06.–28.06. | Abschluss Block 1 ─────────────────────
  "2026-06-22": { name: "Ruhetag", typ: "Ruhetag", week: "KW26", phase: "Basis" },
  "2026-06-23": {
    name: "MyWhoosh Crit",
    typ: "VO2max",
    week: "KW26",
    phase: "Basis",
    details: "~30 Min · Stream · >258W (Z5)",
  },
  "2026-06-24": {
    name: "Z2 Rolle",
    typ: "Z2",
    week: "KW26",
    phase: "Basis",
    details: "90 Min · 155–207W",
  },
  "2026-06-25": {
    name: "Threshold 2×10 Min",
    typ: "Schwelle",
    week: "KW26",
    phase: "Basis",
    workout: { warmup: 15, intervals: 2, duration: 10, rest: 5, cooldown: 10, zone: "THR", watts: [245, 265], label: "2×10 Min @ Schwelle (245–265W)" },
  },
  "2026-06-26": { name: "Ruhetag", typ: "Ruhetag", week: "KW26", phase: "Basis" },
  "2026-06-27": {
    name: "MyWhoosh längeres Rennen",
    typ: "Rennen",
    week: "KW26",
    phase: "Basis",
    details: "75 Min · Z3/Z4 · 207–245W",
  },
  "2026-06-28": {
    name: "Z2 outdoor",
    typ: "Z2",
    week: "KW26",
    phase: "Basis",
    details: "90 Min · 155–207W · Wochenfazit: Block 1 abgeschlossen, FTP neu 265W, Klassensieg Road Race bei 40°C",
  },

  // ── KW27 — 29.06.–05.07. ─────────────────────────────────────────
  "2026-06-29": { name: "Ruhetag", typ: "Ruhetag", week: "KW27", phase: "Aufbau" },
  "2026-06-30": {
    name: "MyWhoosh Crit",
    typ: "VO2max",
    week: "KW27",
    phase: "Aufbau",
    details: "~30 Min · Stream · >258W (Z5)",
  },
  "2026-07-01": {
    name: "Z2 Rolle",
    typ: "Z2",
    week: "KW27",
    phase: "Aufbau",
    details: "90 Min · 155–207W",
  },
  "2026-07-02": {
    name: "Over-Under 3×8 Min",
    typ: "Schwelle",
    week: "KW27",
    phase: "Aufbau",
    workout: { warmup: 15, intervals: 3, duration: 8, rest: 5, cooldown: 10, zone: "THR", watts: [252, 278], label: "3×8 Min Over-Under (252–278W)" },
  },
  "2026-07-03": { name: "Ruhetag", typ: "Ruhetag", week: "KW27", phase: "Aufbau" },
  "2026-07-04": {
    name: "MyWhoosh längeres Rennen",
    typ: "Rennen",
    week: "KW27",
    phase: "Aufbau",
    details: "75 Min · Z3/Z4 · 207–258W",
  },
  "2026-07-05": {
    name: "Z2 outdoor",
    typ: "Z2",
    week: "KW27",
    phase: "Aufbau",
    details: "90 Min · 155–207W",
  },

  // ── KW28 — 06.07.–12.07. ─────────────────────────────────────────
  "2026-07-06": { name: "Ruhetag", typ: "Ruhetag", week: "KW28", phase: "Aufbau" },
  "2026-07-07": {
    name: "MyWhoosh Crit",
    typ: "VO2max",
    week: "KW28",
    phase: "Aufbau",
    details: "~30 Min · Stream · >258W (Z5) · Platz 3 in Klasse",
  },
  "2026-07-08": {
    name: "Z2 Rolle",
    typ: "Z2",
    week: "KW28",
    phase: "Aufbau",
    details: "90 Min · 155–207W",
  },
  "2026-07-09": {
    name: "Over-Under 3×10 Min",
    typ: "Schwelle",
    week: "KW28",
    phase: "Aufbau",
    workout: { warmup: 15, intervals: 3, duration: 10, rest: 5, cooldown: 10, zone: "THR", watts: [252, 278], label: "3×10 Min Over-Under (252–278W)" },
    details: "Gang-Problem am Cube (Kadenz-Sprünge) — ab dieser Einheit ERG-Modus für Intervalle",
  },
  "2026-07-10": { name: "Ruhetag", typ: "Ruhetag", week: "KW28", phase: "Aufbau" },
  "2026-07-11": {
    name: "MyWhoosh längeres Rennen",
    typ: "Rennen",
    week: "KW28",
    phase: "Aufbau",
    details: "75 Min · Z3/Z4 · 207–258W · Platz 2 in Klasse",
  },
  "2026-07-12": {
    name: "Z2 outdoor",
    typ: "Z2",
    week: "KW28",
    phase: "Aufbau",
    details: "90 Min · 155–207W",
  },

  // ── KW29 — 13.07.–19.07. ─────────────────────────────────────────
  "2026-07-13": { name: "Ruhetag", typ: "Ruhetag", week: "KW29", phase: "Aufbau" },
  "2026-07-14": {
    name: "MyWhoosh Crit",
    typ: "VO2max",
    week: "KW29",
    phase: "Aufbau",
    details: "~30 Min · Stream · >258W (Z5)",
  },
  "2026-07-15": {
    name: "Z2 Rolle",
    typ: "Z2",
    week: "KW29",
    phase: "Aufbau",
    details: "90 Min · 155–207W",
  },
  "2026-07-16": {
    name: "Over-Under 3×12 Min",
    typ: "Schwelle",
    week: "KW29",
    phase: "Aufbau",
    workout: { warmup: 15, intervals: 3, duration: 12, rest: 5, cooldown: 10, zone: "THR", watts: [252, 278], label: "3×12 Min Over-Under (252–278W)" },
  },
  "2026-07-17": { name: "Ruhetag", typ: "Ruhetag", week: "KW29", phase: "Aufbau" },
  "2026-07-18": {
    name: "MyWhoosh Rennsimulation",
    typ: "Rennen",
    week: "KW29",
    phase: "Aufbau",
    details: "90 Min · Z3/Z4 · 207–258W · Hinweis: entfällt evtl., siehe adjustments-2.json",
  },
  "2026-07-19": {
    name: "Z2 outdoor",
    typ: "Z2",
    week: "KW29",
    phase: "Aufbau",
    details: "90 Min · 155–207W",
  },

  // ── KW30 — 20.07.–26.07. ─────────────────────────────────────────
  "2026-07-20": { name: "Ruhetag", typ: "Ruhetag", week: "KW30", phase: "Aufbau" },
  "2026-07-21": {
    name: "MyWhoosh Crit",
    typ: "VO2max",
    week: "KW30",
    phase: "Aufbau",
    details: "~30 Min · Stream · >258W (Z5)",
  },
  "2026-07-22": {
    name: "Z2 Rolle",
    typ: "Z2",
    week: "KW30",
    phase: "Aufbau",
    details: "90 Min · 155–207W",
  },
  "2026-07-23": {
    name: "Threshold 3×12 Min @95%",
    typ: "Schwelle",
    week: "KW30",
    phase: "Aufbau",
    workout: { warmup: 15, intervals: 3, duration: 12, rest: 5, cooldown: 10, zone: "THR", watts: [245, 265], label: "3×12 Min @ Schwelle 95% (245–265W)" },
  },
  "2026-07-24": { name: "Ruhetag", typ: "Ruhetag", week: "KW30", phase: "Aufbau" },
  "2026-07-25": {
    name: "MyWhoosh Rennsimulation",
    typ: "Rennen",
    week: "KW30",
    phase: "Aufbau",
    details: "90 Min · Z3/Z4 · 207–258W",
  },
  "2026-07-26": {
    name: "Z2 outdoor",
    typ: "Z2",
    week: "KW30",
    phase: "Aufbau",
    details: "90 Min · 155–207W",
  },

  // ── KW31 — 27.07.–02.08. | ⚠️ NLS7 Ruhr-Pokal ────────────────────
  "2026-07-27": { name: "Ruhetag", typ: "Ruhetag", week: "KW31", phase: "Rennhärte" },
  "2026-07-28": {
    name: "MyWhoosh Crit",
    typ: "VO2max",
    week: "KW31",
    phase: "Rennhärte",
    details: "~30 Min · Stream · >258W (Z5)",
  },
  "2026-07-29": {
    name: "Z2 Rolle (vor Abfahrt)",
    typ: "Z2",
    week: "KW31",
    phase: "Rennhärte",
    details: "60 Min · 155–207W · danach Abfahrt NLS 14:00 Uhr",
  },
  "2026-07-30": {
    name: "NLS7 Renntag",
    typ: "NLS",
    week: "KW31",
    phase: "Rennhärte",
    details: "6h Ruhr-Pokal · kein Training",
  },
  "2026-07-31": {
    name: "NLS7 + Heimfahrt",
    typ: "NLS",
    week: "KW31",
    phase: "Rennhärte",
    details: "kein Training",
  },
  "2026-08-01": {
    name: "Regeneration leicht",
    typ: "Z1",
    week: "KW31",
    phase: "Rennhärte",
    details: "45 Min · Z1 · <155W",
  },

  // ── KW32 — 03.08.–09.08. ─────────────────────────────────────────
  "2026-08-03": { name: "Ruhetag", typ: "Ruhetag", week: "KW32", phase: "Rennhärte" },
  "2026-08-04": {
    name: "MyWhoosh Crit",
    typ: "VO2max",
    week: "KW32",
    phase: "Rennhärte",
    details: "~30 Min · Stream · >258W (Z5)",
  },
  "2026-08-05": {
    name: "Z2 Rolle",
    typ: "Z2",
    week: "KW32",
    phase: "Rennhärte",
    details: "90 Min · 155–207W",
  },
  "2026-08-06": {
    name: "Threshold 3×12 Min + Sprint",
    typ: "Schwelle",
    week: "KW32",
    phase: "Rennhärte",
    workout: { warmup: 15, intervals: 3, duration: 12, rest: 5, cooldown: 10, zone: "THR", watts: [252, 278], label: "3×12 Min @ Schwelle + Schlusssprint (252–278W)" },
  },
  "2026-08-07": { name: "Ruhetag", typ: "Ruhetag", week: "KW32", phase: "Rennhärte" },
  "2026-08-08": {
    name: "Rennsimulation mit Schlusssprint",
    typ: "Rennen",
    week: "KW32",
    phase: "Rennhärte",
    details: "90 Min · Z3/Z4 · 207–270W",
  },
  "2026-08-09": {
    name: "Z2 outdoor",
    typ: "Z2",
    week: "KW32",
    phase: "Rennhärte",
    details: "90 Min · 155–207W",
  },

  // ── KW33 — 10.08.–16.08. ─────────────────────────────────────────
  "2026-08-10": { name: "Ruhetag", typ: "Ruhetag", week: "KW33", phase: "Rennhärte" },
  "2026-08-11": {
    name: "MyWhoosh Crit",
    typ: "VO2max",
    week: "KW33",
    phase: "Rennhärte",
    details: "~30 Min · Stream · >258W (Z5)",
  },
  "2026-08-12": {
    name: "Z2 Rolle",
    typ: "Z2",
    week: "KW33",
    phase: "Rennhärte",
    details: "90 Min · 155–207W",
  },
  "2026-08-13": {
    name: "Over-Under 3×10 Min + Sprint",
    typ: "Schwelle",
    week: "KW33",
    phase: "Rennhärte",
    workout: { warmup: 15, intervals: 3, duration: 10, rest: 5, cooldown: 10, zone: "THR", watts: [252, 278], label: "3×10 Min Over-Under + Schlusssprint (252–278W)" },
  },
  "2026-08-14": { name: "Ruhetag", typ: "Ruhetag", week: "KW33", phase: "Rennhärte" },
  "2026-08-15": {
    name: "Rennsimulation 90 Min",
    typ: "Rennen",
    week: "KW33",
    phase: "Rennhärte",
    details: "90 Min · Ø 220–240W",
  },
  "2026-08-16": {
    name: "Z2 outdoor",
    typ: "Z2",
    week: "KW33",
    phase: "Rennhärte",
    details: "90 Min · 155–207W",
  },

  // ── KW34 — 17.08.–23.08. | Peak-Woche ────────────────────────────
  "2026-08-17": { name: "Ruhetag", typ: "Ruhetag", week: "KW34", phase: "Rennhärte" },
  "2026-08-18": {
    name: "MyWhoosh Crit",
    typ: "VO2max",
    week: "KW34",
    phase: "Rennhärte",
    details: "~30 Min · Stream · >258W (Z5)",
  },
  "2026-08-19": {
    name: "Z2 Rolle",
    typ: "Z2",
    week: "KW34",
    phase: "Rennhärte",
    details: "90 Min · 155–207W",
  },
  "2026-08-20": {
    name: "Threshold 2×15 Min",
    typ: "Schwelle",
    week: "KW34",
    phase: "Rennhärte",
    workout: { warmup: 15, intervals: 2, duration: 15, rest: 5, cooldown: 10, zone: "THR", watts: [245, 265], label: "2×15 Min @ Schwelle (245–265W)" },
  },
  "2026-08-21": { name: "Ruhetag", typ: "Ruhetag", week: "KW34", phase: "Rennhärte" },
  "2026-08-22": {
    name: "Letzte Rennsimulation 75 Min",
    typ: "Rennen",
    week: "KW34",
    phase: "Rennhärte",
    details: "75 Min · Ø 220–240W",
  },
  "2026-08-23": {
    name: "Z2 leicht",
    typ: "Z2",
    week: "KW34",
    phase: "Rennhärte",
    details: "60 Min · 155–190W",
  },

  // ── KW35 — Taper (24.–30.08.) — 29.08. bewusst frei, s. Kopfkommentar ──
  "2026-08-24": { name: "Ruhetag", typ: "Ruhetag", week: "KW35", phase: "Taper" },
  "2026-08-25": {
    name: "MyWhoosh Crit kurz",
    typ: "VO2max",
    week: "KW35",
    phase: "Taper",
    details: "~20 Min · >258W (Z5)",
  },
  "2026-08-26": {
    name: "Z2 leicht",
    typ: "Z2",
    week: "KW35",
    phase: "Taper",
    details: "60 Min · 155–190W",
  },
  "2026-08-27": {
    name: "Sweetspot 2×8 Min",
    typ: "Sweet Spot",
    week: "KW35",
    phase: "Taper",
    workout: { warmup: 10, intervals: 2, duration: 8, rest: 5, cooldown: 10, zone: "SS", watts: [232, 245], label: "2×8 Min @ SS (232–245W)" },
  },
  "2026-08-28": {
    name: "Ruhetag — Ausrüstung checken",
    typ: "Ruhetag",
    week: "KW35",
    phase: "Taper",
  },
  "2026-08-30": {
    name: "🏁 GFNY BREMEN",
    typ: "Race",
    week: "KW35",
    phase: "Taper",
    km: 100,
    details:
      "Ziel unter 3:00h · Ø 220–235W · 4km neutralisiert, 2× Hauptrunde á ~42km, 500m Kopfsteinpflaster bei km~50, Zielsprint km 95. Runde 1 Peloton/Z3 <152bpm, Runde 2 Tempo hoch, letzte 5km alles.",
  },
};

/* ============================================================
   CONFIG.JS — Alle konfigurierbaren Werte an einem Ort
   Hier anpassen wenn sich Werte ändern — kein Suchen im Code
   ============================================================ */

window.CONFIG = {

  /* ── Plan-Info ─────────────────────────────────────────────── */
  planName:    "Trainingsdashboard",
  planVersion: "Plan 1 + 2",
  athlete:     "Alexander Müller",

  /* ── FTP & Leistung ────────────────────────────────────────── */
  ftp: 193,
  eFTP: 199,

  /* ── Herzfrequenz ──────────────────────────────────────────── */
  hrMax:   201,
  hrZones: {
    z1: [0,   0.68],
    z2: [0.68,0.83],
    z3: [0.83,0.88],
    z4: [0.88,0.95],
    z5: [0.95,1.00],
  },

  /* ── Kadenz-Ziel ───────────────────────────────────────────── */
  cadenceTarget: 90,

  /* ── Wochen-Reihenfolge (Plan 1 + Plan 2) ─────────────────── */
  weekOrder: [
    // Plan 1
    "Vor W1","Vor","W1","W2","W3","W4","W5","W6",
    "W7","W8","W9","W10","W11","W12",
    // Plan 2 (W0 = Übergang, dann W1-W12 mit Prefix "P2")
    "P2-W0","P2-W1","P2-W2","P2-W3","P2-W4",
    "P2-W5","P2-W6","P2-W7","P2-W8",
    "P2-W9","P2-W10","P2-W11","P2-W12",
  ],

  /* ── Phasen ────────────────────────────────────────────────── */
  phases: {
    // Plan 1
    "Vorbereitung": { color: "#c9a84c", label: "Vorbereitung" },
    "Vor":          { color: "#c9a84c", label: "Vorbereitung" },
    "Phase 1":      { color: "#6b7280", label: "Phase 1 — Basisaufbau"     },
    "Phase 2":      { color: "#4a7fa8", label: "Phase 2 — Volumenaufbau"   },
    "Phase 3":      { color: "#7c5cbf", label: "Phase 3 — Leistungsaufbau" },
    // Plan 2
    "Übergang":     { color: "#c9a84c", label: "Übergang"                  },
    "Sweet Spot":   { color: "#e07b39", label: "Block 1 — Sweet Spot"      },
    "Schwelle":     { color: "#d94f4f", label: "Block 2 — Schwelle"        },
    "VO2max":       { color: "#b83dba", label: "Block 3 — VO₂max"         },
    "Taper":        { color: "#4a9a6e", label: "Taper + Retest"            },
    "Erholung":     { color: "#6b9fa8", label: "Erholungswoche"            },
  },

  /* ── Bekannte Meilensteine ─────────────────────────────────── */
  manualMilestones: [
    { icon: "🏁", text: "Erstes Rennen: MyWhoosh Criterium (Pl. 21/23 · Gr. 5/7)", dateISO: "2026-05-12", date: "12.05.2026", week: "W7"  },
    { icon: "💯", text: 'Erster 100km-Ride — "Irgendwie einfach"',      dateISO: "2026-06-05", date: "05.06.2026", week: "W10" },
    { icon: "🎯", text: "FTP Ramp Test: 193W bestätigt",               dateISO: "2026-06-12", date: "12.06.2026", week: "W11" },
    { icon: "🥇", text: "PB: NP 200W · 29,6 km/h Schnitt",            dateISO: "2026-06-17", date: "17.06.2026", week: "W12" },
    { icon: "🏔️", text: "138 km Abschlusstour bei 29°C",              dateISO: "2026-06-19", date: "19.06.2026", week: "W12" },
  ],

  /* ── Datenquelle ──────────────────────────────────────────── */
  // Statisches JSON statt Netlify Serverless Function
  // Wird per GitHub Action aus Notion/intervals.icu generiert
  apiEndpoint: "./data/rides.json",
  cacheMinutes: 5,

  /* ── Athleten (für Vergleichs-Toggle) ───────────────────────── */
  athletes: [
    { id: "alex",  name: "Alex Stuhlsen",  endpoint: "./data/rides.json"   },
    { id: "siggi", name: "Siggi Lentes",   endpoint: "./data/rides-2.json" },
  ],

  /* ── Historisches Volumen vor Systembeitritt (Strava-Lifetime) ─
     Siggi war vor seinem intervals.icu-Beitritt schon aktiv auf Strava.
     Diese Werte werden einmalig erfasst und zur Live-Distanz addiert,
     damit die Gesamtdistanz nicht künstlich klein wirkt.
     Bei neuem Strava-Abgleich manuell aktualisieren. */
  historicalVolume: {
    siggi: {
      totalKmLifetime: 4568.5,       // Strava "Insgesamt" zum Stand der Erfassung
      kmAlreadyInSystem: 339,         // Distanz der Fahrten, die bereits über intervals.icu erfasst sind
      capturedAt: "2026-06-30",
    },
  },

};

// Hilfsfunktion: Phasenfarbe abrufen
CONFIG.phaseColor = (phase) =>
  (CONFIG.phases[phase] || {}).color || "#6b7280";

// Hilfsfunktion: Woche in numerischen Index umwandeln (für Sortierung)
CONFIG.weekIndex = (week) => {
  const i = CONFIG.weekOrder.indexOf(week);
  return i === -1 ? 999 : i;
};

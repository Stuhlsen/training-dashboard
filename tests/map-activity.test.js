/* Tests: scripts/lib/map-activity.js — Bug-Regressionen
   1) buildEffectivePlanIndex + mapActivity/mapActivity2: Kartentausch im
      Planungstab (adjustments.json) muss die Ride-Zuordnung erreichen,
      nicht nur die Planungstab-Anzeige.
   2) classifyCooldowns: Ausrollen direkt nach einem Renn-Workout am
      selben Tag wird als eigenständiger Typ erkannt, kein normaler
      Doppel-Fahrt-Tag wird fälschlich reklassifiziert. */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildEffectivePlanIndex,
  mapActivity,
  mapActivity2,
  classifyCooldowns,
  rpeFeelCoverage,
} from "../scripts/lib/map-activity.js";

function baseAct(overrides = {}) {
  return {
    start_date_local: "2026-07-14T18:25:30",
    moving_time: 67 * 60,
    distance: 25000,
    icu_weighted_avg_watts: 155,
    average_speed: 8,
    ...overrides,
  };
}

test("buildEffectivePlanIndex: Kartentausch löst sich zu vertauschten Sessions auf", () => {
  const sessions = {
    "2026-07-14": { name: "Gruppenfahrt", typ: "Gruppenfahrt" },
    "2026-07-16": { name: "Sweet Spot 2×20 min", typ: "Sweet Spot" },
  };
  const adjustments = {
    "2026-07-14": { movedTo: "2026-07-16", reason: "Regen" },
    "2026-07-16": { movedTo: "2026-07-14", reason: "Tausch mit Gruppenfahrt" },
  };
  const index = buildEffectivePlanIndex(sessions, adjustments);

  assert.equal(index["2026-07-14"].name, "Sweet Spot 2×20 min");
  assert.equal(index["2026-07-14"].typ, "Sweet Spot");
  assert.equal(index["2026-07-16"].name, "Gruppenfahrt");
  assert.equal(index["2026-07-16"].typ, "Gruppenfahrt");
});

test("buildEffectivePlanIndex: ausgefallene Session verschwindet aus dem Index", () => {
  const sessions = { "2026-07-13": { name: "Z2 Locker", typ: "Z2 Dauer" } };
  const adjustments = { "2026-07-13": { cancelled: true, reason: "Erholung" } };
  const index = buildEffectivePlanIndex(sessions, adjustments);
  assert.equal(index["2026-07-13"], undefined);
});

test("buildEffectivePlanIndex: ohne Adjustments unverändert", () => {
  const sessions = { "2026-07-10": { name: "Schwelle", typ: "Schwelle" } };
  const index = buildEffectivePlanIndex(sessions, {});
  assert.equal(index["2026-07-10"].name, "Schwelle");
});

// Regressionstest: einseitige Verschiebung (kein wechselseitiger Tausch) auf
// ein Datum, das bereits seine eigene, unveränderte Plankarte hat. Ein
// naiver Ein-Durchgang-Aufbau (index[effective.date] = effective in
// Objects.entries-Reihenfolge) würde die verschobene Session hier je nach
// Schlüssel-Reihenfolge stillschweigend verlieren.
test("buildEffectivePlanIndex: verschobene Session verdrängt die unverschobene Karte am Zieldatum", () => {
  const sessions = {
    "2026-06-01": { name: "Gruppenfahrt", typ: "Gruppenfahrt" },
    "2026-06-03": { name: "Eigene Karte", typ: "Z2" },
  };
  const adjustments = {
    "2026-06-01": { movedTo: "2026-06-03", reason: "Termin" },
  };
  const index = buildEffectivePlanIndex(sessions, adjustments);

  assert.equal(index["2026-06-03"].name, "Gruppenfahrt");
  assert.equal(index["2026-06-03"].typ, "Gruppenfahrt");
});

test("mapActivity: Ride am getauschten Datum bekommt die verschobene Karte, nicht die statische", () => {
  const sessions = {
    "2026-07-14": { name: "Gruppenfahrt", typ: "Gruppenfahrt" },
    "2026-07-16": { name: "Sweet Spot 2×20 min", typ: "Sweet Spot" },
  };
  const adjustments = {
    "2026-07-14": { movedTo: "2026-07-16", reason: "Regen" },
    "2026-07-16": { movedTo: "2026-07-14", reason: "Tausch mit Gruppenfahrt" },
  };
  const effectivePlan = buildEffectivePlanIndex(sessions, adjustments);

  const ride = mapActivity(baseAct(), {}, {}, {}, effectivePlan);

  assert.equal(ride.name, "Sweet Spot 2×20 min");
  // typPlanned beweist, dass die getauschte Karte die Zuordnung erreicht;
  // typ selbst kommt jetzt von der Ist-Typerkennung (NP 155W/FTP 193W ≈
  // IF 0.80 → "Z2 Dauer"), nicht mehr von der Plankarte.
  assert.equal(ride.typPlanned, "Sweet Spot");
  assert.equal(ride.typ, "Z2 Dauer");
});

test("mapActivity: ohne effectivePlan (Default-Fallback) bleibt Altverhalten möglich", () => {
  // Kein Adjustment übergeben → Default-Parameter greift auf PLANNED_SESSIONS
  // zurück (statisch) statt zu crashen, falls ein Aufrufer effectivePlan
  // weglässt.
  const ride = mapActivity(baseAct({ start_date_local: "2099-01-01T09:00:00" }), {}, {}, {});
  assert.equal(typeof ride.typ, "string");
});

test("mapActivity: rpe/feelIcu aus intervals.icu-Feldern übernommen", () => {
  const ride = mapActivity(
    baseAct({ perceived_exertion: 7, feel: 3 }),
    {},
    {},
    {}
  );
  assert.equal(ride.rpe, 7);
  assert.equal(ride.feelIcu, 3);
});

test("mapActivity: rpe/feelIcu fehlen → null statt Fehler", () => {
  const ride = mapActivity(baseAct(), {}, {}, {});
  assert.equal(ride.rpe, null);
  assert.equal(ride.feelIcu, null);
});

test("mapActivity2: rpe/feelIcu aus intervals.icu-Feldern übernommen", () => {
  const ride = mapActivity2(baseAct({ perceived_exertion: 4, feel: 5 }), {}, {}, 265);
  assert.equal(ride.rpe, 4);
  assert.equal(ride.feelIcu, 5);
});

test("rpeFeelCoverage: zählt non-null rpe/feelIcu über Rides", () => {
  const rides = [{ rpe: 5, feelIcu: null }, { rpe: null, feelIcu: 2 }, { rpe: 6, feelIcu: 4 }];
  assert.deepEqual(rpeFeelCoverage(rides), { rpe: 2, feelIcu: 2 });
  assert.deepEqual(rpeFeelCoverage([]), { rpe: 0, feelIcu: 0 });
});

test("mapActivity2: Ride am getauschten Datum bekommt die verschobene Karte", () => {
  const sessions = {
    "2026-07-14": { name: "Ruhetag", typ: "Ruhetag" },
    "2026-07-15": { name: "Z2 Rolle", typ: "Z2" },
  };
  const adjustments = {
    "2026-07-14": { movedTo: "2026-07-15", reason: "Termin" },
    "2026-07-15": { movedTo: "2026-07-14", reason: "Tausch" },
  };
  const effectivePlan = buildEffectivePlanIndex(sessions, adjustments);

  const ride = mapActivity2(baseAct(), {}, {}, 265, effectivePlan);

  assert.equal(ride.name, "Z2 Rolle");
  // typPlanned beweist, dass die getauschte Karte die Zuordnung erreicht;
  // typ selbst kommt jetzt von der Ist-Typerkennung (NP 155W/FTP 265W ≈
  // IF 0.58, 67 min → "Z2 Dauer").
  assert.equal(ride.typPlanned, "Z2");
  assert.equal(ride.typ, "Z2 Dauer");
});

test("classifyCooldowns: kurzes niedrig-intensives Workout nach Rennen wird zu Ausrollen", () => {
  // Reale Werte vom 14.07.2026 (Athlet 2, MyWhoosh Crit + Ausrollen)
  const rides = [
    {
      date: "2026-07-14",
      startTime: "2026-07-14T15:01:40",
      name: "MyWhoosh Crit",
      typ: "VO2max",
      min: 29,
      np: 273,
      watt: 254,
    },
    {
      date: "2026-07-14",
      startTime: "2026-07-14T15:33:44",
      name: "MyWhoosh Crit",
      typ: "VO2max",
      min: 20,
      np: 132,
      watt: 121,
    },
  ];
  classifyCooldowns(rides, [], 265);

  assert.equal(rides[0].typ, "VO2max");
  assert.equal(rides[0].name, "MyWhoosh Crit");
  assert.equal(rides[1].typ, "Ausrollen");
  assert.equal(rides[1].name, "Ausrollen");
});

test("classifyCooldowns: Einrollen vor Rennen wird erkannt, Rennen + Ausrollen unverändert", () => {
  // GFNY-artiger Renntag (Athlet 2): Einrollen zur Strecke → Rennen → Ausrollen.
  const rides = [
    {
      date: "2026-08-30",
      startTime: "2026-08-30T06:30:00",
      name: "GFNY Bremen",
      typ: "Race",
      min: 20,
      np: Math.round(265 * 0.5),
    },
    {
      date: "2026-08-30",
      startTime: "2026-08-30T07:05:00",
      name: "GFNY Bremen",
      typ: "Race",
      min: 160,
      np: Math.round(265 * 0.95),
    },
    {
      date: "2026-08-30",
      startTime: "2026-08-30T09:50:00",
      name: "GFNY Bremen",
      typ: "Race",
      min: 15,
      np: Math.round(265 * 0.4),
    },
  ];
  classifyCooldowns(rides, [], 265);

  assert.equal(rides[0].typ, "Einrollen");
  assert.equal(rides[0].name, "Einrollen");
  assert.equal(rides[1].typ, "Race", "die harte Fahrt bleibt unberührt");
  assert.equal(rides[2].typ, "Ausrollen");
  assert.equal(rides[2].name, "Ausrollen");
});

test("classifyCooldowns: kurze lockere Fahrt ohne harte Folge-Fahrt bleibt unverändert", () => {
  const rides = [
    {
      date: "2026-08-31",
      startTime: "2026-08-31T08:00:00",
      name: "Rolle locker",
      typ: "Z2",
      min: 20,
      np: Math.round(265 * 0.5),
    },
    {
      date: "2026-08-31",
      startTime: "2026-08-31T09:00:00",
      name: "Z2 Dauer",
      typ: "Z2",
      min: 90,
      np: Math.round(265 * 0.62),
    },
  ];
  classifyCooldowns(rides, [], 265);

  assert.equal(rides[0].typ, "Z2", "ohne harten Effort danach kein Einrollen");
  assert.equal(rides[1].typ, "Z2");
});

test("classifyCooldowns: normaler Doppel-Fahrt-Tag (ähnliche Intensität) bleibt unverändert", () => {
  const rides = [
    { date: "2026-06-01", startTime: "2026-06-01T08:00:00", name: "Z2", typ: "Z2", min: 60, np: 150 },
    { date: "2026-06-01", startTime: "2026-06-01T17:00:00", name: "Z2", typ: "Z2", min: 55, np: 145 },
  ];
  classifyCooldowns(rides, [], 265);

  assert.equal(rides[0].typ, "Z2");
  assert.equal(rides[1].typ, "Z2");
});

test("classifyCooldowns: einzelne Fahrt am Tag bleibt unangetastet", () => {
  const rides = [
    { date: "2026-06-02", startTime: "2026-06-02T08:00:00", name: "Rennen", typ: "Rennen", min: 90, np: 240 },
  ];
  classifyCooldowns(rides, [], 265);
  assert.equal(rides[0].typ, "Rennen");
});

// Regressionstest: rein relatives Verhältnis (curIF <= priorIF*0.6) würde
// einen selbst noch harten zweiten Effort fälschlich als Ausrollen
// durchgehen lassen, nur weil der erste Effort extrem war.
test("classifyCooldowns: selbst noch harter zweiter Effort bleibt unverändert (absolute Schwelle)", () => {
  const ftp = 265;
  const rides = [
    {
      date: "2026-06-05",
      startTime: "2026-06-05T10:00:00",
      name: "Sprint-Test",
      typ: "VO2max",
      min: 5,
      np: Math.round(ftp * 2.0),
    },
    {
      date: "2026-06-05",
      startTime: "2026-06-05T10:10:00",
      name: "Schwelle-Intervall",
      typ: "Schwelle",
      min: 20,
      np: Math.round(ftp * 1.1),
    },
  ];
  classifyCooldowns(rides, [], ftp);

  assert.equal(rides[1].typ, "Schwelle");
  assert.equal(rides[1].name, "Schwelle-Intervall");
});

// Regressionstest: zwei unabhängige Fahrten am selben Kalendertag, aber mit
// großem zeitlichem Abstand, sind kein Renn-Ausrollen-Paar, auch wenn die
// Leistungswerte zufällig passen würden.
test("classifyCooldowns: großer zeitlicher Abstand verhindert Reklassifizierung", () => {
  const ftp = 265;
  const rides = [
    {
      date: "2026-06-06",
      startTime: "2026-06-06T09:00:00",
      name: "MyWhoosh Crit",
      typ: "VO2max",
      min: 29,
      np: Math.round(ftp * 1.03),
    },
    {
      date: "2026-06-06",
      startTime: "2026-06-06T18:00:00",
      name: "Pendel-Fahrt",
      typ: "Pendeln",
      min: 15,
      np: Math.round(ftp * 0.4),
    },
  ];
  classifyCooldowns(rides, [], ftp);

  assert.equal(rides[1].typ, "Pendeln");
  assert.equal(rides[1].name, "Pendel-Fahrt");
});

// Regressionstest FTP-Historie-Konsumenten-Umstellung: classifyCooldowns()
// löst die FTP jetzt pro Tagesgruppe über ftpAt() auf statt einen festen
// Skalar zu nehmen — an zwei Tagen mit identischen Rohleistungswerten, aber
// unterschiedlicher zum jeweiligen Datum gültiger FTP, muss die Ausrollen-
// Erkennung entsprechend unterschiedlich ausfallen.
test("classifyCooldowns: nutzt die zum jeweiligen Fahrtdatum gültige FTP aus ftpHistory", () => {
  const ftpHistory = [
    { ftpWatt: 200, validFrom: "2026-01-01" },
    { ftpWatt: 260, validFrom: "2026-06-15" },
  ];
  const rides = [
    // Vor dem FTP-Wechsel (200W gültig): priorIF 190/200=0.95 → hart genug
    {
      date: "2026-06-01",
      startTime: "2026-06-01T09:00:00",
      name: "Hart",
      typ: "Schwelle",
      min: 60,
      np: 190,
    },
    {
      date: "2026-06-01",
      startTime: "2026-06-01T10:20:00",
      name: "Locker",
      typ: "Z2",
      min: 15,
      np: 90,
    },
    // Nach dem FTP-Wechsel (260W gültig), identische Rohleistung: priorIF
    // 190/260=0.73 → NICHT mehr hart genug, keine Reklassifizierung
    {
      date: "2026-07-01",
      startTime: "2026-07-01T09:00:00",
      name: "Hart",
      typ: "Schwelle",
      min: 60,
      np: 190,
    },
    {
      date: "2026-07-01",
      startTime: "2026-07-01T10:20:00",
      name: "Locker",
      typ: "Z2",
      min: 15,
      np: 90,
    },
  ];
  classifyCooldowns(rides, ftpHistory, 200);

  assert.equal(rides[1].typ, "Ausrollen", "vor dem FTP-Wechsel: priorIF hoch genug für Ausrollen-Erkennung");
  assert.equal(rides[3].typ, "Z2", "nach dem FTP-Wechsel: dieselbe Rohleistung ist jetzt relativ zu schwach für 'hart'");
});

// Regressionstest FTP-Historie-Konsumenten-Umstellung: die Ist-Typerkennung
// (jetzt Fall "detected" statt vormals "inferred" — seit der typ-Prioritäts-
// Umstellung übernimmt classifySession() diesen Fall immer, sobald NP/FTP
// vorhanden sind, s. map-activity.js) nutzt dieselbe datumsgenaue
// ftpAt()-Auflösung wie typDetected, statt fest DEFAULT_FTP/estimatedFtp —
// bei identischem NP muss ein ftpHistory-Eintrag die abgeleitete Kategorie
// tatsächlich verschieben.
test("mapActivity: typ (Fall 'detected') wechselt die Kategorie je nach ftpHistory-Eintrag", () => {
  const act = baseAct({ icu_weighted_avg_watts: 190 });

  const withoutHistory = mapActivity(act, {}, {}, {}, {}, [], {});
  // DEFAULT_FTP=193 → IF≈0.984 → Band [0.95,1.05) → "Schwelle"
  assert.equal(withoutHistory.typ, "Schwelle");
  assert.equal(withoutHistory.typSource, "detected");

  const withHistory = mapActivity(
    act,
    {},
    {},
    {},
    {},
    [{ ftpWatt: 230, validFrom: "2020-01-01" }],
    {}
  );
  // 230W gültig → IF≈0.826 → Band [0.75,0.85) → "Z2 Dauer"
  assert.equal(withHistory.typ, "Z2 Dauer");
  assert.equal(withHistory.typSource, "detected");
});

test("mapActivity2: typ (Fall 'detected') wechselt die Kategorie je nach ftpHistory-Eintrag", () => {
  const act = baseAct({ icu_weighted_avg_watts: 190 });

  const withoutHistory = mapActivity2(act, {}, {}, 193, {}, [], {});
  assert.equal(withoutHistory.typ, "Schwelle");
  assert.equal(withoutHistory.typSource, "detected");

  const withHistory = mapActivity2(
    act,
    {},
    {},
    193,
    {},
    [{ ftpWatt: 230, validFrom: "2020-01-01" }],
    {}
  );
  assert.equal(withHistory.typ, "Z2 Dauer");
  assert.equal(withHistory.typSource, "detected");
});

// hmProKm — Steigungsmaß für die EF-Klick-Scatter-Farbkodierung
// (EfficiencyDetailScatter.tsx), Etappe "EF-Trendlinie + Scatter".
test("mapActivity: hmProKm aus hoehe/km berechnet", () => {
  const ride = mapActivity(
    baseAct({ distance: 25000, total_elevation_gain: 375 }),
    {},
    {},
    {}
  );
  // km = 25000m / 1000, 375 / 25 = 15
  assert.equal(ride.km, 25);
  assert.equal(ride.hmProKm, 15);
});

test("mapActivity: hmProKm ist null ohne Distanz (Division durch 0)", () => {
  const ride = mapActivity(baseAct({ distance: 0, total_elevation_gain: 100 }), {}, {}, {});
  assert.equal(ride.km, 0);
  assert.equal(ride.hmProKm, null);
});

test("mapActivity: hmProKm ist null ohne total_elevation_gain", () => {
  const ride = mapActivity(baseAct({ distance: 25000, total_elevation_gain: undefined }), {}, {}, {});
  assert.equal(ride.hmProKm, null);
});

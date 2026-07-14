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
  assert.equal(ride.typ, "Sweet Spot");
});

test("mapActivity: ohne effectivePlan (Default-Fallback) bleibt Altverhalten möglich", () => {
  // Kein Adjustment übergeben → Default-Parameter greift auf PLANNED_SESSIONS
  // zurück (statisch) statt zu crashen, falls ein Aufrufer effectivePlan
  // weglässt.
  const ride = mapActivity(baseAct({ start_date_local: "2099-01-01T09:00:00" }), {}, {}, {});
  assert.equal(typeof ride.typ, "string");
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
  assert.equal(ride.typ, "Z2");
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
  classifyCooldowns(rides, 265);

  assert.equal(rides[0].typ, "VO2max");
  assert.equal(rides[0].name, "MyWhoosh Crit");
  assert.equal(rides[1].typ, "Ausrollen");
  assert.equal(rides[1].name, "Ausrollen");
});

test("classifyCooldowns: normaler Doppel-Fahrt-Tag (ähnliche Intensität) bleibt unverändert", () => {
  const rides = [
    { date: "2026-06-01", startTime: "2026-06-01T08:00:00", name: "Z2", typ: "Z2", min: 60, np: 150 },
    { date: "2026-06-01", startTime: "2026-06-01T17:00:00", name: "Z2", typ: "Z2", min: 55, np: 145 },
  ];
  classifyCooldowns(rides, 265);

  assert.equal(rides[0].typ, "Z2");
  assert.equal(rides[1].typ, "Z2");
});

test("classifyCooldowns: einzelne Fahrt am Tag bleibt unangetastet", () => {
  const rides = [
    { date: "2026-06-02", startTime: "2026-06-02T08:00:00", name: "Rennen", typ: "Rennen", min: 90, np: 240 },
  ];
  classifyCooldowns(rides, 265);
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
  classifyCooldowns(rides, ftp);

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
  classifyCooldowns(rides, ftp);

  assert.equal(rides[1].typ, "Pendeln");
  assert.equal(rides[1].name, "Pendel-Fahrt");
});

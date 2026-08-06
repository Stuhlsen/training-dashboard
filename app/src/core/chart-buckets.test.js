/* Tests: Tag → Wochen-/Monats-Bucket-Abbildung (core/chart-buckets.js) und
   der geteilte PMC-Skelett-Anker (core/days.js::pmcSkeletonAnchor) — Phase
   5, Schritt 6, Teil B + Monats-Bucket-Vereinheitlichung (s. docs/offene-
   punkte.md). Wochen-Periode: Bucket-Schlüssel ist immer die reine ISO-
   Kalenderwoche des Datums, unabhängig von r.week. Monats-Periode: roher
   "YYYY-MM"-Schlüssel, rein arithmetisch, kein Fahrt-Lookup nötig. */

import { test } from "vitest";
import assert from "node:assert/strict";
import { dateToWeekBucket, weekBucketDateRange } from "./chart-buckets.js";
import { pmcSkeletonAnchor } from "./days.js";

const ride = (dateISO, extra = {}) => ({ dateISO, ...extra });

test("dateToWeekBucket: liefert die ISO-Kalenderwoche des Datums", () => {
  assert.equal(dateToWeekBucket("2026-07-28", []), "2026-KW31");
});

test("dateToWeekBucket: Montag und Sonntag derselben Woche treffen denselben Bucket", () => {
  // 2026-07-27 ist ein Montag, 2026-08-02 der zugehörige Sonntag.
  assert.equal(dateToWeekBucket("2026-07-27", []), "2026-KW31", "Wochenanfang (Montag)");
  assert.equal(dateToWeekBucket("2026-08-02", []), "2026-KW31", "Wochenende (Sonntag)");
});

test("dateToWeekBucket: Monatswechsel innerhalb einer Woche bleibt ein Bucket", () => {
  // Woche Mo 2026-07-27 – So 2026-08-02, Zieltag 01.08.
  assert.equal(dateToWeekBucket("2026-08-01", []), "2026-KW31");
});

test("dateToWeekBucket: Jahreswechsel innerhalb einer Woche — Fallback auf ISO-Kalenderwoche konsistent", () => {
  // Woche Mo 2025-12-29 – So 2026-01-04 (Jahreswechsel).
  const beforeYearEnd = dateToWeekBucket("2025-12-30", []);
  const afterYearStart = dateToWeekBucket("2026-01-02", []);
  assert.equal(beforeYearEnd, afterYearStart, "beide Tage müssen dieselbe ISO-Kalenderwoche treffen");
  assert.match(beforeYearEnd, /^\d{4}-KW\d{2}$/);
});

test("weekBucketDateRange: liefert Montag–Sonntag zu einer ISO-Kalenderwoche", () => {
  const rides = [ride("2026-07-28")];
  assert.deepEqual(weekBucketDateRange("2026-KW31", rides), { from: "2026-07-27", to: "2026-08-02" });
});

test("weekBucketDateRange: unbekannter Bucket-Schlüssel → null", () => {
  const rides = [ride("2026-07-28")];
  assert.equal(weekBucketDateRange("2099-KW01", rides), null);
});

test("weekBucketDateRange ist die Kehrfunktion zu dateToWeekBucket für dieselbe Fahrtenliste", () => {
  const rides = [ride("2026-12-31")]; // Jahreswechsel-Woche
  const bucket = dateToWeekBucket("2027-01-02", rides);
  assert.deepEqual(weekBucketDateRange(bucket, rides), { from: "2026-12-28", to: "2027-01-03" });
});

/* ── period: "month" (Monats-Bucket-Vereinheitlichung, s. docs/offene-punkte.md) ── */

test("dateToWeekBucket: period 'month' liefert den rohen YYYY-MM-Schlüssel", () => {
  assert.equal(dateToWeekBucket("2026-07-28", [], "month"), "2026-07");
  assert.equal(dateToWeekBucket("2026-07-01", [], "month"), "2026-07");
  assert.equal(dateToWeekBucket("2026-07-31", [], "month"), "2026-07");
});

test("weekBucketDateRange: period 'month' liefert den ersten/letzten Tag des Monats, ohne Fahrt-Lookup", () => {
  assert.deepEqual(weekBucketDateRange("2026-07", [], "month"), {
    from: "2026-07-01",
    to: "2026-07-31",
  });
  // Schaltjahr-Februar
  assert.deepEqual(weekBucketDateRange("2028-02", [], "month"), {
    from: "2028-02-01",
    to: "2028-02-29",
  });
});

test("weekBucketDateRange: period 'month' mit ungültigem Schlüssel → null", () => {
  assert.equal(weekBucketDateRange("2026-KW31", [], "month"), null);
  assert.equal(weekBucketDateRange("nicht-valide", [], "month"), null);
});

test("pmcSkeletonAnchor: leeres Array → null", () => {
  assert.equal(pmcSkeletonAnchor([]), null);
  assert.equal(pmcSkeletonAnchor(undefined), null);
});

test("pmcSkeletonAnchor: ein einziger Eintrag mit ctl/atl → dessen Datum", () => {
  const rides = [ride("2026-03-10", { ctl: 40, atl: 45 })];
  assert.equal(pmcSkeletonAnchor(rides), "2026-03-10");
});

test("pmcSkeletonAnchor: mehrere unsortierte Einträge → frühestes Datum mit gesetztem ctl UND atl", () => {
  const rides = [
    ride("2026-05-01", { ctl: 50, atl: 55 }),
    ride("2026-03-10", { ctl: 40, atl: null }), // atl fehlt → zählt nicht als Anker-Kandidat
    ride("2026-04-01", { ctl: 42, atl: 44 }),
  ];
  assert.equal(pmcSkeletonAnchor(rides), "2026-04-01");
});

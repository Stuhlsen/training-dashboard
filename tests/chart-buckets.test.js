/* Tests: Tag → Wochen-Bucket-Abbildung (core/chart-buckets.js) und der
   geteilte PMC-Skelett-Anker (core/days.js::pmcSkeletonAnchor) — Phase 5,
   Schritt 6, Teil B. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { dateToWeekBucket, weekBucketDateRange } from "../assets/js/core/chart-buckets.js";
import { pmcSkeletonAnchor } from "../assets/js/core/days.js";

const ride = (dateISO, extra = {}) => ({ dateISO, ...extra });

test("dateToWeekBucket: Plan-Woche einer Fahrt am selben Tag wird übernommen", () => {
  const rides = [ride("2026-07-28", { week: "W5" })];
  assert.equal(dateToWeekBucket("2026-07-28", rides), "W5");
});

test("dateToWeekBucket: Montag und Sonntag derselben Woche treffen denselben Bucket", () => {
  // 2026-07-27 ist ein Montag, 2026-08-02 der zugehörige Sonntag.
  const rides = [ride("2026-07-29", { week: "W5" })];
  assert.equal(dateToWeekBucket("2026-07-27", rides), "W5", "Wochenanfang (Montag)");
  assert.equal(dateToWeekBucket("2026-08-02", rides), "W5", "Wochenende (Sonntag)");
});

test("dateToWeekBucket: Tag ohne eigene Fahrt findet die Plan-Woche über eine andere Fahrt derselben Kalenderwoche", () => {
  const rides = [ride("2026-07-27", { week: "W5" })]; // Montag, Fahrt
  // Donnerstag derselben Woche, kein eigener Ride-Eintrag
  assert.equal(dateToWeekBucket("2026-07-30", rides), "W5");
});

test("dateToWeekBucket: Monatswechsel innerhalb einer Woche bleibt ein Bucket", () => {
  // Woche Mo 2026-07-27 – So 2026-08-02, Fahrt am 28.07., Zieltag 01.08.
  const rides = [ride("2026-07-28", { week: "P2-W5" })];
  assert.equal(dateToWeekBucket("2026-08-01", rides), "P2-W5");
});

test("dateToWeekBucket: Jahreswechsel innerhalb einer Woche — Fallback auf ISO-Kalenderwoche konsistent", () => {
  // Woche Mo 2025-12-29 – So 2026-01-04 (Jahreswechsel), keine Fahrt vorhanden.
  const noRides = [];
  const beforeYearEnd = dateToWeekBucket("2025-12-30", noRides);
  const afterYearStart = dateToWeekBucket("2026-01-02", noRides);
  assert.equal(beforeYearEnd, afterYearStart, "beide Tage müssen denselben ISO-Wochen-Fallback treffen");
  assert.match(beforeYearEnd, /^\d{4}-KW\d{2}$/);
});

test("dateToWeekBucket: keine Fahrt in der Kalenderwoche → Fallback auf reine ISO-Kalenderwoche", () => {
  const rides = [ride("2026-05-01", { week: "W1" })]; // ganz andere Woche
  const bucket = dateToWeekBucket("2026-07-27", rides);
  assert.equal(bucket, "2026-KW31");
});

test("dateToWeekBucket: ISO-Kalenderwoche als Bucket (kein r.week gesetzt, wie Athlet 2)", () => {
  const rides = [ride("2026-07-28")]; // kein .week → rideWeekKey fällt auf isoWeekKey zurück
  assert.equal(dateToWeekBucket("2026-07-27", rides), "2026-KW31");
});

test("weekBucketDateRange: liefert Montag–Sonntag zu einem bekannten Plan-Wochen-Schlüssel", () => {
  const rides = [ride("2026-07-29", { week: "W5" })];
  assert.deepEqual(weekBucketDateRange("W5", rides), { from: "2026-07-27", to: "2026-08-02" });
});

test("weekBucketDateRange: liefert Montag–Sonntag zu einer ISO-Kalenderwoche", () => {
  const rides = [ride("2026-07-28")];
  assert.deepEqual(weekBucketDateRange("2026-KW31", rides), { from: "2026-07-27", to: "2026-08-02" });
});

test("weekBucketDateRange: unbekannter Bucket-Schlüssel → null", () => {
  const rides = [ride("2026-07-28", { week: "W5" })];
  assert.equal(weekBucketDateRange("W99", rides), null);
});

test("weekBucketDateRange ist die Kehrfunktion zu dateToWeekBucket für dieselbe Fahrtenliste", () => {
  const rides = [ride("2026-12-31", { week: "P2-W1" })]; // Jahreswechsel-Woche
  const bucket = dateToWeekBucket("2027-01-02", rides);
  assert.equal(bucket, "P2-W1");
  assert.deepEqual(weekBucketDateRange(bucket, rides), { from: "2026-12-28", to: "2027-01-03" });
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

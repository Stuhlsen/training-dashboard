/* Tests: scripts/lib/ftp-history.js — ftpAt() (rein, kein Netzwerk).
   loadFtpHistory() (Netzwerk/Login) wird hier bewusst NICHT getestet —
   das Verdrahten in den Sync-Lauf folgt erst in Schritt 3, s. Kommentar
   in ftp-history.js. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { ftpAt } from "../scripts/lib/ftp-history.js";

const HISTORY = [
  { ftpWatt: 166, validFrom: "2026-03-24", source: "ramp-test" },
  { ftpWatt: 193, validFrom: "2026-06-12", source: "ramp-test" },
  { ftpWatt: 210, validFrom: "2026-09-19", source: "ramp-test" },
];

test("ftpAt: Fahrtdatum zwischen zwei Einträgen -> der ältere gilt noch", () => {
  const r = ftpAt(HISTORY, "2026-07-15", 999);
  assert.equal(r.ftpWatt, 193);
  assert.equal(r.source, "ramp-test");
  assert.equal(r.validFrom, "2026-06-12");
});

test("ftpAt: Fahrtdatum vor dem ersten Eintrag -> Fallback mit Markierung", () => {
  const r = ftpAt(HISTORY, "2026-01-01", 150);
  assert.equal(r.ftpWatt, 150);
  assert.equal(r.source, "fallback");
  assert.equal(r.validFrom, null);
});

test("ftpAt: Fahrtdatum exakt am valid_from-Tag -> dieser Eintrag gilt (inklusiv)", () => {
  const r = ftpAt(HISTORY, "2026-06-12", 999);
  assert.equal(r.ftpWatt, 193);
  assert.equal(r.validFrom, "2026-06-12");
});

test("ftpAt: Fahrtdatum nach dem letzten Eintrag -> der neueste gilt", () => {
  const r = ftpAt(HISTORY, "2026-12-01", 999);
  assert.equal(r.ftpWatt, 210);
  assert.equal(r.validFrom, "2026-09-19");
});

test("ftpAt: leere Historie -> Fallback", () => {
  const r = ftpAt([], "2026-07-15", 193);
  assert.equal(r.ftpWatt, 193);
  assert.equal(r.source, "fallback");
});

test("ftpAt: history=null/undefined -> Fallback statt Crash", () => {
  assert.equal(ftpAt(undefined, "2026-07-15", 193).ftpWatt, 193);
  assert.equal(ftpAt(null, "2026-07-15", 193).ftpWatt, 193);
});

test("ftpAt: unsortierte Historie wird trotzdem korrekt aufgelöst", () => {
  const shuffled = [HISTORY[2], HISTORY[0], HISTORY[1]];
  const r = ftpAt(shuffled, "2026-07-15", 999);
  assert.equal(r.ftpWatt, 193);
});

test("ftpAt: source aus der Historie wird durchgereicht, nicht überschrieben", () => {
  const history = [{ ftpWatt: 175, validFrom: "2026-04-01", source: "schaetzung" }];
  const r = ftpAt(history, "2026-05-01", 999);
  assert.equal(r.source, "schaetzung");
});

test("ftpAt: fehlende source in der Historie fällt auf 'history' zurück (nicht 'fallback')", () => {
  const history = [{ ftpWatt: 175, validFrom: "2026-04-01" }];
  const r = ftpAt(history, "2026-05-01", 999);
  assert.equal(r.source, "history");
});

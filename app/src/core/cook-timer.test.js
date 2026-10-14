/* Tests: core/cook-timer.js — reine Timer-Logik, kein DOM, kein Clock.
   Alle Zeitangaben werden als now-Parameter hereingereicht — kein echter
   Timer, kein Warten auf echte Zeit. */

import { test } from "vitest";
import assert from "node:assert/strict";
import {
  startTimer,
  remainingSeconds,
  isExpired,
  formatRemaining,
  formatRestTime,
  resetTimer,
  newlyExpired,
  serializeTimers,
  restoreTimers,
  EXPIRE_STALE_MS,
} from "./cook-timer.js";

/* ── startTimer ────────────────────────────────────────── */

const NOW = 1_700_000_000_000;
const T_ID = "timer-1";
const T_LABEL = "Nudeln kochen";
const DURATION = 120; // 2 min

test("startTimer: erzeugt gueltigen Timer mit endAt = now + durationSeconds * 1000", () => {
  const t = startTimer({ id: T_ID, label: T_LABEL, durationSeconds: DURATION, now: NOW });
  assert.equal(t.id, T_ID);
  assert.equal(t.label, T_LABEL);
  assert.equal(t.durationSeconds, DURATION);
  assert.equal(t.endAt, NOW + DURATION * 1000);
});

test("startTimer: leere id wirft Fehler", () => {
  assert.throws(() => startTimer({ id: "", label: "x", durationSeconds: 60, now: NOW }));
});

test("startTimer: durationSeconds 0 wirft Fehler", () => {
  assert.throws(() => startTimer({ id: "x", label: "x", durationSeconds: 0, now: NOW }));
});

test("startTimer: negative durationSeconds wirft Fehler", () => {
  assert.throws(() => startTimer({ id: "x", label: "x", durationSeconds: -5, now: NOW }));
});

test("startTimer: NaN durationSeconds wirft Fehler", () => {
  assert.throws(() => startTimer({ id: "x", label: "x", durationSeconds: NaN, now: NOW }));
});

test("startTimer: Infinity/negative Infinity durationSeconds wirft Fehler", () => {
  assert.throws(() => startTimer({ id: "x", label: "x", durationSeconds: Infinity, now: NOW }));
  assert.throws(() => startTimer({ id: "x", label: "x", durationSeconds: -Infinity, now: NOW }));
});

/* ── remainingSeconds ──────────────────────────────────── */

test("remainingSeconds: laufender Timer gibt Restdauer", () => {
  const t = startTimer({ id: "x", label: "x", durationSeconds: 300, now: NOW });
  assert.equal(remainingSeconds(t, NOW + 100_000), 200); // 100s vergangen
});

test("remainingSeconds: noch nicht gestartet (kein endAt) -> durationSeconds", () => {
  const t = { id: "x", label: "x", durationSeconds: 300 };
  assert.equal(remainingSeconds(t, NOW), 300);
});

test("remainingSeconds: abgelaufen -> 0", () => {
  const t = startTimer({ id: "x", label: "x", durationSeconds: 10, now: NOW });
  assert.equal(remainingSeconds(t, NOW + 15_000), 0);
});

test("remainingSeconds: nie unter 0 (Zeitsprung nach vorn)", () => {
  const t = startTimer({ id: "x", label: "x", durationSeconds: 10, now: NOW });
  assert.equal(remainingSeconds(t, NOW + 999_999_999), 0);
});

test("remainingSeconds: fast genau abgelaufen -> 0", () => {
  const t = startTimer({ id: "x", label: "x", durationSeconds: 5, now: 1000 });
  // 1 ms Ablauf: endAt = 6000, now = 6001 -> diff = -1 -> Math.ceil(-1/1000) = -1 -> max(0,-1) = 0
  assert.equal(remainingSeconds(t, 6001), 0);
});

/* ── isExpired ─────────────────────────────────────────── */

test("isExpired: abgelaufen -> true", () => {
  const t = startTimer({ id: "x", label: "x", durationSeconds: 10, now: NOW });
  assert.equal(isExpired(t, NOW + 10_001), true);
});

test("isExpired: laufend -> false", () => {
  const t = startTimer({ id: "x", label: "x", durationSeconds: 60, now: NOW });
  assert.equal(isExpired(t, NOW + 30_000), false);
});

test("isExpired: nicht gestartet -> false (kein endAt)", () => {
  const t = { id: "x", label: "x", durationSeconds: 60 };
  assert.equal(isExpired(t, NOW), false);
});

test("isExpired: genau zum Ablaufzeitpunkt -> true", () => {
  const t = startTimer({ id: "x", label: "x", durationSeconds: 10, now: NOW });
  assert.equal(isExpired(t, NOW + 10_000), true);
});

/* ── formatRemaining ───────────────────────────────────── */

test("formatRemaining: unter einer Stunde als MM:SS", () => {
  assert.equal(formatRemaining(0), "00:00");
  assert.equal(formatRemaining(59), "00:59");
  assert.equal(formatRemaining(60), "01:00");
  assert.equal(formatRemaining(599), "09:59");
  assert.equal(formatRemaining(3599), "59:59");
});

test("formatRemaining: ab einer Stunde als H:MM:SS", () => {
  assert.equal(formatRemaining(3600), "1:00:00");
  assert.equal(formatRemaining(3661), "1:01:01");
  assert.equal(formatRemaining(7200), "2:00:00");
  assert.equal(formatRemaining(8 * 3600), "8:00:00");
});

test("formatRemaining: Bruchteile werden abgeschnitten (floor)", () => {
  assert.equal(formatRemaining(59.9), "00:59");
  assert.equal(formatRemaining(60.1), "01:00");
});

test("formatRemaining: negative/NaN/ungueltig -> –", () => {
  assert.equal(formatRemaining(-1), "–");
  assert.equal(formatRemaining(NaN), "–");
  assert.equal(formatRemaining(Infinity), "–");
  // @ts-expect-error Testet Laufzeitverhalten
  assert.equal(formatRemaining("x"), "–");
  assert.equal(formatRemaining(undefined), "–");
  assert.equal(formatRemaining(null), "–");
});

/* ── formatRestTime ────────────────────────────────────── */

test("formatRestTime: Sekunden-Bereich", () => {
  assert.equal(formatRestTime(30), "ca. 30 Sek.");
  assert.equal(formatRestTime(59), "ca. 59 Sek.");
  assert.equal(formatRestTime(0), "ca. 0 Sek.");
});

test("formatRestTime: Minuten-Bereich (60 bis < 3540)", () => {
  assert.equal(formatRestTime(60), "ca. 1 Min.");
  assert.equal(formatRestTime(600), "ca. 10 Min.");
  assert.equal(formatRestTime(3540), "ca. 59 Min.");
});

test("formatRestTime: Stunden-Bereich", () => {
  assert.equal(formatRestTime(3600), "ca. 1 Std.");
  assert.equal(formatRestTime(7200), "ca. 2 Std.");
  assert.equal(formatRestTime(8 * 3600), "ca. 8 Std.");
  assert.equal(formatRestTime(20 * 3600), "ca. 20 Std.");
});

test("formatRestTime: Tage (24h+)", () => {
  assert.equal(formatRestTime(24 * 3600), "ca. 1 Tag");
  assert.equal(formatRestTime(48 * 3600), "ca. 2 Tag");
});

test("formatRestTime: negative/NaN/ungueltig -> –", () => {
  assert.equal(formatRestTime(-1), "–");
  assert.equal(formatRestTime(NaN), "–");
  assert.equal(formatRestTime(Infinity), "–");
});

/* ── resetTimer ────────────────────────────────────────── */

test("resetTimer: RUNNING-Timer -> kein endAt mehr", () => {
  const t = startTimer({ id: "x", label: "x", durationSeconds: 300, now: NOW });
  const r = resetTimer(t);
  assert.equal(r.id, "x");
  assert.equal(r.label, "x");
  assert.equal(r.durationSeconds, 300);
  assert.equal(r.endAt, undefined);
});

test("resetTimer: EXPIRED-Timer -> kein endAt mehr", () => {
  const t = startTimer({ id: "x", label: "x", durationSeconds: 10, now: 1000 });
  const expired = { ...t, endAt: 1000 }; // endAt <= now
  const r = resetTimer(expired);
  assert.equal(r.endAt, undefined);
});

test("resetTimer: Original bleibt unveraendert (pure function)", () => {
  const t = startTimer({ id: "x", label: "x", durationSeconds: 60, now: NOW });
  const copy = { ...t };
  resetTimer(t);
  assert.deepEqual(t, copy);
});

/* ── newlyExpired ──────────────────────────────────────── */

test("newlyExpired: leeres Array, wenn keine Timer abgelaufen", () => {
  const timers = [startTimer({ id: "a", label: "a", durationSeconds: 60, now: NOW })];
  assert.deepEqual(newlyExpired(timers, NOW + 30_000, new Set()), []);
});

test("newlyExpired: ein neu abgelaufener Timer", () => {
  const t = startTimer({ id: "a", label: "a", durationSeconds: 10, now: NOW });
  const ids = newlyExpired([t], NOW + 10_001, new Set());
  assert.deepEqual(ids, ["a"]);
});

test("newlyExpired: ein Timer wird nur genau einmal gemeldet", () => {
  const t = startTimer({ id: "a", label: "a", durationSeconds: 10, now: NOW });
  const already = new Set();
  const first = newlyExpired([t], NOW + 10_001, already);
  assert.deepEqual(first, ["a"]);

  // already hat "a" jetzt
  const second = newlyExpired([t], NOW + 10_001, new Set(first));
  assert.deepEqual(second, []);
});

test("newlyExpired: mehrere Timer, nur einer neu", () => {
  const a = startTimer({ id: "a", label: "a", durationSeconds: 10, now: NOW });
  const b = startTimer({ id: "b", label: "b", durationSeconds: 60, now: NOW });
  // a ist abgelaufen, b läuft noch
  const ids = newlyExpired([a, b], NOW + 10_001, new Set());
  assert.deepEqual(ids, ["a"]);
});

test("newlyExpired: zwei gleichzeitig abgelaufen", () => {
  const a = startTimer({ id: "a", label: "a", durationSeconds: 5, now: NOW });
  const b = startTimer({ id: "b", label: "b", durationSeconds: 5, now: NOW });
  const ids = newlyExpired([a, b], NOW + 5_001, new Set());
  assert.deepEqual(ids, ["a", "b"]);
});

test("newlyExpired: Timer ohne endAt (unstarted) loest nicht aus", () => {
  const t = { id: "x", label: "x", durationSeconds: 60 };
  assert.deepEqual(newlyExpired([t], NOW, new Set()), []);
});

/* ── serializeTimers / restoreTimers ───────────────────── */

test("serializeTimers / restoreTimers: Roundtrip", () => {
  const timers = [
    startTimer({ id: "a", label: "Nudeln", durationSeconds: 120, now: NOW }),
    startTimer({ id: "b", label: "Ruhen", durationSeconds: 600, now: NOW }),
  ];
  const json = serializeTimers(timers);
  const restored = restoreTimers(json, NOW);
  assert.deepEqual(restored, timers);
});

test("restoreTimers: ungueltiges JSON -> leeres Array", () => {
  assert.deepEqual(restoreTimers("", NOW), []);
  assert.deepEqual(restoreTimers("{defekt", NOW), []);
  assert.deepEqual(restoreTimers("null", NOW), []);
  assert.deepEqual(restoreTimers("42", NOW), []);
  // @ts-expect-error Testet Laufzeitverhalten
  assert.deepEqual(restoreTimers(undefined, NOW), []);
});

test("restoreTimers: korrupte Eintraege werden uebersprungen", () => {
  const json = JSON.stringify([
    { id: "a", label: "ok", durationSeconds: 60, endAt: NOW + 60_000 },
    { label: "ohne id", durationSeconds: 60 }, // fehlende id
    { id: "c", durationSeconds: 60 }, // fehlendes label
    { id: "d", label: "NaN duration", durationSeconds: NaN, endAt: NOW + 60_000 },
    { id: "e", label: "negativ", durationSeconds: -5, endAt: NOW + 60_000 },
    null,
    42,
    { id: "f", label: "ok unstarted", durationSeconds: 120 },
  ]);
  const restored = restoreTimers(json, NOW);
  assert.equal(restored.length, 2);
  assert.equal(restored[0].id, "a");
  assert.equal(restored[1].id, "f");
});

test("restoreTimers: zu alt abgelaufene Timer werden verworfen", () => {
  const oldEnd = NOW - EXPIRE_STALE_MS - 60_000; // etwas mehr als 24h her
  const recentEnd = NOW - 60_000; // 1 min her, innerhalb 24h
  const json = JSON.stringify([
    { id: "old", label: "zu alt", durationSeconds: 300, endAt: oldEnd },
    { id: "recent", label: "ok", durationSeconds: 300, endAt: recentEnd },
  ]);
  const restored = restoreTimers(json, NOW);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].id, "recent");
});

test("restoreTimers: Timer ohne endAt (UNSTARTED) bleiben erhalten", () => {
  const json = JSON.stringify([
    { id: "a", label: "noch nicht gestartet", durationSeconds: 60 },
  ]);
  const restored = restoreTimers(json, NOW);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].endAt, undefined);
});

/* ── Zeit nach vorn springen (Zeitreise-Szenario) ─────── */

test("Zeitsprung nach vorn: remainingSeconds gibt 0, isExpired true", () => {
  const t = startTimer({ id: "x", label: "x", durationSeconds: 3600, now: 1000 });
  // now springt 2h nach vorn (weiter als die Dauer)
  assert.equal(remainingSeconds(t, 1000 + 7200_000), 0);
  assert.equal(isExpired(t, 1000 + 7200_000), true);
});

/* ── Timer endet in der Vergangenheit ──────────────────── */

test("Timer mit endAt in der Vergangenheit gilt von Anfang an als expired", () => {
  const t = { id: "x", label: "x", durationSeconds: 60, endAt: 500 };
  assert.equal(isExpired(t, NOW), true);
  assert.equal(remainingSeconds(t, NOW), 0);
});
/* Tests: core/request-guard.js — geteilter Race-Guard für nebenläufige
   Async-Aufrufe (ersetzt das 9x kopierte requestId/openToken-Muster, s.
   docs/offene-punkte.md). Reine Funktion, keine Mocks. */

import { test } from "vitest";
import assert from "node:assert/strict";
import { createRequestGuard } from "./request-guard.js";

test("isCurrent: true direkt nach bump(), solange kein weiterer bump() lief", () => {
  const guard = createRequestGuard();
  const token = guard.bump();
  assert.equal(guard.isCurrent(token), true);
});

test("isCurrent: false, sobald ein neuerer bump() gelaufen ist (überholte Antwort)", () => {
  const guard = createRequestGuard();
  const oldToken = guard.bump();
  const newToken = guard.bump();
  assert.equal(guard.isCurrent(oldToken), false, "der alte Token gilt nicht mehr");
  assert.equal(guard.isCurrent(newToken), true, "der neueste Token gilt weiterhin");
});

test("bump() liefert bei jedem Aufruf einen neuen, aufsteigenden Wert", () => {
  const guard = createRequestGuard();
  const a = guard.bump();
  const b = guard.bump();
  const c = guard.bump();
  assert.ok(a < b && b < c);
});

test("ein reiner Invalidierungs-Bump (Rückgabewert ignoriert, z.B. Logout) entwertet frühere Tokens", () => {
  const guard = createRequestGuard();
  const token = guard.bump();
  guard.bump(); // z.B. bei Logout, ohne den neuen Token zu speichern
  assert.equal(guard.isCurrent(token), false);
});

test("current(): liest das gültige Token, ohne selbst zu bumpen", () => {
  const guard = createRequestGuard();
  const token = guard.bump();
  assert.equal(guard.current(), token);
  assert.equal(guard.current(), token, "wiederholtes Lesen bumpt nicht");
  assert.equal(guard.isCurrent(token), true, "current() selbst hat den Token nicht entwertet");
});

test("zwei unabhängige Guards beeinflussen sich nicht gegenseitig", () => {
  const a = createRequestGuard();
  const b = createRequestGuard();
  const tokenA = a.bump();
  b.bump();
  b.bump();
  assert.equal(a.isCurrent(tokenA), true, "Guard b's bumps dürfen Guard a nicht beeinflussen");
});

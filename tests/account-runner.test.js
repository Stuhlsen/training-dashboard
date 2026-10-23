/* Tests: scripts/lib/account-runner.js (Fahrplan 26 E2, Q4)
   Zeitlimit je Account, Fehlerisolation, Laufzeitmessung. */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runAccount,
  accountTimeoutMs,
  DEFAULT_ACCOUNT_TIMEOUT_MS,
} from "../scripts/lib/account-runner.js";

test("runAccount: Erfolg liefert Wert und gemessene Zeit, Eintrag in timings", async () => {
  const timings = [];
  let t = 1000;
  const now = () => (t += 250);
  const r = await runAccount("a", async () => 42, { timeoutMs: 1000, timings, now });
  assert.equal(r.ok, true);
  assert.equal(r.value, 42);
  assert.equal(r.ms, 250);
  assert.deepEqual(timings, [{ label: "a", ms: 250, ok: true }]);
});

test("runAccount: ein Wurf wird zum Result, nicht zum Abbruch", async () => {
  const r = await runAccount(
    "b",
    async () => {
      throw new Error("kaputt");
    },
    { timeoutMs: 1000 }
  );
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "UNKNOWN");
  assert.match(r.error.message, /kaputt/);
});

test("runAccount: Zeitlimit beendet einen hängenden Account und setzt das Signal", async () => {
  let seen;
  const r = await runAccount(
    "c",
    (signal) => {
      seen = signal;
      return new Promise(() => {}); // hängt für immer
    },
    { timeoutMs: 30 }
  );
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "TIMEOUT");
  assert.equal(seen.aborted, true);
});

test("runAccount: der nächste Account läuft nach einem Timeout normal weiter", async () => {
  const first = await runAccount("hängt", () => new Promise(() => {}), { timeoutMs: 20 });
  const second = await runAccount("läuft", async () => "ok", { timeoutMs: 1000 });
  assert.equal(first.ok, false);
  assert.equal(second.ok, true);
});

test("runAccount: kein Timeout, wenn die Aufgabe rechtzeitig fertig ist (Signal bleibt offen)", async () => {
  let seen;
  const r = await runAccount(
    "d",
    async (signal) => {
      seen = signal;
    },
    { timeoutMs: 1000 }
  );
  assert.equal(r.ok, true);
  assert.equal(seen.aborted, false);
});

test("accountTimeoutMs: Umgebungswert, sonst Standard; Unsinn fällt auf den Standard zurück", () => {
  assert.equal(accountTimeoutMs({ SYNC_ACCOUNT_TIMEOUT_MS: "1500" }), 1500);
  assert.equal(accountTimeoutMs({}), DEFAULT_ACCOUNT_TIMEOUT_MS);
  assert.equal(accountTimeoutMs({ SYNC_ACCOUNT_TIMEOUT_MS: "abc" }), DEFAULT_ACCOUNT_TIMEOUT_MS);
  assert.equal(accountTimeoutMs({ SYNC_ACCOUNT_TIMEOUT_MS: "-5" }), DEFAULT_ACCOUNT_TIMEOUT_MS);
});

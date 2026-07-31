/* Tests: core/ftp-history.js::currentFtpEntry() — reine Auswahlfunktion,
   Frontend-Entsprechung zu scripts/lib/ftp-history.js::ftpAt() (dort
   getestet in tests/ftp-history.test.js). */

import test from "node:test";
import assert from "node:assert/strict";
import { currentFtpEntry } from "../assets/js/core/ftp-history.js";

test("currentFtpEntry: leere Liste → null", () => {
  assert.equal(currentFtpEntry([], "2026-08-01"), null);
});

test("currentFtpEntry: nur zukünftige Einträge → null", () => {
  const entries = [{ id: "a", validFrom: "2099-01-01" }];
  assert.equal(currentFtpEntry(entries, "2026-08-01"), null);
});

test("currentFtpEntry: Eintrag exakt heute → inklusiv zurückgegeben", () => {
  const entries = [{ id: "a", validFrom: "2026-08-01" }];
  assert.equal(currentFtpEntry(entries, "2026-08-01")?.id, "a");
});

test("currentFtpEntry: mehrere gültige Einträge → jüngster gewinnt", () => {
  const entries = [
    { id: "alt", validFrom: "2026-01-01" },
    { id: "neu", validFrom: "2026-06-15" },
  ];
  assert.equal(currentFtpEntry(entries, "2026-08-01")?.id, "neu");
});

test("currentFtpEntry: unsortiert übergeben → trotzdem korrekt jüngster gewählt", () => {
  const entries = [
    { id: "neu", validFrom: "2026-06-15" },
    { id: "alt", validFrom: "2026-01-01" },
    { id: "mittel", validFrom: "2026-03-01" },
  ];
  assert.equal(currentFtpEntry(entries, "2026-08-01")?.id, "neu");
});

test("currentFtpEntry: Default-todayISO ohne expliziten Parameter nutzbar", () => {
  const entries = [{ id: "a", validFrom: "2020-01-01" }];
  assert.equal(currentFtpEntry(entries)?.id, "a");
});

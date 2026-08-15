/* Tests: FTP-Extraktion aus Notion-Freitext (scripts/lib/notion.js) */

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFtpFromNotes } from "../scripts/lib/notion.js";

test("parseFtpFromNotes extrahiert den FTP-Wert aus Freitext", () => {
  assert.equal(parseFtpFromNotes("Ramp Test — Neues FTP: 193 W bestätigt"), 193);
  assert.equal(parseFtpFromNotes("FTP 210W nach Retest"), 210);
  assert.equal(parseFtpFromNotes("Lockere Runde ohne Test"), null);
  assert.equal(parseFtpFromNotes(""), null);
});

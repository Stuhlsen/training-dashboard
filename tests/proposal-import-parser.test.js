/* Tests: core/proposal-import-parser.js — JSON-Block-Extraktion aus einer
   eingefügten Claude-Antwort (Phase 4, Export/Import-Workflow-Konzept §3/§6).
   Reine Funktion, keine Mocks nötig. */

import test from "node:test";
import assert from "node:assert/strict";
import { parseProposalImport } from "../assets/js/core/proposal-import-parser.js";

const VALID = `{
  "schema_version": 1,
  "athlete": "abc-123",
  "source": "claude",
  "proposals": []
}`;

test("parseProposalImport: extrahiert und parst einen einzelnen JSON-Block", () => {
  const text = `Deine Belastung sieht gut aus, keine Änderung nötig.\n\n\`\`\`json\n${VALID}\n\`\`\`\n`;
  const result = parseProposalImport(text);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, { schema_version: 1, athlete: "abc-123", source: "claude", proposals: [] });
});

test("parseProposalImport: nimmt bei mehreren Blöcken deterministisch den LETZTEN", () => {
  const first = `{"schema_version": 1, "athlete": "old", "source": "claude", "proposals": []}`;
  const text = `\`\`\`json\n${first}\n\`\`\`\nText dazwischen\n\`\`\`json\n${VALID}\n\`\`\``;
  const result = parseProposalImport(text);
  assert.equal(result.ok, true);
  assert.equal(result.data.athlete, "abc-123");
});

test("parseProposalImport: kein Codeblock → eigener Fehlerzweig 'Kein JSON-Block gefunden'", () => {
  const result = parseProposalImport("Ich würde nichts ändern, alles passt.");
  assert.equal(result.ok, false);
  assert.match(result.error.message, /Kein JSON-Block/);
});

test("parseProposalImport: leerer/fehlender Text → kein Crash, gleicher Fehlerzweig", () => {
  assert.equal(parseProposalImport("").ok, false);
  assert.equal(parseProposalImport(undefined).ok, false);
});

test("parseProposalImport: beschädigtes JSON im Block → eigener Fehlerzweig", () => {
  const text = "```json\n{ \"schema_version\": 1, \"proposals\": [ \n```";
  const result = parseProposalImport(text);
  assert.equal(result.ok, false);
  assert.match(result.error.message, /beschädigt/);
});

test("parseProposalImport: reines JSON ohne Fences (Codeblock-Kopieren-Klick)", () => {
  const result = parseProposalImport(VALID);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, { schema_version: 1, athlete: "abc-123", source: "claude", proposals: [] });
});

test("parseProposalImport: reines JSON mit umgebendem Whitespace wird getrimmt", () => {
  const result = parseProposalImport(`\n\n  ${VALID}  \n\n`);
  assert.equal(result.ok, true);
  assert.equal(result.data.athlete, "abc-123");
});

test("parseProposalImport: Codeblock OHNE 'json'-Sprachangabe wird erkannt", () => {
  const text = `Passt so, keine Änderung.\n\n\`\`\`\n${VALID}\n\`\`\`\n`;
  const result = parseProposalImport(text);
  assert.equal(result.ok, true);
  assert.equal(result.data.athlete, "abc-123");
});

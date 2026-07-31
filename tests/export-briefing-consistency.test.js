/* Tests: core/export-briefing.js — Doku-Konsistenz (Rumpf + Auftragsvarianten)

   Neu geschrieben (nicht erweitert), s. docs/phase-4-konzept-export-
   richtungsvorgabe.md R4-Korrektur: der frühere Kopfkommentar in
   core/export-briefing.js behauptete, ein Test halte PROMPT_TEMPLATE
   bytegleich gegen docs/phase-4-prompt-vorlage-claude-trainer.md synchron —
   diesen Test gab es nie (tests/export-briefing.test.js prüfte nur
   Regex-Muster im zusammengesetzten Output). Genau diese Lücke ließ die
   Payload-Schema-Lücke zuvor unentdeckt. Dieser Test prüft jetzt tatsächlich
   PROMPT_RUMPF und jede der fünf AUFTRAG_VARIANTEN wörtlich (getrimmt) gegen
   die Doku zwischen den RUMPF-/AUFTRAG-Markern. */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PROMPT_RUMPF, AUFTRAG_VARIANTEN } from "../assets/js/core/export-briefing.js";

const DOC_PATH = path.resolve(
  fileURLToPath(new URL("../docs/phase-4-prompt-vorlage-claude-trainer.md", import.meta.url)),
);
const doc = readFileSync(DOC_PATH, "utf8");

function extractBetween(markerStart, markerEnd) {
  const re = new RegExp(`${markerStart}\\n([\\s\\S]*?)\\n${markerEnd}`);
  const match = doc.match(re);
  if (!match) throw new Error(`Marker-Paar nicht gefunden in der Doku: ${markerStart} / ${markerEnd}`);
  return match[1].trim();
}

test("Rumpf: PROMPT_RUMPF steht wörtlich (getrimmt) zwischen RUMPF-ANFANG/-ENDE in der Doku", () => {
  const docRumpf = extractBetween("<!-- RUMPF-ANFANG -->", "<!-- RUMPF-ENDE -->");
  assert.equal(docRumpf, PROMPT_RUMPF.trim());
});

test("Alle fünf Presets aus AUFTRAG_VARIANTEN sind vertreten — kein fehlender/zusätzlicher Schlüssel", () => {
  assert.deepEqual(Object.keys(AUFTRAG_VARIANTEN).sort(), ["build", "check", "event", "general", "reduce"]);
});

for (const preset of Object.keys(AUFTRAG_VARIANTEN)) {
  test(`Auftragsvariante '${preset}': steht wörtlich (getrimmt) zwischen den AUFTRAG:${preset}-Markern in der Doku`, () => {
    const docVariant = extractBetween(`<!-- AUFTRAG:${preset}-ANFANG -->`, `<!-- AUFTRAG:${preset}-ENDE -->`);
    assert.equal(docVariant, AUFTRAG_VARIANTEN[preset].trim());
  });
}

test("Rumpf enthält den R7-Hinweis (Zusatzkontext darf nie in reason auftauchen)", () => {
  assert.match(
    PROMPT_RUMPF,
    /Zusatzkontext des Athleten darf deine Entscheidung beeinflussen, aber niemals\s+in `reason` auftauchen/,
  );
});

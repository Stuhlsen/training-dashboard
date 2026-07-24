/* ============================================================
   CORE/PROPOSAL-IMPORT-PARSER.JS — JSON-Block aus Claude-Antwort
   extrahieren (kein DOM)
   (Phase 4 — Export/Import-Workflow-Konzept §3, §6)

   Nimmt die KOMPLETTE eingefügte Claude-Antwort (Text + JSON-Block, nicht
   nur den JSON-Teil), sucht darin den LETZTEN ```json-Codeblock und parst
   ihn. Kennt keine Feldregeln — die bleiben vollständig in
   core/proposal-validator.js, damit App-Pfad (menschlicher Trainer) und
   Import-Pfad garantiert dieselbe Prüfung durchlaufen (Konzept §3).
   ============================================================ */

const JSON_BLOCK_RE = /```json\s*([\s\S]*?)```/g;

/** Extrahiert den letzten ```json-Codeblock aus `text` und parst ihn.
 *  Zwei eigene Fehlerzweige (Konzept §6), unterscheidbar von einem späteren
 *  Validierungsfehler: kein Block gefunden ("Copy-Paste-Problem") vs.
 *  beschädigtes JSON (z. B. mitten im Kopieren abgeschnitten).
 *  @param {string} text komplette eingefügte Claude-Antwort
 *  @returns {{ok:true, data:any}|{ok:false, error:{code:string, message:string}}} */
export function parseProposalImport(text) {
  const blocks = [...(text || "").matchAll(JSON_BLOCK_RE)];
  if (!blocks.length) {
    return {
      ok: false,
      error: { code: "SCHEMA", message: "Kein JSON-Block in der eingefügten Antwort gefunden." },
    };
  }
  const last = blocks[blocks.length - 1][1];
  try {
    return { ok: true, data: JSON.parse(last) };
  } catch {
    return {
      ok: false,
      error: { code: "SCHEMA", message: "JSON-Block ist beschädigt/unvollständig." },
    };
  }
}

/* ============================================================
   CORE/PROPOSAL-IMPORT-PARSER.JS — JSON-Block aus Claude-Antwort
   extrahieren (kein DOM)
   (Phase 4 — Export/Import-Workflow-Konzept §3, §6)

   Nimmt die eingefügte Claude-Antwort entgegen — entweder als reines JSON
   (z. B. Ergebnis eines Codeblock-„Kopieren"-Klicks, ohne Fences) oder als
   komplette Antwort mit Fließtext + ```json- bzw. ```-Codeblock — und
   extrahiert daraus das JSON-Objekt. Kennt keine Feldregeln — die bleiben
   vollständig in core/proposal-validator.js, damit App-Pfad (menschlicher
   Trainer) und Import-Pfad garantiert dieselbe Prüfung durchlaufen
   (Konzept §3).
   ============================================================ */

const JSON_BLOCK_RE = /```(?:json)?\s*([\s\S]*?)```/g;

/** Extrahiert das JSON-Objekt aus `text` und parst es.
 *  Reihenfolge: (1) kompletter getrimmter Text direkt als JSON (Fall: reiner
 *  Codeblock-Inhalt ohne Fences), sonst (2) letzter ```json-/```-Codeblock
 *  darin. Zwei eigene Fehlerzweige (Konzept §6), unterscheidbar von einem
 *  späteren Validierungsfehler: kein Block gefunden ("Copy-Paste-Problem")
 *  vs. beschädigtes JSON (z. B. mitten im Kopieren abgeschnitten).
 *  @param {string} text eingefügte Claude-Antwort (Text+Block oder reines JSON)
 *  @returns {{ok:true, data:any}|{ok:false, error:{code:string, message:string}}} */
export function parseProposalImport(text) {
  const trimmed = (text || "").trim();
  if (trimmed) {
    try {
      return { ok: true, data: JSON.parse(trimmed) };
    } catch {
      // kein reines JSON — weiter mit Fences-Erkennung
    }
  }
  const blocks = [...trimmed.matchAll(JSON_BLOCK_RE)];
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

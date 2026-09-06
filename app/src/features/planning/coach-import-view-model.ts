/* ============================================================
   FEATURES/PLANNING/COACH-IMPORT-VIEW-MODEL.TS — Parser-/Validator-Ergebnis
   in eine Live-Feedback-Anzeigeform mappen (Fahrplan 9 Etappe B)

   Reine Funktion, KEIN neuer Parser: usePreviewClaudeImport() (api/hooks/
   useProposals.ts) kapselt weiterhin core/proposal-import-parser.js +
   core/proposal-validator.js inkl. Cache-Zugriff. Das CoachPanel ruft den
   Hook beim (entprellten) Tippen und reicht dessen Ergebnis hier durch —
   diese Datei entscheidet nur, was unter der Antwort-Textarea steht und ob
   „Importieren" aktiv ist. So bleibt die Komponente frei von Auswertungs-
   logik (Schichtenregel, AGENTS.md).
   ============================================================ */

import type { RawImportProposal } from "../../api/hooks/useProposals";

/** Rückgabe von usePreviewClaudeImport(athleteId)(text). */
export type CoachImportPreview =
  | { ok: false; error: { code: string; message: string } }
  | {
      ok: true;
      results: Array<{ proposal: RawImportProposal; valid: boolean; errors: string[] }>;
    };

export interface CoachImportItem {
  op: string;
  describe: string;
  reason: string | null;
  valid: boolean;
  errors: string[];
}

export interface CoachImportFeedback {
  /** Parse- oder Envelope-Fehler (harter Abbruch der ganzen Antwort) —
   *  schließt die Item-Liste aus. */
  parseError: { code: string; message: string } | null;
  /** Anzahl valider Einträge. */
  recognised: number;
  items: CoachImportItem[];
  /** „Importieren" aktiv: mindestens ein valider Eintrag ODER eine gültige
   *  Antwort ohne Vorschläge (0-Vorschläge-Runde ist ein gültiger Abschluss,
   *  Fahrplan §3b). */
  canImport: boolean;
}

/** Menschenlesbare Kurzbeschreibung eines Import-Eintrags (1:1 aus dem
 *  früheren ImportDialog übernommen). */
export function describeImportProposal(p: RawImportProposal): string {
  const date = (p.payload?.plan_date as string | undefined) || "–";
  const title = (p.payload?.title as string | undefined) || "–";
  if (p.op === "add") return `Neu anlegen: ${title} (${date})`;
  if (p.op === "move") return `Verschieben nach ${date}`;
  if (p.op === "cancel") return "Ausfallen lassen";
  return `Ersetzen: ${title} (${date})`;
}

export function buildCoachImportFeedback(preview: CoachImportPreview): CoachImportFeedback {
  if (!preview.ok) {
    return { parseError: preview.error, recognised: 0, items: [], canImport: false };
  }

  const items: CoachImportItem[] = preview.results.map((r) => ({
    op: r.proposal?.op ?? "?",
    describe: describeImportProposal(r.proposal),
    reason: r.proposal?.reason ?? null,
    valid: r.valid,
    errors: r.errors,
  }));
  const recognised = items.filter((i) => i.valid).length;

  return {
    parseError: null,
    recognised,
    items,
    canImport: recognised >= 1 || preview.results.length === 0,
  };
}

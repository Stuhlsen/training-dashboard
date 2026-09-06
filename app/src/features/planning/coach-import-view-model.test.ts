/* Tests: coach-import-view-model.ts — Parser-/Validator-Ergebnis in die
 * Live-Feedback-Anzeigeform mappen (Fahrplan 9 Etappe B). */

import { describe, expect, it } from "vitest";
import {
  buildCoachImportFeedback,
  describeImportProposal,
  type CoachImportPreview,
} from "./coach-import-view-model";
import type { RawImportProposal } from "../../api/hooks/useProposals";

const raw = (over: Partial<RawImportProposal> = {}): RawImportProposal => ({
  op: "move",
  target_card_id: "c1",
  target_updated_at: "2026-09-01T00:00:00Z",
  payload: { plan_date: "2026-09-10" },
  reason: "Beine platt",
  ...over,
});

describe("describeImportProposal", () => {
  it("beschreibt jede Operation", () => {
    expect(describeImportProposal(raw({ op: "add", payload: { title: "SS 3x12", plan_date: "2026-09-12" } }))).toBe(
      "Neu anlegen: SS 3x12 (2026-09-12)",
    );
    expect(describeImportProposal(raw({ op: "move", payload: { plan_date: "2026-09-10" } }))).toBe(
      "Verschieben nach 2026-09-10",
    );
    expect(describeImportProposal(raw({ op: "cancel", payload: null }))).toBe("Ausfallen lassen");
    expect(describeImportProposal(raw({ op: "replace", payload: { title: "Z2", plan_date: "2026-09-11" } }))).toBe(
      "Ersetzen: Z2 (2026-09-11)",
    );
  });

  it("fällt auf – zurück, wenn Datum/Titel fehlen", () => {
    expect(describeImportProposal(raw({ op: "add", payload: null }))).toBe("Neu anlegen: – (–)");
  });
});

describe("buildCoachImportFeedback", () => {
  it("reicht einen Parse-/Envelope-Fehler durch und sperrt den Import", () => {
    const preview: CoachImportPreview = {
      ok: false,
      error: { code: "SCHEMA", message: "Kein JSON-Block in der eingefügten Antwort gefunden." },
    };
    const fb = buildCoachImportFeedback(preview);
    expect(fb.parseError?.message).toMatch(/JSON-Block/);
    expect(fb.items).toEqual([]);
    expect(fb.recognised).toBe(0);
    expect(fb.canImport).toBe(false);
  });

  it("zählt nur valide Einträge als erkannt und erlaubt den Import ab einem", () => {
    const preview: CoachImportPreview = {
      ok: true,
      results: [
        { proposal: raw({ op: "move" }), valid: true, errors: [] },
        { proposal: raw({ op: "cancel" }), valid: false, errors: ["target_card_id ist unbekannt"] },
      ],
    };
    const fb = buildCoachImportFeedback(preview);
    expect(fb.parseError).toBe(null);
    expect(fb.recognised).toBe(1);
    expect(fb.items).toHaveLength(2);
    expect(fb.items[1].errors).toEqual(["target_card_id ist unbekannt"]);
    expect(fb.canImport).toBe(true);
  });

  it("kein valider Eintrag, aber Einträge vorhanden -> Import gesperrt", () => {
    const preview: CoachImportPreview = {
      ok: true,
      results: [{ proposal: raw(), valid: false, errors: ["kaputt"] }],
    };
    expect(buildCoachImportFeedback(preview).canImport).toBe(false);
  });

  it("gültige Antwort ganz ohne Vorschläge -> Import erlaubt (0-Vorschläge-Runde)", () => {
    const preview: CoachImportPreview = { ok: true, results: [] };
    const fb = buildCoachImportFeedback(preview);
    expect(fb.recognised).toBe(0);
    expect(fb.items).toEqual([]);
    expect(fb.canImport).toBe(true);
  });
});

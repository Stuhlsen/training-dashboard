import { describe, expect, it } from "vitest";
import { defaultCandidate } from "./block-dialog-view-model";
import type { SessionFormat } from "../../api/supabase/session-formats";

function format(id: string, evidenceGrade: string): SessionFormat {
  return { id, label: id, targetSystem: "power", currency: "watt", evidenceGrade, blockTargets: [], axes: {} };
}

describe("defaultCandidate", () => {
  it("bevorzugt 'studienlage' vor 'coaching-konsens'", () => {
    const candidates = [format("a", "coaching-konsens"), format("b", "studienlage")];
    expect(defaultCandidate(candidates)?.id).toBe("b");
  });

  it("fällt ohne 'studienlage' auf die erste Kandidatin zurück", () => {
    const candidates = [format("a", "coaching-konsens"), format("b", "coaching-konsens")];
    expect(defaultCandidate(candidates)?.id).toBe("a");
  });

  it("leere Liste -> null", () => {
    expect(defaultCandidate([])).toBeNull();
  });
});

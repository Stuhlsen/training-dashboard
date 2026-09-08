/* Tests: api/hooks/useCadenceTarget.ts — nur die exportierten Konstanten.
   Der Hook selbst (React Query + Supabase) wird hier nicht gerendert; die
   Drift-Assertion hält fest, dass der lokale Default gleich der
   Chart-/Analyse-Konstante bleibt (siehe Kopfkommentar der Hook-Datei). */

import { describe, test, expect } from "vitest";
import {
  DEFAULT_CADENCE_TARGET_RPM,
  CADENCE_TARGET_MIN,
  CADENCE_TARGET_MAX,
} from "./useCadenceTarget";
import { CADENCE_TARGET_RPM } from "../../sports/cycling/metrics";

describe("useCadenceTarget-Konstanten", () => {
  test("Default deckt sich mit sports/cycling/metrics.ts::CADENCE_TARGET_RPM", () => {
    expect(DEFAULT_CADENCE_TARGET_RPM).toBe(CADENCE_TARGET_RPM);
  });

  test("erlaubter Bereich = CHECK-Constraint aus Migration 0036 (60..120)", () => {
    expect(CADENCE_TARGET_MIN).toBe(60);
    expect(CADENCE_TARGET_MAX).toBe(120);
  });
});

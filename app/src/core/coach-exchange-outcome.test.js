/* Tests: core/coach-exchange-outcome.js — Ausgang einer KI-Coach-Runde aus
 * den verknüpften proposals ableiten (Fahrplan 9 Etappe B). */

import { describe, expect, it } from "vitest";
import { deriveCoachExchangeOutcome } from "./coach-exchange-outcome.js";

const p = (groupId, status) => ({ groupId, status });

describe("deriveCoachExchangeOutcome", () => {
  it("null groupId -> empty (Claude schlug nichts vor)", () => {
    expect(deriveCoachExchangeOutcome(null, [])).toBe("empty");
    expect(deriveCoachExchangeOutcome(null, [p("g1", "accepted")])).toBe("empty");
  });

  it("groupId gesetzt, aber keine passende Zeile im Cache -> pending", () => {
    expect(deriveCoachExchangeOutcome("g1", [])).toBe("pending");
    expect(deriveCoachExchangeOutcome("g1", [p("g2", "accepted")])).toBe("pending");
  });

  it("alle Vorschläge der Gruppe offen -> pending", () => {
    expect(deriveCoachExchangeOutcome("g1", [p("g1", "open"), p("g1", "open")])).toBe("pending");
  });

  it("alle entschieden und angenommen -> accepted", () => {
    expect(deriveCoachExchangeOutcome("g1", [p("g1", "accepted"), p("g1", "accepted")])).toBe("accepted");
  });

  it("alle entschieden und abgelehnt/zurückgezogen/veraltet -> rejected", () => {
    expect(
      deriveCoachExchangeOutcome("g1", [p("g1", "rejected"), p("g1", "withdrawn"), p("g1", "stale")]),
    ).toBe("rejected");
  });

  it("teils angenommen, teils abgelehnt -> mixed", () => {
    expect(deriveCoachExchangeOutcome("g1", [p("g1", "accepted"), p("g1", "rejected")])).toBe("mixed");
  });

  it("einer angenommen, einer noch offen -> mixed (Runde noch nicht fertig entschieden)", () => {
    expect(deriveCoachExchangeOutcome("g1", [p("g1", "accepted"), p("g1", "open")])).toBe("mixed");
  });

  it("filtert Fremdgruppen heraus", () => {
    const proposals = [p("g1", "accepted"), p("g2", "rejected"), p("g1", "accepted")];
    expect(deriveCoachExchangeOutcome("g1", proposals)).toBe("accepted");
  });

  it("verträgt null/undefined proposals-Liste", () => {
    expect(deriveCoachExchangeOutcome("g1", null)).toBe("pending");
    expect(deriveCoachExchangeOutcome("g1", undefined)).toBe("pending");
  });
});

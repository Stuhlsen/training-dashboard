/* Tests: decision-seen-storage — localStorage-Teil des Entscheidungs-Banners
 * (Fahrplan 25 S2b, ausgelagert in Fahrplan 29 V3). */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markDecisionSeen, readSeen, writeSeen } from "./decision-seen-storage";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("decision-seen-storage", () => {
  it("liest nichts, solange nichts gespeichert ist", () => {
    expect(readSeen("u1")).toEqual({});
  });

  it("schreibt und liest je Nutzer getrennt", () => {
    writeSeen("u1", { a: "approved" });
    expect(readSeen("u1")).toEqual({ a: "approved" });
    expect(readSeen("u2")).toEqual({});
  });

  it("markDecisionSeen ergänzt den gespeicherten Stand, statt ihn zu ersetzen", () => {
    writeSeen("u1", { a: "approved" });
    markDecisionSeen("u1", { id: "b", status: "approved" });
    expect(readSeen("u1")).toEqual({ a: "approved", b: "approved" });
  });

  it("überschreibt den Status desselben Rezepts", () => {
    writeSeen("u1", { a: "pending" });
    markDecisionSeen("u1", { id: "a", status: "approved" });
    expect(readSeen("u1")).toEqual({ a: "approved" });
  });

  it("übersteht kaputten gespeicherten Inhalt", () => {
    localStorage.setItem("recipe-decisions-seen:u1", "kein json");
    expect(readSeen("u1")).toEqual({});
    markDecisionSeen("u1", { id: "a", status: "approved" });
    expect(readSeen("u1")).toEqual({ a: "approved" });
  });

  it("wirft nicht, wenn localStorage nicht verfügbar ist (Lesen und Schreiben)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blockiert");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blockiert");
    });
    expect(readSeen("u1")).toEqual({});
    expect(() => writeSeen("u1", { a: "approved" })).not.toThrow();
    expect(() => markDecisionSeen("u1", { id: "a", status: "approved" })).not.toThrow();
  });
});

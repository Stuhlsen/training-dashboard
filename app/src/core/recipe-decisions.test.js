import { describe, expect, it } from "vitest";
import { markSeen, parseSeen, seenKey, unseenDecisions } from "./recipe-decisions.js";

const r = (id, status) => ({ id, status, title: `T${id}` });

describe("unseenDecisions", () => {
  it("meldet entschiedene Rezepte ohne gemerkten Stand", () => {
    const result = unseenDecisions([r("a", "approved"), r("b", "rejected")], {});
    expect(result.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("ignoriert offene Rezepte", () => {
    expect(unseenDecisions([r("a", "pending")], {})).toEqual([]);
  });

  it("meldet nichts, wenn der Status schon gezeigt wurde", () => {
    expect(unseenDecisions([r("a", "approved")], { a: "approved" })).toEqual([]);
  });

  it("meldet erneut, wenn sich der Status seit dem gemerkten Stand geändert hat", () => {
    expect(unseenDecisions([r("a", "rejected")], { a: "pending" }).map((x) => x.id)).toEqual(["a"]);
  });
});

describe("markSeen", () => {
  it("merkt sich den Status je Rezept, ohne das Original zu verändern", () => {
    const seen = { x: "approved" };
    const next = markSeen(seen, [r("a", "approved"), r("b", "rejected")]);
    expect(next).toEqual({ x: "approved", a: "approved", b: "rejected" });
    expect(seen).toEqual({ x: "approved" });
  });
});

describe("parseSeen / seenKey", () => {
  it("liest gültiges JSON", () => {
    expect(parseSeen('{"a":"approved"}')).toEqual({ a: "approved" });
  });
  it("macht aus Müll eine leere Map", () => {
    for (const bad of [null, undefined, "", "kaputt", "[1]", "null", '"x"']) expect(parseSeen(bad)).toEqual({});
  });
  it("wirft Nicht-Text-Werte weg", () => {
    expect(parseSeen('{"a":"approved","b":3}')).toEqual({ a: "approved" });
  });
  it("trennt Nutzer über den Schlüssel", () => {
    expect(seenKey("u1")).not.toBe(seenKey("u2"));
  });
});

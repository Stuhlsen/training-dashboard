/* Tests: core/recipe-votes.js — Daumen-Regeln, Anzeige, Zahlen an Rezepte hängen. */

import { describe, expect, it } from "vitest";
import { canVoteRecipe, formatVoteCounts, isValidVote, withVoteStats, VOTE_VALUES } from "./recipe-votes.js";

describe("isValidVote", () => {
  it("kennt nur up und down", () => {
    expect(isValidVote("up")).toBe(true);
    expect(isValidVote("down")).toBe(true);
    for (const bad of ["neutral", "UP", "", null, undefined, 1, true]) expect(isValidVote(bad)).toBe(false);
    expect(VOTE_VALUES).toEqual(["up", "down"]);
  });
});

describe("canVoteRecipe", () => {
  const pending = { status: "pending", submittedBy: "u-other" };

  it("erlaubt einen Daumen auf ein fremdes Rezept in Prüfung", () => {
    expect(canVoteRecipe(pending, "u1")).toBe(true);
  });

  it("sperrt das eigene Rezept", () => {
    expect(canVoteRecipe({ ...pending, submittedBy: "u1" }, "u1")).toBe(false);
  });

  it("sperrt freigegebene und abgelehnte Rezepte (dort gibt es Sterne bzw. nichts)", () => {
    expect(canVoteRecipe({ ...pending, status: "approved" }, "u1")).toBe(false);
    expect(canVoteRecipe({ ...pending, status: "rejected" }, "u1")).toBe(false);
  });

  it("sperrt ohne Anmeldung und ohne Rezept", () => {
    expect(canVoteRecipe(pending, null)).toBe(false);
    expect(canVoteRecipe(pending, "")).toBe(false);
    expect(canVoteRecipe(null, "u1")).toBe(false);
    expect(canVoteRecipe(undefined, "u1")).toBe(false);
  });

  it("ein Rezept ohne Einreicher (Seed) lässt sich bewerten, solange es in Prüfung ist", () => {
    expect(canVoteRecipe({ status: "pending", submittedBy: null }, "u1")).toBe(true);
  });
});

describe("formatVoteCounts", () => {
  it("zeigt dafür und dagegen", () => {
    expect(formatVoteCounts(3, 1)).toBe("3 dafür · 1 dagegen");
    expect(formatVoteCounts(0, 2)).toBe("0 dafür · 2 dagegen");
  });

  it("zeigt ohne Daumen keinen Nullstand", () => {
    expect(formatVoteCounts(0, 0)).toBe("noch keine Daumen");
    expect(formatVoteCounts(undefined, undefined)).toBe("noch keine Daumen");
    expect(formatVoteCounts(NaN, null)).toBe("noch keine Daumen");
  });

  it("ignoriert negative Werte", () => {
    expect(formatVoteCounts(-1, 2)).toBe("0 dafür · 2 dagegen");
  });
});

describe("withVoteStats", () => {
  it("hängt Zahlen an und füllt fehlende mit 0", () => {
    const recipes = [{ id: "a" }, { id: "b" }];
    const out = withVoteStats(recipes, [{ recipeId: "a", up: 3, down: 1 }]);
    expect(out).toEqual([
      { id: "a", voteUp: 3, voteDown: 1 },
      { id: "b", voteUp: 0, voteDown: 0 },
    ]);
  });

  it("verändert die Eingabe nicht und verträgt Müll", () => {
    const recipes = [{ id: "a" }];
    withVoteStats(recipes, [{ recipeId: "a", up: 1, down: 0 }]);
    expect(recipes).toEqual([{ id: "a" }]);
    expect(withVoteStats(null, null)).toEqual([]);
    expect(withVoteStats([{ id: "a" }], undefined)).toEqual([{ id: "a", voteUp: 0, voteDown: 0 }]);
  });
});

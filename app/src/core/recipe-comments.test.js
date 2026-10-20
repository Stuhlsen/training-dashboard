import { describe, expect, it } from "vitest";
import {
  COMMENT_MAX_CHARS,
  canDeleteComment,
  canVoteComment,
  formatCommentDate,
  hasPseudonym,
  remainingChars,
  sortCommentsByThumbs,
  validateCommentText,
} from "./recipe-comments.js";

describe("validateCommentText", () => {
  it("nimmt normalen Text an und trimmt ihn", () => {
    expect(validateCommentText("  Zu wenig Salz.  ")).toEqual({ ok: true, text: "Zu wenig Salz." });
  });

  it("lehnt leeren Text und nur Leerraum ab", () => {
    for (const text of ["", "   ", "\n\t \n", null, undefined, 42]) {
      expect(validateCommentText(text)).toEqual({ ok: false, reason: "empty" });
    }
  });

  it("erlaubt genau 500 Zeichen und lehnt 501 ab", () => {
    expect(validateCommentText("a".repeat(COMMENT_MAX_CHARS)).ok).toBe(true);
    expect(validateCommentText("a".repeat(COMMENT_MAX_CHARS + 1))).toEqual({ ok: false, reason: "too_long" });
  });

  it("zählt nach dem Trimmen", () => {
    expect(validateCommentText(`  ${"a".repeat(COMMENT_MAX_CHARS)}  `).ok).toBe(true);
  });

  it("zählt ein Emoji als ein Zeichen", () => {
    expect(validateCommentText("👍".repeat(COMMENT_MAX_CHARS)).ok).toBe(true);
    expect(validateCommentText("👍".repeat(COMMENT_MAX_CHARS + 1)).ok).toBe(false);
  });

  it("lässt HTML unverändert durch (es wird nur als Text angezeigt)", () => {
    expect(validateCommentText("<b>fett</b> & <script>x</script>")).toEqual({
      ok: true,
      text: "<b>fett</b> & <script>x</script>",
    });
  });
});

describe("remainingChars", () => {
  it("zählt vom Maximum herunter und kann negativ werden", () => {
    expect(remainingChars("")).toBe(500);
    expect(remainingChars("abc")).toBe(497);
    expect(remainingChars("a".repeat(502))).toBe(-2);
    expect(remainingChars(undefined)).toBe(500);
  });
});

describe("hasPseudonym", () => {
  it("ist wahr bei einem eigenen Namen", () => {
    expect(hasPseudonym("RadFuchs", "max.muster@example.org")).toBe(true);
  });

  it("ist falsch bei leerem oder fehlendem Namen", () => {
    expect(hasPseudonym("", "a@example.org")).toBe(false);
    expect(hasPseudonym("   ", "a@example.org")).toBe(false);
    expect(hasPseudonym(null, "a@example.org")).toBe(false);
    expect(hasPseudonym(undefined, undefined)).toBe(false);
  });

  it("ist falsch, wenn der Name dem E-Mail-Teil vor dem @ gleicht (ohne Groß-/Kleinschreibung)", () => {
    expect(hasPseudonym("max.muster", "max.muster@example.org")).toBe(false);
    expect(hasPseudonym("  Max.Muster ", "MAX.muster@example.org")).toBe(false);
  });

  it("ist wahr, wenn die E-Mail unbekannt ist und der Name gesetzt", () => {
    expect(hasPseudonym("RadFuchs", null)).toBe(true);
  });
});

describe("sortCommentsByThumbs", () => {
  const c = (id, up, down, createdAt) => ({ id, up, down, createdAt });

  it("sortiert nach hoch minus runter, absteigend", () => {
    const list = [c("a", 1, 0, "2026-10-01"), c("b", 5, 1, "2026-10-02"), c("c", 0, 3, "2026-10-03")];
    expect(sortCommentsByThumbs(list).map((x) => x.id)).toEqual(["b", "a", "c"]);
  });

  it("bei Gleichstand zuerst der ältere Kommentar, danach nach ID", () => {
    const list = [c("z", 0, 0, "2026-10-03"), c("y", 0, 0, "2026-10-01"), c("x", 0, 0, "2026-10-01")];
    expect(sortCommentsByThumbs(list).map((x) => x.id)).toEqual(["x", "y", "z"]);
  });

  it("verändert die Eingabe nicht und verträgt Unsinn", () => {
    const list = [c("a", 0, 1, "2026-10-01"), c("b", 1, 0, "2026-10-01")];
    const copy = [...list];
    sortCommentsByThumbs(list);
    expect(list).toEqual(copy);
    expect(sortCommentsByThumbs(null)).toEqual([]);
  });
});

describe("canVoteComment / canDeleteComment", () => {
  it("Daumen nur auf fremde Kommentare und nur angemeldet", () => {
    expect(canVoteComment({ isMine: false }, "u1")).toBe(true);
    expect(canVoteComment({ isMine: true }, "u1")).toBe(false);
    expect(canVoteComment({ isMine: false }, null)).toBe(false);
    expect(canVoteComment(null, "u1")).toBe(false);
  });

  it("Löschen: Schreiber den eigenen, Admin jeden, sonst niemand", () => {
    expect(canDeleteComment({ isMine: true }, false)).toBe(true);
    expect(canDeleteComment({ isMine: false }, true)).toBe(true);
    expect(canDeleteComment({ isMine: false }, false)).toBe(false);
    expect(canDeleteComment(null, true)).toBe(false);
  });
});

describe("formatCommentDate", () => {
  it("formatiert TT.MM.JJJJ", () => {
    expect(formatCommentDate("2026-10-05T12:00:00Z")).toBe("05.10.2026");
  });

  it("gibt bei Unsinn einen leeren Text zurück", () => {
    expect(formatCommentDate("")).toBe("");
    expect(formatCommentDate(null)).toBe("");
    expect(formatCommentDate("kein datum")).toBe("");
  });
});

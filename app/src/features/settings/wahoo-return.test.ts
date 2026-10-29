import { describe, expect, it } from "vitest";
import { parseWahooReturn, WAHOO_RETURN_PARAMS } from "./wahoo-return";

const p = (q: string) => new URLSearchParams(q);

describe("parseWahooReturn", () => {
  it("liefert null, wenn kein wahoo-Parameter da ist", () => {
    expect(parseWahooReturn(p(""))).toBeNull();
    expect(parseWahooReturn(p("foo=bar"))).toBeNull();
  });

  it("erkennt ?wahoo=connected", () => {
    expect(parseWahooReturn(p("wahoo=connected"))).toEqual({ kind: "connected", message: "Wahoo ist verbunden." });
  });

  it("übersetzt jeden bekannten Fehlergrund", () => {
    for (const reason of ["state_invalid", "state_expired", "denied", "missing_code", "exchange", "storage"]) {
      const r = parseWahooReturn(p(`wahoo=error&reason=${reason}`));
      expect(r?.kind).toBe("error");
      expect(r?.message).toMatch(/\S/);
    }
  });

  it("fällt bei unbekanntem oder fehlendem Grund auf eine allgemeine Meldung zurück", () => {
    const unknown = parseWahooReturn(p("wahoo=error&reason=zzz"));
    const missing = parseWahooReturn(p("wahoo=error"));
    expect(unknown?.kind).toBe("error");
    expect(missing).toEqual(unknown);
  });

  it("ignoriert andere wahoo-Werte", () => {
    expect(parseWahooReturn(p("wahoo=nope"))).toBeNull();
  });

  it("nennt die zu entfernenden Parameter", () => {
    expect(WAHOO_RETURN_PARAMS).toEqual(["wahoo", "reason"]);
  });
});

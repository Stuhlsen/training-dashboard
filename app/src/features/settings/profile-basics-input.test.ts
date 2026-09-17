import { describe, expect, test } from "vitest";
import {
  parseRestingHrInput,
  parseHrMaxInput,
  parseHeightCmInput,
  parseWeightKgInput,
  parseBirthdateInput,
} from "./profile-basics-input";

describe("parseRestingHrInput", () => {
  test("leer -> null", () => {
    expect(parseRestingHrInput("")).toEqual({ ok: true, value: null });
    expect(parseRestingHrInput("  ")).toEqual({ ok: true, value: null });
  });
  test("Bereichsgrenzen 30/100 inklusive", () => {
    expect(parseRestingHrInput("30")).toEqual({ ok: true, value: 30 });
    expect(parseRestingHrInput("100")).toEqual({ ok: true, value: 100 });
  });
  test("außerhalb -> Fehler", () => {
    expect(parseRestingHrInput("29").ok).toBe(false);
    expect(parseRestingHrInput("101").ok).toBe(false);
  });
  test("keine Ganzzahl -> Fehler", () => {
    expect(parseRestingHrInput("52.5").ok).toBe(false);
    expect(parseRestingHrInput("abc").ok).toBe(false);
  });
});

describe("parseHrMaxInput", () => {
  test("Bereichsgrenzen 100/230 inklusive", () => {
    expect(parseHrMaxInput("100")).toEqual({ ok: true, value: 100 });
    expect(parseHrMaxInput("230")).toEqual({ ok: true, value: 230 });
  });
  test("außerhalb -> Fehler", () => {
    expect(parseHrMaxInput("99").ok).toBe(false);
    expect(parseHrMaxInput("231").ok).toBe(false);
  });
});

describe("parseHeightCmInput", () => {
  test("Bereichsgrenzen 100/250 inklusive", () => {
    expect(parseHeightCmInput("100")).toEqual({ ok: true, value: 100 });
    expect(parseHeightCmInput("250")).toEqual({ ok: true, value: 250 });
  });
  test("außerhalb -> Fehler", () => {
    expect(parseHeightCmInput("99").ok).toBe(false);
    expect(parseHeightCmInput("251").ok).toBe(false);
  });
});

describe("parseWeightKgInput", () => {
  test("leer -> null", () => {
    expect(parseWeightKgInput("")).toEqual({ ok: true, value: null });
  });
  test("0 und 400 sind exklusiv -> Fehler", () => {
    expect(parseWeightKgInput("0").ok).toBe(false);
    expect(parseWeightKgInput("400").ok).toBe(false);
  });
  test("gültiger Wert mit einer Nachkommastelle", () => {
    expect(parseWeightKgInput("74.5")).toEqual({ ok: true, value: 74.5 });
  });
  test("mehr als eine Nachkommastelle wird auf DB-Präzision gerundet", () => {
    expect(parseWeightKgInput("74.55")).toEqual({ ok: true, value: 74.6 });
  });
  test("keine Zahl -> Fehler", () => {
    expect(parseWeightKgInput("abc").ok).toBe(false);
  });
});

describe("parseBirthdateInput", () => {
  const today = new Date("2026-09-17T12:00:00Z");

  test("leer -> null", () => {
    expect(parseBirthdateInput("", today)).toEqual({ ok: true, value: null });
  });
  test("gültiges Datum in der Vergangenheit", () => {
    expect(parseBirthdateInput("1990-05-01", today)).toEqual({ ok: true, value: "1990-05-01" });
  });
  test("heute oder in der Zukunft -> Fehler", () => {
    expect(parseBirthdateInput("2026-09-17", today).ok).toBe(false);
    expect(parseBirthdateInput("2026-09-18", today).ok).toBe(false);
  });
  test("1900-01-01 oder davor -> Fehler", () => {
    expect(parseBirthdateInput("1900-01-01", today).ok).toBe(false);
    expect(parseBirthdateInput("1899-12-31", today).ok).toBe(false);
  });
  test("ungültiges Datum -> Fehler", () => {
    expect(parseBirthdateInput("nicht-datum", today).ok).toBe(false);
  });
});

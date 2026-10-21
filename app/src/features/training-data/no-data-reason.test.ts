/* Tests: pickNoDataReason() — Leer-Hinweis je Lage (Fahrplan 26 E4). */

import { describe, expect, it } from "vitest";
import { pickNoDataReason } from "./no-data-reason";

describe("pickNoDataReason", () => {
  it("eigenes Profil ohne Zugangsdaten → missing-credentials", () => {
    expect(pickNoDataReason({ isSelf: true, credentialsLoading: false, hasCredentials: false })).toBe(
      "missing-credentials",
    );
  });

  it("eigenes Profil mit Zugangsdaten → awaiting-sync", () => {
    expect(pickNoDataReason({ isSelf: true, credentialsLoading: false, hasCredentials: true })).toBe(
      "awaiting-sync",
    );
  });

  it("Zugangsdaten laden noch → unknown (kein falscher Hinweis)", () => {
    expect(pickNoDataReason({ isSelf: true, credentialsLoading: true, hasCredentials: false })).toBe("unknown");
  });

  it("fremdes Profil → unknown, egal was eigene Zugangsdaten sagen", () => {
    expect(pickNoDataReason({ isSelf: false, credentialsLoading: false, hasCredentials: false })).toBe("unknown");
    expect(pickNoDataReason({ isSelf: false, credentialsLoading: false, hasCredentials: true })).toBe("unknown");
  });
});

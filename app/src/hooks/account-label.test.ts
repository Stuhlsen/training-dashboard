import { describe, it, expect } from "vitest";
import { accountLabel } from "./account-label";
import type { Profile } from "../api/types";

/** Nur die Grenzfälle der Fallback-Kette — der Hook selbst ist reine
 *  Verdrahtung, die Komponente reines Rendering. */
const profile = (displayName: string | null): Profile => ({ displayName }) as Profile;

describe("accountLabel", () => {
  it("nimmt den Profilnamen, wenn gesetzt", () => {
    expect(accountLabel(profile("Stuhlsen"), { email: "a@b.de" })).toBe("Stuhlsen");
  });

  it("fällt auf die E-Mail zurück, solange kein Name da ist", () => {
    expect(accountLabel(profile(null), { email: "a@b.de" })).toBe("a@b.de");
    expect(accountLabel(null, { email: "a@b.de" })).toBe("a@b.de");
  });

  it("ignoriert reine Leerraum-Namen", () => {
    expect(accountLabel(profile("   "), { email: "a@b.de" })).toBe("a@b.de");
  });

  it("neutraler Fallback, wenn weder Profil noch E-Mail da sind", () => {
    expect(accountLabel(null, null)).toBe("Konto");
    expect(accountLabel(profile(null), { email: null })).toBe("Konto");
  });
});

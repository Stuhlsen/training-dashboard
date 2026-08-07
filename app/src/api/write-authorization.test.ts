/* Tests: canWriteForAthlete() / isSelfAthlete().
 *
 * Verhaltens-Spezifikation ist tests/write-authorization.test.js (Vanilla).
 * Die Fälle spiegeln die drei RLS-Bedingungen für die UI-Sichtbarkeit:
 * athlete_id = auth.uid() OR is_coach_of(athlete_id) OR is_admin().
 *
 * Beide Funktionen sind gewöhnliche async-Funktionen, kein Hook — deshalb
 * ohne React-Geschirr prüfbar, nur mit einem eigenen QueryClient für den
 * UUID-Cache. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "./types";

let getProfileByDisplayNameCalls = 0;

vi.mock("./supabase/profiles", () => ({
  findProfileIdByDisplayName: async (name: string) => ({
    ok: true,
    id: name === "hc_diZee" ? "profile-uuid-dizee" : "profile-uuid-stuhlsen",
  }),
  getProfileByDisplayName: async (name: string) => {
    getProfileByDisplayNameCalls++;
    return name === "hc_diZee"
      ? { ok: true, profile: { id: "profile-uuid-dizee", coachId: "coach-uuid-dz" } }
      : { ok: true, profile: { id: "profile-uuid-stuhlsen", coachId: "coach-uuid-st" } };
  },
}));

const { createQueryClient } = await import("./queryClient");
const { canWriteForAthlete, isSelfAthlete, resolveTrainerContext } = await import("./write-authorization");

/** Nur die Felder, die der Check tatsächlich liest. */
const profile = (over: Partial<Profile> & { id: string }): Profile =>
  ({
    displayName: null,
    role: "athlete",
    coachId: null,
    wellbeingPublic: false,
    isAdmin: false,
    ladderProgressionEnabled: false,
    ...over,
  }) as Profile;

const STUHLSEN = profile({ id: "profile-uuid-stuhlsen", role: "athlete" });
const COACH_DZ = profile({ id: "coach-uuid-dz", role: "coach" });
const COACH_ST = profile({ id: "coach-uuid-st", role: "coach" });
const ADMIN = profile({ id: "irgendein-admin-uuid", role: "athlete", isAdmin: true });

let qc = createQueryClient();

beforeEach(() => {
  qc = createQueryClient();
  getProfileByDisplayNameCalls = 0;
});

describe("canWriteForAthlete", () => {
  it("nicht eingeloggt → false", async () => {
    expect(await canWriteForAthlete(qc, null, "athlete1")).toBe(false);
  });

  it("Athlet betrachtet die eigene Seite → true, ohne Trainer-Lookup", async () => {
    expect(await canWriteForAthlete(qc, STUHLSEN, "athlete1")).toBe(true);
    expect(getProfileByDisplayNameCalls).toBe(0);
  });

  it("eingeloggter Athlet ohne Beziehung zum angezeigten Athleten → false", async () => {
    expect(await canWriteForAthlete(qc, STUHLSEN, "athlete2")).toBe(false);
  });

  it("ein Nicht-Coach löst gar keinen Trainer-Lookup aus", async () => {
    await canWriteForAthlete(qc, STUHLSEN, "athlete2");
    expect(getProfileByDisplayNameCalls).toBe(0);
  });

  it("Trainer des angezeigten Athleten → true", async () => {
    expect(await canWriteForAthlete(qc, COACH_DZ, "athlete2")).toBe(true);
  });

  it("Trainer eines ANDEREN Athleten → false", async () => {
    expect(await canWriteForAthlete(qc, COACH_ST, "athlete2")).toBe(false);
  });

  it("Admin → true unabhängig vom angezeigten Athleten", async () => {
    expect(await canWriteForAthlete(qc, ADMIN, "athlete1")).toBe(true);
    expect(await canWriteForAthlete(qc, ADMIN, "athlete2")).toBe(true);
  });
});

/* isSelfAthlete unterscheidet "ich schreibe für mich" von "ich darf hier
   schreiben" — canWriteForAthlete liefert bei Trainer/Admin ebenfalls true,
   obwohl der Athlet ein anderer ist. Genau dieser Unterschied fehlte im
   Dialog-Titel, der den Vorfall vom 31.07.2026 ausgelöst hat. */

describe("isSelfAthlete", () => {
  it("nicht eingeloggt → false", async () => {
    expect(await isSelfAthlete(qc, null, "athlete1")).toBe(false);
  });

  it("Athlet betrachtet die eigene Seite → true", async () => {
    expect(await isSelfAthlete(qc, STUHLSEN, "athlete1")).toBe(true);
  });

  it("Admin schreibt für einen ANDEREN Athleten → false, obwohl er darf", async () => {
    expect(await canWriteForAthlete(qc, ADMIN, "athlete2")).toBe(true);
    expect(await isSelfAthlete(qc, ADMIN, "athlete2")).toBe(false);
  });

  it("Trainer schreibt für seinen Athleten → false, obwohl er darf", async () => {
    expect(await canWriteForAthlete(qc, COACH_DZ, "athlete2")).toBe(true);
    expect(await isSelfAthlete(qc, COACH_DZ, "athlete2")).toBe(false);
  });
});

/* resolveTrainerContext ist der aus canWriteForAthlete() extrahierte
   Coach-Zweig (Etappe 7a) — liefert zusätzlich die Supabase-Profil-UUID
   des Athleten, die die Trainer-Leiste für trainer_view_prefs braucht. */

describe("resolveTrainerContext", () => {
  it("nicht eingeloggt → isTrainer:false, kein Lookup", async () => {
    expect(await resolveTrainerContext(null, "athlete1")).toEqual({ isTrainer: false, athleteProfileId: null });
    expect(getProfileByDisplayNameCalls).toBe(0);
  });

  it("ein Nicht-Coach löst keinen Lookup aus", async () => {
    expect(await resolveTrainerContext(STUHLSEN, "athlete2")).toEqual({ isTrainer: false, athleteProfileId: null });
    expect(getProfileByDisplayNameCalls).toBe(0);
  });

  it("Trainer des angezeigten Athleten → isTrainer:true + korrekte athleteProfileId", async () => {
    expect(await resolveTrainerContext(COACH_DZ, "athlete2")).toEqual({
      isTrainer: true,
      athleteProfileId: "profile-uuid-dizee",
    });
  });

  it("Trainer eines ANDEREN Athleten → isTrainer:false, athleteProfileId trotzdem gefüllt", async () => {
    expect(await resolveTrainerContext(COACH_ST, "athlete2")).toEqual({
      isTrainer: false,
      athleteProfileId: "profile-uuid-dizee",
    });
  });
});

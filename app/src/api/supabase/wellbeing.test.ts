/* Tests: api/supabase/wellbeing.ts — Query-Aufbau, Row-Mapping,
 * Result-Konvention. Portiert aus tests/wellbeing.test.js (Vanilla), Aufbau
 * unverändert: client.ts wird durch den Fake-Client ersetzt, geprüft wird
 * der Adapter selbst, nicht die Hooks darüber. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabaseClient } from "../../test/fake-supabase-client";

const fakeClient = createFakeSupabaseClient();
let authed = true;

vi.mock("./client", () => ({
  supabase: fakeClient,
  getAuthedClient: async () => (authed ? fakeClient : null),
  isSupabaseConfigured: true,
}));

const { upsertToday, getRange, getSharedRange } = await import("./wellbeing");

beforeEach(() => {
  authed = true;
});

describe("upsertToday", () => {
  it("sendet die Felder als Upsert auf (athlete_id, date) und mappt die Antwort", async () => {
    fakeClient.handlers.wellbeing = (calls) => {
      expect(calls.method).toBe("upsert");
      expect(calls.payload).toEqual({
        athlete_id: "athlete-uuid",
        date: "2026-07-24",
        energy: 4,
        muscle_feel: 3,
        mood: 5,
        note: "Kopf dicht",
      });
      expect(calls.upsertOpts?.onConflict).toBe("athlete_id,date");
      return {
        data: {
          id: "row-1",
          date: "2026-07-24",
          energy: 4,
          muscle_feel: 3,
          mood: 5,
          note: "Kopf dicht",
          updated_at: "2026-07-24T10:00:00Z",
        },
        error: null,
      };
    };

    const result = await upsertToday("athlete-uuid", "2026-07-24", {
      energy: 4,
      muscleFeel: 3,
      mood: 5,
      note: "Kopf dicht",
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.checkin).toEqual({
      id: "row-1",
      date: "2026-07-24",
      energy: 4,
      muscleFeel: 3,
      mood: 5,
      note: "Kopf dicht",
      updatedAt: "2026-07-24T10:00:00Z",
    });
  });

  it("setzt eine fehlende Notiz auf null statt undefined", async () => {
    fakeClient.handlers.wellbeing = (calls) => {
      expect((calls.payload as Record<string, unknown>).note).toBeNull();
      return {
        data: { id: "row-2", date: "2026-07-24", energy: 3, muscle_feel: 3, mood: 3, note: null, updated_at: "t" },
        error: null,
      };
    };
    const result = await upsertToday("athlete-uuid", "2026-07-24", { energy: 3, muscleFeel: 3, mood: 3 });
    expect(result.ok && result.checkin.note).toBeNull();
  });

  it("gibt bei einem Supabase-Fehler ein Fehler-Result zurück", async () => {
    fakeClient.handlers.wellbeing = () => ({ data: null, error: { message: "constraint violation" } });
    const result = await upsertToday("athlete-uuid", "2026-07-24", { energy: 1, muscleFeel: 1, mood: 1, note: null });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({ code: "UNKNOWN", message: "constraint violation" });
  });
});

describe("getRange", () => {
  it("filtert nach athlete_id + Datumsbereich und sortiert aufsteigend", async () => {
    fakeClient.handlers.wellbeing = (calls) => {
      expect(calls.select).toBe("id, date, energy, muscle_feel, mood, note, updated_at");
      expect(calls.filters).toEqual([
        { op: "eq", col: "athlete_id", val: "athlete-uuid" },
        { op: "gte", col: "date", val: "2026-07-23" },
        { op: "lte", col: "date", val: "2026-07-24" },
      ]);
      expect(calls.order).toEqual({ col: "date", ascending: true });
      return {
        data: [
          { id: "r1", date: "2026-07-23", energy: 3, muscle_feel: 3, mood: 3, note: null, updated_at: "t1" },
          { id: "r2", date: "2026-07-24", energy: 4, muscle_feel: 4, mood: 4, note: "gut", updated_at: "t2" },
        ],
        error: null,
      };
    };
    const result = await getRange("athlete-uuid", "2026-07-23", "2026-07-24");
    expect(result.ok && result.checkins).toHaveLength(2);
    expect(result.ok && result.checkins[1].muscleFeel).toBe(4);
    expect(result.ok && result.checkins[1].note).toBe("gut");
  });

  it("liefert leer statt eines Fehlers, wenn keine Session vorliegt", async () => {
    authed = false;
    const result = await getRange("athlete-uuid", "2026-07-23", "2026-07-24");
    expect(result.ok && result.checkins).toEqual([]);
  });

  it("gibt bei einem Supabase-Fehler ein Fehler-Result zurück", async () => {
    fakeClient.handlers.wellbeing = () => ({ data: null, error: { message: "network down" } });
    const result = await getRange("athlete-uuid", "2026-07-23", "2026-07-24");
    expect(!result.ok && result.error.message).toBe("network down");
  });
});

describe("getSharedRange (wellbeing_shared)", () => {
  it("fragt die View ohne note-Spalte ab", async () => {
    fakeClient.handlers.wellbeing_shared = (calls) => {
      expect(calls.select).toBe("date, energy, muscle_feel, mood");
      expect(calls.filters).toEqual([
        { op: "eq", col: "athlete_id", val: "athlete-uuid" },
        { op: "gte", col: "date", val: "2026-07-24" },
        { op: "lte", col: "date", val: "2026-07-24" },
      ]);
      return { data: [{ date: "2026-07-24", energy: 5, muscle_feel: 4, mood: 5 }], error: null };
    };
    const result = await getSharedRange("athlete-uuid", "2026-07-24", "2026-07-24");
    expect(result.ok && result.checkins).toEqual([
      { date: "2026-07-24", energy: 5, muscleFeel: 4, mood: 5 },
    ]);
    // note darf im Shared-Ergebnis nie auftauchen — die View liefert sie
    // gar nicht erst, und der Mapper baut sie auch nicht dazu.
    expect(result.ok && "note" in result.checkins[0]).toBe(false);
  });

  it("liefert leer, wenn der Athlet wellbeing_public nicht aktiviert hat", async () => {
    fakeClient.handlers.wellbeing_shared = () => ({ data: [], error: null });
    const result = await getSharedRange("athlete-uuid", "2026-07-24", "2026-07-24");
    expect(result.ok && result.checkins).toEqual([]);
  });

  it("braucht keinen authentifizierten Client", async () => {
    authed = false;
    fakeClient.handlers.wellbeing_shared = () => ({
      data: [{ date: "2026-07-24", energy: 3, muscle_feel: 3, mood: 3 }],
      error: null,
    });
    const result = await getSharedRange("athlete-uuid", "2026-07-24", "2026-07-24");
    expect(result.ok && result.checkins).toHaveLength(1);
  });

  it("gibt bei einem Supabase-Fehler ein Fehler-Result zurück", async () => {
    fakeClient.handlers.wellbeing_shared = () => ({ data: null, error: { message: "view error" } });
    const result = await getSharedRange("athlete-uuid", "2026-07-24", "2026-07-24");
    expect(!result.ok && result.error.message).toBe("view error");
  });
});

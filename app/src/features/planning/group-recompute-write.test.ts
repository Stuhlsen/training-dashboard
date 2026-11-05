/* Tests: features/planning/group-recompute-write.ts — Fahrplan 44 E6.
   Der Schreibweg für verknüpfte Pläne: erst alles sichern, dann je Plan
   löschen → einfügen → Zeile aktualisieren; scheitert ein Schritt, werden alle
   schon angefassten Pläne aus der Sicherung wiederhergestellt. Adapter
   gemockt, Ablauf echt. Keine Postgres-RPC. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Result, TrainingPlan } from "../../api/types";

const calls: string[] = [];
const created: Array<{ planId: string; cards: Array<{ date: string; name: string }> }> = [];
/** Skript: Schlüssel "<aktion>:<planId>" → Ergebnisse je Aufruf (danach ok). */
let script: Record<string, Array<Result<Record<string, unknown>>>> = {};
let backups: Record<string, unknown[]> = {};

function next(key: string): Result<Record<string, unknown>> {
  const queue = script[key];
  return queue?.length ? queue.shift()! : { ok: true };
}
const boom = (message: string): Result<Record<string, unknown>> => ({
  ok: false,
  error: { code: "UNKNOWN", message },
});

vi.mock("../../api/supabase/plan-cards", () => ({
  listReplaceablePlanCardsForPlan: async (planId: string, from: string) => {
    calls.push(`list(${planId},${from})`);
    const r = next(`list:${planId}`);
    return r.ok ? { ok: true, cards: backups[planId] ?? [] } : r;
  },
  deleteFuturePlanCardsForPlan: async (planId: string, from: string) => {
    calls.push(`delete(${planId},${from})`);
    const r = next(`delete:${planId}`);
    return r.ok ? { ok: true, deleted: 1 } : r;
  },
  createPlanCards: async (_p: string, planId: string, cards: Array<{ date: string; name: string }>) => {
    calls.push(`create(${planId},n=${cards.length})`);
    created.push({ planId, cards });
    const r = next(`create:${planId}`);
    return r.ok ? { ok: true, cards: [] } : r;
  },
}));

vi.mock("../../api/supabase/training-plans", () => ({
  updateTrainingPlan: async (planId: string) => {
    calls.push(`update(${planId})`);
    const r = next(`update:${planId}`);
    return r.ok ? { ok: true, plan: { id: planId } } : r;
  },
  restoreTrainingPlanValues: async (planId: string) => {
    calls.push(`restoreRow(${planId})`);
    const r = next(`restoreRow:${planId}`);
    return r.ok ? { ok: true, plan: { id: planId } } : r;
  },
}));

const { writeGroupRecompute } = await import("./group-recompute-write");

const REPLACE_FROM = "2026-10-07";

function card(date: string, name: string) {
  return {
    date,
    name,
    typ: "Z2",
    phase: "Grundlage",
    isoWeek: "2026-KW41",
    tssPlanned: 50,
    durationMin: 60,
    km: null,
    workout: null,
    workoutStructure: null,
    isQuality: false,
    isTest: false,
  };
}

function generatedWith(names: string[]) {
  return {
    weeks: [
      // Vor replaceFrom: gehört zur laufenden Woche, darf nie geschrieben werden.
      {
        start: "2026-10-05",
        cards: [card("2026-10-05", "alt-vergangen"), ...names.map((n, i) => card(`2026-10-0${8 + i}`, n))],
      },
    ],
    weekModel: [],
    warnings: [],
  };
}

function plan(id: string, sport: "ride" | "run"): TrainingPlan {
  return {
    id,
    sport,
    weekModel: [
      { week: "x", start: "2026-10-05", end: "2026-10-11", phase: "Grundlage", trainingWeekdays: [2, 4], targetTss: 1 },
    ],
    trainingWeekdays: [2, 4],
    ftpTarget: sport === "ride" ? 210 : null,
    weeklyHours: 6,
    params: { form: { weeks: 8 } },
  } as unknown as TrainingPlan;
}

const patchOf = (days: number[]) => ({
  weekModel: [
    { week: "x", start: "2026-10-05", end: "2026-10-11", phase: "Grundlage", trainingWeekdays: days, targetTss: 1 },
  ],
  params: { form: { trainingWeekdays: days } },
  trainingWeekdays: days,
});

function job(id: string, sport: "ride" | "run", names: string[], days = [1, 3]) {
  return {
    sport,
    plan: plan(id, sport),
    generated: generatedWith(names) as never,
    patch: patchOf(days),
    replaceFrom: REPLACE_FROM,
  };
}

const old = (planId: string) => ({ date: "2026-10-09", name: `${planId}-alt`, typ: "Z2", sortOrder: 0, sport: "ride" });

beforeEach(() => {
  calls.length = 0;
  created.length = 0;
  script = {};
  backups = { r1: [old("r1")], u1: [old("u1")] };
});

describe("writeGroupRecompute — Erfolg", () => {
  it("sichert zuerst ALLE Pläne und schreibt erst dann: löschen → einfügen → Zeile, je Plan", async () => {
    const res = await writeGroupRecompute("prof-a", [job("r1", "ride", ["R1"]), job("u1", "run", ["U1"])]);
    expect(calls).toEqual([
      `list(r1,${REPLACE_FROM})`,
      `list(u1,${REPLACE_FROM})`,
      `delete(r1,${REPLACE_FROM})`,
      "create(r1,n=1)",
      "update(r1)",
      `delete(u1,${REPLACE_FROM})`,
      "create(u1,n=1)",
      "update(u1)",
    ]);
    expect(res).toEqual({ written: ["ride", "run"], skipped: [] });
  });

  it("Karten vor replaceFrom werden nie angefasst: Lesen, Löschen und Einfügen beginnen ab replaceFrom", async () => {
    await writeGroupRecompute("prof-a", [job("r1", "ride", ["R1"]), job("u1", "run", ["U1", "U2"])]);
    for (const c of calls.filter((x) => x.startsWith("list(") || x.startsWith("delete("))) {
      expect(c).toContain(`,${REPLACE_FROM})`);
    }
    for (const c of created.flatMap((x) => x.cards)) {
      expect(c.date >= REPLACE_FROM).toBe(true);
      expect(c.name).not.toBe("alt-vergangen");
    }
  });

  it("schreibt nur, was sich wirklich ändert: gleiche Karten und gleiche Zeile → kein Schreibaufruf", async () => {
    backups.u1 = [
      {
        date: "2026-10-08",
        name: "U1",
        typ: "Z2",
        phase: "Grundlage",
        week: "2026-KW41",
        tssPlanned: 50,
        durationMin: 60,
        km: null,
        workout: null,
        workoutStructure: null,
        sortOrder: 0,
        sport: "run",
      },
    ];
    const same = job("u1", "run", ["U1"], [2, 4]); // Tage wie in der Zeile
    const res = await writeGroupRecompute("prof-a", [job("r1", "ride", ["R1"]), same]);
    expect(calls.filter((c) => c.includes("u1"))).toEqual([`list(u1,${REPLACE_FROM})`]);
    expect(res).toEqual({ written: ["ride"], skipped: ["run"] });
  });
});

describe("writeGroupRecompute — Fehler ohne Schreiben", () => {
  it("scheitert das Lesen der Sicherung, wird nichts geschrieben", async () => {
    script["list:u1"] = [boom("kein Lesen")];
    await expect(
      writeGroupRecompute("prof-a", [job("r1", "ride", ["R1"]), job("u1", "run", ["U1"])]),
    ).rejects.toThrow(/kein Lesen/);
    expect(calls.some((c) => /^(delete|create|update|restoreRow)\(/.test(c))).toBe(false);
  });
});

describe("writeGroupRecompute — Fehler beim zweiten Plan: der erste wird wiederhergestellt", () => {
  const jobs = () => [job("r1", "ride", ["R1"]), job("u1", "run", ["U1"])];

  it.each([
    ["Löschen", "delete:u1", "plan u1 löschen kaputt"],
    ["Einfügen", "create:u1", "plan u1 einfügen kaputt"],
    ["Zeilen-Update", "update:u1", "plan u1 update kaputt"],
  ])("Fehler beim %s", async (_name, key, message) => {
    script[key] = [boom(message)];
    let error: Error | undefined;
    try {
      await writeGroupRecompute("prof-a", jobs());
    } catch (e) {
      error = e as Error;
    }
    expect(error?.message).toContain(message);
    expect(error?.message).toContain("Laufen");
    expect(error?.message).toMatch(/zurückgesetzt/);

    // Der erste Plan (Rad) wurde komplett geschrieben und danach aus der Sicherung wiederhergestellt.
    const afterFailure = calls.slice(calls.indexOf("update(r1)") + 1);
    expect(afterFailure).toEqual(
      expect.arrayContaining([`delete(r1,${REPLACE_FROM})`, "create(r1,n=1)", "restoreRow(r1)"]),
    );
    // Wiederherstellung schreibt die gesicherte Karte, nicht die neue.
    const restoreCreate = created.filter((c) => c.planId === "r1")[1];
    expect(restoreCreate.cards[0]).toMatchObject({ name: "r1-alt", date: "2026-10-09" });
  });

  it("stellt auch den gerade betroffenen Plan wieder her (Karten und Zeilenwerte)", async () => {
    script["update:u1"] = [boom("update kaputt")];
    await writeGroupRecompute("prof-a", jobs()).catch(() => {});
    const tail = calls.slice(calls.indexOf("update(u1)") + 1);
    expect(tail).toEqual(
      expect.arrayContaining([`delete(u1,${REPLACE_FROM})`, "create(u1,n=1)", "restoreRow(u1)"]),
    );
  });

  it("ein nie angefasster Plan wird nicht wiederhergestellt", async () => {
    script["delete:r1"] = [boom("gleich der erste")];
    await writeGroupRecompute("prof-a", jobs()).catch(() => {});
    expect(calls.some((c) => c.includes("(u1,") && !c.startsWith("list"))).toBe(false);
    expect(calls.some((c) => c === "update(u1)" || c === "create(u1,n=1)")).toBe(false);
  });
});

describe("writeGroupRecompute — Wiederherstellung scheitert", () => {
  it("sagt ehrlich, welche Sportart in welchem Stand ist und wie ein neuer Versuch es behebt", async () => {
    script["update:u1"] = [boom("update kaputt")];
    script["restoreRow:u1"] = [boom("zurück kaputt")];
    let error: Error | undefined;
    try {
      await writeGroupRecompute("prof-a", [job("r1", "ride", ["R1"]), job("u1", "run", ["U1"])]);
    } catch (e) {
      error = e as Error;
    }
    const msg = error?.message ?? "";
    expect(msg).toContain("update kaputt");
    expect(msg).toContain("Laufen: nicht zurückgesetzt");
    expect(msg).toContain("Rad: zurückgesetzt");
    expect(msg).toContain("Plan anpassen");
    expect(msg).toContain("07.10"); // nennt das Datum, ab dem neu geschrieben wird
  });

  it("scheitert die Wiederherstellung des ersten Plans, wird der zweite trotzdem versucht", async () => {
    script["update:u1"] = [boom("update kaputt")];
    script["create:r1"] = [{ ok: true }, boom("Rad zurück kaputt")]; // 1. Aufruf Schreiben ok, 2. Aufruf Wiederherstellung
    let error: Error | undefined;
    try {
      await writeGroupRecompute("prof-a", [job("r1", "ride", ["R1"]), job("u1", "run", ["U1"])]);
    } catch (e) {
      error = e as Error;
    }
    expect(calls).toContain("restoreRow(u1)");
    expect(error?.message).toMatch(/Rad: nicht zurückgesetzt/);
    expect(error?.message).toMatch(/Laufen: zurückgesetzt/);
  });
});

/* Tests: api/supabase/goals.ts — Port von data-access/supabase/goals.js
 * (Vanilla), bisher unportiert. */

import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { createFakeSupabaseClient } from "../../test/fake-supabase-client";

const fakeClient = createFakeSupabaseClient();

vi.mock("./client", () => ({
  supabase: fakeClient,
  getAuthedClient: async () => fakeClient,
  isSupabaseConfigured: true,
}));

const { getGoals, saveGoal, deactivateGoal, replaceGoal } = await import("./goals");

describe("getGoals", () => {
  it("mappt nur aktive Ziele, älteste zuerst", async () => {
    let filters: unknown[] = [];
    let order: unknown;
    fakeClient.handlers.goals = (calls) => {
      filters = calls.filters;
      order = calls.order;
      return {
        data: [{ id: "g1", kind: "ftp", target_value: 210, target_date: "2026-09-19", note: null, is_active: true, goal_key: "ftp", role: "main" }],
        error: null,
      };
    };
    const result = await getGoals("athlete-1");
    expect(result).toEqual({
      ok: true,
      goals: [
        { id: "g1", kind: "ftp", targetValue: 210, targetDate: "2026-09-19", note: null, isActive: true, goalKey: "ftp", role: "main" },
      ],
    });
    expect(filters).toEqual([
      { op: "eq", col: "athlete_id", val: "athlete-1" },
      { op: "eq", col: "is_active", val: true },
    ]);
    expect(order).toEqual({ col: "created_at", ascending: true });
  });
});

describe("getGoals (Altzeilen)", () => {
  it("liefert goalKey/role = null für Altzeilen ohne Katalogfelder", async () => {
    fakeClient.handlers.goals = () => ({
      data: [{ id: "g9", kind: "Freitext", target_value: null, target_date: null, note: null, is_active: true, goal_key: null, role: null }],
      error: null,
    });
    const result = await getGoals("athlete-1");
    expect(result.ok && result.goals[0]).toMatchObject({ goalKey: null, role: null });
  });

  it("fragt goal_key und role mit ab", async () => {
    let select = "";
    fakeClient.handlers.goals = (calls) => {
      select = String(calls.select ?? "");
      return { data: [], error: null };
    };
    await getGoals("athlete-1");
    expect(select).toContain("goal_key");
    expect(select).toContain("role");
  });
});

describe("saveGoal", () => {
  it("legt ein neues Ziel für den Athleten an", async () => {
    let payload: Record<string, unknown> = {};
    fakeClient.handlers.goals = (calls) => {
      payload = calls.payload as Record<string, unknown>;
      return { data: { id: "g2" }, error: null };
    };
    const result = await saveGoal("athlete-1", { kind: "ftp", targetValue: 210, targetDate: "2026-09-19", note: null });
    expect(result).toEqual({ ok: true, id: "g2" });
    expect(payload).toEqual({
      athlete_id: "athlete-1",
      kind: "ftp",
      target_value: 210,
      target_date: "2026-09-19",
      note: null,
      goal_key: null,
      role: null,
    });
  });

  it("schreibt Katalogschlüssel und Rolle mit", async () => {
    let payload: Record<string, unknown> = {};
    fakeClient.handlers.goals = (calls) => {
      payload = calls.payload as Record<string, unknown>;
      return { data: { id: "g3" }, error: null };
    };
    await saveGoal("athlete-1", { kind: "Bergauf", goalKey: "bergauf", role: "side" });
    expect(payload).toMatchObject({ goal_key: "bergauf", role: "side" });
  });

  it("meldet einen Fehler, wenn das Haupt-/Nebenziel schon belegt ist (Unique-Index)", async () => {
    fakeClient.handlers.goals = () => ({
      data: null,
      error: { message: 'duplicate key value violates unique constraint "goals_one_active_main_per_athlete"' },
    });
    const result = await saveGoal("athlete-1", { kind: "FTP", goalKey: "ftp", role: "main" });
    expect(result.ok).toBe(false);
  });
});

describe("deactivateGoal", () => {
  it("setzt is_active=false statt zu löschen", async () => {
    let payload: Record<string, unknown> = {};
    let filters: unknown[] = [];
    fakeClient.handlers.goals = (calls) => {
      payload = calls.payload as Record<string, unknown>;
      filters = calls.filters;
      return { data: null, error: null };
    };
    const result = await deactivateGoal("g1");
    expect(result).toEqual({ ok: true });
    expect(payload).toEqual({ is_active: false });
    expect(filters).toEqual([{ op: "eq", col: "id", val: "g1" }]);
  });
});

describe("replaceGoal (Rolle belegt: altes zuerst deaktivieren, dann speichern)", () => {
  type Step = { method?: string; payload?: unknown; filters: unknown[] };
  const NEW_GOAL = { kind: "FTP", goalKey: "ftp" as const, role: "main" as const, targetValue: 280 };

  it("deaktiviert das alte Ziel VOR dem Speichern des neuen", async () => {
    const steps: Step[] = [];
    fakeClient.handlers.goals = (calls) => {
      steps.push({ method: calls.method, payload: calls.payload, filters: calls.filters });
      return calls.method === "insert" ? { data: { id: "g-new" }, error: null } : { data: null, error: null };
    };
    const result = await replaceGoal("athlete-1", "g-old", NEW_GOAL);
    expect(result).toEqual({ ok: true, id: "g-new" });
    expect(steps.map((s) => s.method)).toEqual(["update", "insert"]);
    expect(steps[0].payload).toEqual({ is_active: false });
    expect(steps[0].filters).toEqual([{ op: "eq", col: "id", val: "g-old" }]);
  });

  it("ohne altes Ziel wird nur gespeichert", async () => {
    const methods: Array<string | undefined> = [];
    fakeClient.handlers.goals = (calls) => {
      methods.push(calls.method);
      return { data: { id: "g-new" }, error: null };
    };
    const result = await replaceGoal("athlete-1", null, NEW_GOAL);
    expect(result).toEqual({ ok: true, id: "g-new" });
    expect(methods).toEqual(["insert"]);
  });

  it("Speichern scheitert: altes Ziel wird wieder aktiviert, Fehler wird gemeldet", async () => {
    const steps: Step[] = [];
    fakeClient.handlers.goals = (calls) => {
      steps.push({ method: calls.method, payload: calls.payload, filters: calls.filters });
      return calls.method === "insert"
        ? { data: null, error: { message: "insert kaputt" } }
        : { data: null, error: null };
    };
    const result = await replaceGoal("athlete-1", "g-old", NEW_GOAL);
    expect(result).toEqual({ ok: false, error: { code: "UNKNOWN", message: "insert kaputt" } });
    expect(steps.map((s) => s.method)).toEqual(["update", "insert", "update"]);
    expect(steps[2].payload).toEqual({ is_active: true });
    expect(steps[2].filters).toEqual([{ op: "eq", col: "id", val: "g-old" }]);
  });

  it("Deaktivieren scheitert: es wird nichts gespeichert", async () => {
    const methods: Array<string | undefined> = [];
    fakeClient.handlers.goals = (calls) => {
      methods.push(calls.method);
      return { data: null, error: { message: "update kaputt" } };
    };
    const result = await replaceGoal("athlete-1", "g-old", NEW_GOAL);
    expect(result).toEqual({ ok: false, error: { code: "UNKNOWN", message: "update kaputt" } });
    expect(methods).toEqual(["update"]);
  });

  it("Speichern UND Reaktivieren scheitern: Fehler nennt, dass das alte Ziel inaktiv blieb", async () => {
    fakeClient.handlers.goals = (calls) =>
      calls.method === "update" && (calls.payload as { is_active: boolean }).is_active === false
        ? { data: null, error: null }
        : { data: null, error: { message: "boom" } };
    const result = await replaceGoal("athlete-1", "g-old", NEW_GOAL);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain("boom");
    expect(!result.ok && result.error.message).toContain("inaktiv");
  });

  it("schreibt kind, goal_key und role des neuen Ziels", async () => {
    let payload: Record<string, unknown> = {};
    fakeClient.handlers.goals = (calls) => {
      if (calls.method === "insert") payload = calls.payload as Record<string, unknown>;
      return calls.method === "insert" ? { data: { id: "x" }, error: null } : { data: null, error: null };
    };
    await replaceGoal("athlete-1", "g-old", NEW_GOAL);
    expect(payload).toMatchObject({ athlete_id: "athlete-1", kind: "FTP", goal_key: "ftp", role: "main", target_value: 280 });
  });
});

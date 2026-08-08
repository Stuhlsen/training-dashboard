/* Tests: die Schreibpfade der Plankarten — Optimistik, Rollback und das
 * Überholen nebenläufiger Vorgänge.
 *
 * Verhaltens-Spezifikation ist tests/plan-cards-move.test.js (Vanilla,
 * Root-Repo). Die reinen Patch-Regeln (movedFromDate nur beim ersten
 * Verschieben, week/phase der Zielwoche, Ausfall-Reset) sind hier NICHT
 * mehr enthalten — sie liegen als reine Funktionen in
 * ../plan-cards/patch.ts und werden dort mockfrei geprüft. Übrig bleibt
 * genau das, was ohne Async-Geschirr nicht prüfbar ist. */

import { act } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanCard, PlanCardPatch, Result } from "../types";

/** Ausstehende updatePlanCard-Aufrufe: der Test entscheidet, WANN und mit
 *  welchem Ergebnis jeder einzelne zurückkommt — nur so lässt sich das
 *  Überholen zweier Vorgänge deterministisch nachstellen. */
interface Pending {
  id: string;
  patch: PlanCardPatch;
  resolve: (result: Result<{ card: PlanCard }>) => void;
}
let pending: Pending[] = [];

vi.mock("../supabase/plan-cards", () => ({
  listPlanCards: async () => ({ ok: true, cards: SEED.map((c) => ({ ...c })) }),
  updatePlanCard: (id: string, patch: PlanCardPatch) =>
    new Promise((resolve) => pending.push({ id, patch, resolve })),
  createPlanCard: async () => ({ ok: true, card: SEED[0] }),
  removePlanCard: async () => ({ ok: true }),
}));

vi.mock("../supabase/profiles", () => ({
  findProfileIdByDisplayName: async () => ({ ok: true, id: "profile-uuid-1" }),
  getProfile: async (id: string) => ({
    ok: true,
    profile: {
      id,
      displayName: "Stuhlsen",
      role: "athlete",
      coachId: null,
      wellbeingPublic: false,
      isAdmin: false,
      ladderProgressionEnabled: false,
    },
  }),
}));

const { createHarness } = await import("../../test/harness");
const { __resetWriteGuards } = await import("../write-guard");
const { usePlanCards, useMovePlanCard, useCancelPlanCard, useUndoAdjustment } = await import(
  "./usePlanCards"
);
const { qk } = await import("../keys");

function card(partial: Partial<PlanCard> & { id: string; date: string }): PlanCard {
  return {
    sortOrder: 0,
    name: null,
    typ: null,
    km: null,
    durationMin: null,
    tssPlanned: null,
    week: null,
    phase: null,
    details: null,
    workout: null,
    workoutStructure: null,
    pushedExternalId: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    ...partial,
  };
}

/** Derselbe Bestand wie im SEED der Vanilla-Spec. */
const SEED: PlanCard[] = [
  card({ id: "card-A", date: "2026-07-20", name: "Sweet Spot 3×12", typ: "Sweet Spot", week: "2026-KW29", phase: "Sweet Spot" }),
  card({ id: "card-B", date: "2026-07-28", name: "Erholung", typ: "Z1 Recovery", week: "2026-KW30", phase: "Erholung" }),
  card({ id: "card-C", date: "2026-07-21", sortOrder: 1, name: "Z2 Dauer", typ: "Z2 Dauer", week: "2026-KW29", phase: "Sweet Spot" }),
];

/** Server-Antwort in der Shape, die der Adapter liefert. */
function serverCard(base: PlanCard, patch: PlanCardPatch): PlanCard {
  return {
    ...base,
    date: patch.plannedDate ?? base.date,
    originalDate: patch.movedFromDate ?? base.originalDate ?? undefined,
    movedReason: patch.moveReason || undefined,
    cancelled: patch.status === "ausgefallen" || undefined,
    cancelReason: patch.cancelReason || undefined,
    week: patch.week ?? base.week,
    phase: patch.phase ?? base.phase,
  };
}

/** Lädt die Karten und gibt Hook-Handles auf alle Schreibpfade zurück —
 *  alle im selben renderHook, damit sie sich denselben Cache teilen (so
 *  wie die echte UI, in der Button und Drag denselben Zustand sehen). */
async function setup() {
  const harness = createHarness({ userId: "user-1" });
  const view = renderHook(
    (athleteId: string) => ({
      cards: usePlanCards(athleteId),
      move: useMovePlanCard(athleteId),
      cancel: useCancelPlanCard(athleteId),
      undo: useUndoAdjustment(athleteId),
    }),
    { wrapper: harness.wrapper, initialProps: "athlete1" },
  );
  await waitFor(() => expect(view.result.current.cards.data).toHaveLength(3));
  const cardById = (id: string) =>
    harness.queryClient
      .getQueryData<PlanCard[]>(qk.planCards("athlete1"))
      ?.find((c) => c.id === id);
  return { ...harness, view, cardById };
}

/** Löst den n-ten ausstehenden Schreibvorgang auf. */
async function settle(index: number, result: Result<{ card: PlanCard }>) {
  await act(async () => {
    pending[index].resolve(result);
    await Promise.resolve();
  });
}

const ok = (index: number, base: PlanCard): Result<{ card: PlanCard }> => ({
  ok: true,
  card: serverCard(base, pending[index].patch),
});
const fail = (message: string): Result<{ card: PlanCard }> => ({
  ok: false,
  error: { code: "HTTP", message },
});

beforeEach(() => {
  pending = [];
  __resetWriteGuards();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("Optimistik", () => {
  it("setzt die Karte an den Zieltag, bevor der Server antwortet", async () => {
    const { view, cardById } = await setup();

    let promise!: Promise<unknown>;
    act(() => {
      promise = view.result.current.move.move("card-A", "2026-07-22", "Regen");
    });

    await waitFor(() => expect(pending).toHaveLength(1));
    expect(cardById("card-A")?.date).toBe("2026-07-22");
    expect(cardById("card-A")?.originalDate).toBe("2026-07-20");

    await settle(0, ok(0, SEED[0]));
    await expect(promise).resolves.toMatchObject({ ok: true });
    expect(cardById("card-A")?.date).toBe("2026-07-22");
  });

  it("hält die Sortierung nach dem Verschieben stabil", async () => {
    const { view, queryClient } = await setup();
    // card-A (20.07.) hinter card-C (21.07.) schieben
    act(() => void view.result.current.move.move("card-A", "2026-07-25"));
    await waitFor(() => expect(pending).toHaveLength(1));

    const order = queryClient
      .getQueryData<PlanCard[]>(qk.planCards("athlete1"))!
      .map((c) => c.id);
    expect(order).toEqual(["card-C", "card-A", "card-B"]);
  });
});

describe("Rollback", () => {
  it("holt die Karte bei einem Schreibfehler sichtbar zurück", async () => {
    const { view, cardById } = await setup();

    let promise!: Promise<Result<{ card: PlanCard }>>;
    act(() => {
      promise = view.result.current.move.move("card-A", "2026-07-22", "Regen");
    });
    await waitFor(() => expect(pending).toHaveLength(1));
    expect(cardById("card-A")?.date).toBe("2026-07-22");

    await settle(0, fail("403"));

    const result = await promise;
    expect(result.ok).toBe(false);
    expect(cardById("card-A")?.date).toBe("2026-07-20");
    expect(cardById("card-A")?.originalDate).toBeUndefined();
  });
});

/* ── Der Kern: was React Querys Standard-Rollback falsch machen würde ── */

describe("Nebenläufige Schreibvorgänge", () => {
  it("A optimistisch → B startet → A schlägt fehl → B bleibt stehen", async () => {
    const { view, cardById } = await setup();

    let pA!: Promise<Result<{ card: PlanCard }>>;
    act(() => {
      pA = view.result.current.move.move("card-A", "2026-07-22", "A");
    });
    await waitFor(() => expect(pending).toHaveLength(1));
    expect(cardById("card-A")?.date).toBe("2026-07-22");

    // B startet, BEVOR A persistiert ist.
    act(() => void view.result.current.move.move("card-A", "2026-07-24", "B"));
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(cardById("card-A")?.date).toBe("2026-07-24");

    // A schlägt jetzt fehl. Ein blinder Rollback würde B wegwerfen.
    await settle(0, fail("503"));
    await pA;
    expect(cardById("card-A")?.date).toBe("2026-07-24");

    await settle(1, ok(1, SEED[0]));
    expect(cardById("card-A")?.date).toBe("2026-07-24");
  });

  it("eine überholte ERFOLGS-Antwort überschreibt den neueren Vorgang nicht", async () => {
    const { view, cardById } = await setup();

    let pA!: Promise<Result<{ card: PlanCard }>>;
    act(() => {
      pA = view.result.current.move.move("card-A", "2026-07-22", "A");
    });
    await waitFor(() => expect(pending).toHaveLength(1));
    act(() => void view.result.current.move.move("card-A", "2026-07-24", "B"));
    await waitFor(() => expect(pending).toHaveLength(2));

    // A kommt verspätet, aber erfolgreich zurück — mit dem alten Zieldatum.
    await settle(0, ok(0, SEED[0]));
    await pA;
    expect(cardById("card-A")?.date).toBe("2026-07-24");

    await settle(1, ok(1, SEED[0]));
    expect(cardById("card-A")?.date).toBe("2026-07-24");
  });

  it("der Rollback eines Moves überschreibt keine dazwischen gelaufene Mutation", async () => {
    const { view, cardById } = await setup();

    let pMove!: Promise<Result<{ card: PlanCard }>>;
    act(() => {
      pMove = view.result.current.move.move("card-A", "2026-07-22");
    });
    await waitFor(() => expect(pending).toHaveLength(1));

    // … und die Karte, während der Move noch unterwegs ist, ausfallen lassen.
    let pCancel!: Promise<Result<{ card: PlanCard }>>;
    act(() => {
      pCancel = view.result.current.cancel.cancel("card-A", "Krank");
    });
    await waitFor(() => expect(pending).toHaveLength(2));

    await settle(1, ok(1, { ...SEED[0], date: "2026-07-22" }));
    await pCancel;
    expect(cardById("card-A")?.cancelled).toBe(true);

    // Jetzt schlägt der Move fehl. Ohne den Bump beim Ausfallen sähe der
    // Move denselben Token wie beim Start und würde den Ausfall wegrollen —
    // obwohl die DB die Karte als ausgefallen führt.
    await settle(0, fail("503"));
    await pMove;
    expect(cardById("card-A")?.cancelled).toBe(true);
  });
});

describe("Guards", () => {
  it("schreibt nicht ohne bekannte Karte", async () => {
    const { view } = await setup();
    const result = await view.result.current.move.move("gibt-es-nicht", "2026-07-22");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe("NO_DATA");
    expect(pending).toHaveLength(0);
  });

  it("schreibt nicht ohne Login", async () => {
    const harness = createHarness({ userId: null });
    const view = renderHook(() => useMovePlanCard("athlete1"), { wrapper: harness.wrapper });
    const result = await view.result.current.move("card-A", "2026-07-22");
    expect(result.ok).toBe(false);
    expect(pending).toHaveLength(0);
  });

  it("macht nichts rückgängig, wenn es nichts rückgängig zu machen gibt", async () => {
    const { view } = await setup();
    const result = await view.result.current.undo.undo("card-A");
    expect(result.ok).toBe(true);
    expect(pending).toHaveLength(0);
  });
});

/* ── Was die Query-Keys ersetzen: loadedForAthleteId ─────────────── */

describe("Athletenwechsel", () => {
  it("zeigt Karten je Athlet getrennt, ohne Abgleich im Zustand", async () => {
    const harness = createHarness({ userId: "user-1" });
    const view = renderHook((athleteId: string) => usePlanCards(athleteId), {
      wrapper: harness.wrapper,
      initialProps: "athlete1",
    });
    await waitFor(() => expect(view.result.current.data).toHaveLength(3));

    view.rerender("athlete2");
    // Der Cache von athlete1 bleibt unangetastet — eine noch laufende
    // Antwort für ihn kann den von athlete2 gar nicht erreichen.
    await waitFor(() => expect(view.result.current.data).toHaveLength(3));
    expect(harness.queryClient.getQueryData(qk.planCards("athlete1"))).toHaveLength(3);
    expect(harness.queryClient.getQueryData(qk.planCards("athlete2"))).toHaveLength(3);
    expect(qk.planCards("athlete1")).not.toEqual(qk.planCards("athlete2"));
  });
});

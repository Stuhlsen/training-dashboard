/* Tests: useRecipeComments — Sortierung nach Daumen, Pseudonym-Regel (useCanComment), Schreiben mit
 * Vorprüfung, Daumen (nur fremde), Löschen (eigener per RLS, fremder nur als Admin über die admin-api).
 * Adapter und Session gemockt. */

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecipeComment } from "../types";

let mockUserId: string | null = "u1";
let mockIsAdmin = false;
let mockProfile: { displayName: string | null } | null = { displayName: "RadFuchs" };
let mockEmail: string | null = "max.muster@example.org";

const listMock = vi.fn();
const addMock = vi.fn();
const deleteOwnMock = vi.fn();
const voteMock = vi.fn();
const deleteAdminMock = vi.fn();

vi.mock("./useSession", () => ({
  useAuthUserId: () => mockUserId,
  useIsAdmin: () => mockIsAdmin,
  useSessionProfile: () => mockProfile,
}));
vi.mock("../auth/useAuth", () => ({ useAuth: () => ({ user: mockEmail ? { email: mockEmail } : null }) }));
vi.mock("../supabase/recipe-comments", () => ({
  listRecipeComments: (...a: unknown[]) => listMock(...a),
  addRecipeComment: (...a: unknown[]) => addMock(...a),
  deleteOwnRecipeComment: (...a: unknown[]) => deleteOwnMock(...a),
  setCommentVote: (...a: unknown[]) => voteMock(...a),
}));
vi.mock("../admin-recipe-comments", () => ({
  deleteRecipeCommentAsAdmin: (...a: unknown[]) => deleteAdminMock(...a),
}));

const { createHarness } = await import("../../test/harness");
const { useRecipeComments, useCanComment, useAddComment, useVoteComment, useDeleteComment } = await import(
  "./useRecipeComments"
);

function comment(extra: Partial<RecipeComment> = {}): RecipeComment {
  return {
    id: "c1",
    recipeId: "r1",
    authorName: "RadFuchs",
    isMine: false,
    body: "Text",
    createdAt: "2026-10-05T12:00:00Z",
    up: 0,
    down: 0,
    myVote: null,
    ...extra,
  };
}

beforeEach(() => {
  mockUserId = "u1";
  mockIsAdmin = false;
  mockProfile = { displayName: "RadFuchs" };
  mockEmail = "max.muster@example.org";
  for (const m of [listMock, addMock, deleteOwnMock, voteMock, deleteAdminMock]) {
    m.mockReset();
    m.mockResolvedValue({ ok: true });
  }
  listMock.mockResolvedValue({
    ok: true,
    comments: [
      comment({ id: "a", up: 1, createdAt: "2026-10-01T00:00:00Z" }),
      comment({ id: "b", up: 5, down: 1, createdAt: "2026-10-02T00:00:00Z" }),
      comment({ id: "c", down: 3, createdAt: "2026-10-03T00:00:00Z" }),
    ],
  });
});

describe("useRecipeComments", () => {
  it("lädt die Kommentare des Rezepts und sortiert nach den meisten Daumen", async () => {
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useRecipeComments("r1"), { wrapper });
    await waitFor(() => expect(result.current.comments).toHaveLength(3));
    expect(listMock).toHaveBeenCalledWith("r1");
    expect(result.current.comments.map((c) => c.id)).toEqual(["b", "a", "c"]);
  });

  it("lädt ohne Rezept-ID nichts", () => {
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useRecipeComments(null), { wrapper });
    expect(result.current.comments).toEqual([]);
    expect(listMock).not.toHaveBeenCalled();
  });

  it("meldet einen Ladefehler und bleibt leer", async () => {
    listMock.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "boom" } });
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useRecipeComments("r1"), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.comments).toEqual([]);
  });
});

describe("useCanComment", () => {
  it("erlaubt Schreiben mit eigenem Pseudonym", () => {
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useCanComment(), { wrapper });
    expect(result.current).toEqual({ loaded: true, canComment: true });
  });

  it("verbietet Schreiben, wenn der Name dem E-Mail-Teil vor dem @ gleicht", () => {
    mockProfile = { displayName: "Max.Muster" };
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useCanComment(), { wrapper });
    expect(result.current.canComment).toBe(false);
  });

  it("verbietet Schreiben ohne Namen und meldet loaded=false, solange das Profil lädt", () => {
    mockProfile = { displayName: null };
    const { wrapper } = createHarness({ userId: "u1" });
    expect(renderHook(() => useCanComment(), { wrapper }).result.current).toEqual({
      loaded: true,
      canComment: false,
    });
    mockProfile = null;
    expect(renderHook(() => useCanComment(), { wrapper }).result.current).toEqual({
      loaded: false,
      canComment: false,
    });
  });
});

describe("useAddComment", () => {
  it("prüft vorher und schickt den getrimmten Text", async () => {
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useAddComment("r1"), { wrapper });
    let res;
    await act(async () => {
      res = await result.current.add("  Lecker  ");
    });
    expect(res).toMatchObject({ ok: true });
    expect(addMock).toHaveBeenCalledWith("r1", "u1", "Lecker");
  });

  it("lehnt leeren und zu langen Text ohne Anfrage ab", async () => {
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useAddComment("r1"), { wrapper });
    await act(async () => {
      expect(await result.current.add("   ")).toMatchObject({ ok: false, error: { code: "SCHEMA" } });
      expect(await result.current.add("a".repeat(501))).toMatchObject({ ok: false, error: { code: "SCHEMA" } });
    });
    expect(addMock).not.toHaveBeenCalled();
  });

  it("meldet ohne Anmeldung TOKEN_INVALID und gibt Adapter-Fehler als Result zurück", async () => {
    const { wrapper } = createHarness({ userId: "u1" });
    mockUserId = null;
    const out = renderHook(() => useAddComment("r1"), { wrapper });
    await act(async () => {
      expect(await out.result.current.add("x")).toMatchObject({ ok: false, error: { code: "TOKEN_INVALID" } });
    });
    mockUserId = "u1";
    addMock.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "RLS" } });
    const again = renderHook(() => useAddComment("r1"), { wrapper });
    await act(async () => {
      expect(await again.result.current.add("x")).toMatchObject({ ok: false, error: { code: "UNKNOWN" } });
    });
  });
});

describe("useVoteComment", () => {
  it("setzt den Daumen auf einen fremden Kommentar", async () => {
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useVoteComment("r1"), { wrapper });
    await act(async () => {
      expect(await result.current.vote(comment({ id: "c9" }), "up")).toMatchObject({ ok: true });
    });
    expect(voteMock).toHaveBeenCalledWith("c9", "u1", "up");
  });

  it("lehnt den eigenen Kommentar und ungültige Werte ohne Anfrage ab", async () => {
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useVoteComment("r1"), { wrapper });
    await act(async () => {
      expect(await result.current.vote(comment({ isMine: true }), "up")).toMatchObject({ ok: false });
      expect(await result.current.vote(comment(), "sideways" as never)).toMatchObject({ ok: false });
    });
    expect(voteMock).not.toHaveBeenCalled();
  });
});

describe("useDeleteComment", () => {
  it("löscht den eigenen Kommentar über den Adapter (RLS), nicht über die admin-api", async () => {
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useDeleteComment("r1"), { wrapper });
    await act(async () => {
      expect(await result.current.remove(comment({ id: "mine", isMine: true }))).toMatchObject({ ok: true });
    });
    expect(deleteOwnMock).toHaveBeenCalledWith("mine");
    expect(deleteAdminMock).not.toHaveBeenCalled();
  });

  it("löscht einen fremden Kommentar als Admin über die admin-api", async () => {
    mockIsAdmin = true;
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useDeleteComment("r1"), { wrapper });
    await act(async () => {
      expect(await result.current.remove(comment({ id: "other" }))).toMatchObject({ ok: true });
    });
    expect(deleteAdminMock).toHaveBeenCalledWith("other");
    expect(deleteOwnMock).not.toHaveBeenCalled();
  });

  it("lehnt einen fremden Kommentar ohne Admin-Recht ohne Anfrage ab", async () => {
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useDeleteComment("r1"), { wrapper });
    await act(async () => {
      expect(await result.current.remove(comment())).toMatchObject({ ok: false, error: { code: "SCHEMA" } });
    });
    expect(deleteOwnMock).not.toHaveBeenCalled();
    expect(deleteAdminMock).not.toHaveBeenCalled();
  });

  it("gibt einen Server-Fehler der admin-api als Result zurück", async () => {
    mockIsAdmin = true;
    deleteAdminMock.mockResolvedValue({ ok: false, error: { code: "NO_DATA", message: "weg" } });
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useDeleteComment("r1"), { wrapper });
    await act(async () => {
      expect(await result.current.remove(comment())).toMatchObject({ ok: false, error: { code: "NO_DATA" } });
    });
  });
});

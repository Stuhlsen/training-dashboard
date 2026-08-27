/* Tests: api/supabase/account-deletion.ts — Muster wie ftp-history.test.ts. */

import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { createFakeSupabaseClient } from "../../test/fake-supabase-client";

const fakeClient = createFakeSupabaseClient();

vi.mock("./client", () => ({
  supabase: fakeClient,
  getAuthedClient: async () => fakeClient,
  isSupabaseConfigured: true,
}));

const { getAccountDeletionRequest, requestAccountDeletion } = await import("./account-deletion");

describe("getAccountDeletionRequest", () => {
  it("liefert requestedAt aus snake_case", async () => {
    fakeClient.handlers.account_deletion_requests = () => ({
      data: { requested_at: "2026-08-27T10:00:00.000Z" },
      error: null,
    });
    const result = await getAccountDeletionRequest("profile-1");
    expect(result).toEqual({ ok: true, requestedAt: "2026-08-27T10:00:00.000Z" });
  });

  it("liefert null ohne bestehenden Antrag", async () => {
    fakeClient.handlers.account_deletion_requests = () => ({ data: null, error: null });
    const result = await getAccountDeletionRequest("profile-1");
    expect(result).toEqual({ ok: true, requestedAt: null });
  });
});

describe("requestAccountDeletion", () => {
  it("upsert mit onConflict profile_id", async () => {
    let seen: Record<string, unknown> = {};
    let seenOpts: { onConflict?: string } | undefined;
    fakeClient.handlers.account_deletion_requests = (calls) => {
      seen = calls.payload as Record<string, unknown>;
      seenOpts = calls.upsertOpts;
      return { data: null, error: null };
    };
    const result = await requestAccountDeletion("profile-1");
    expect(result.ok).toBe(true);
    expect(seen.profile_id).toBe("profile-1");
    expect(typeof seen.requested_at).toBe("string");
    expect(seenOpts).toEqual({ onConflict: "profile_id" });
  });
});

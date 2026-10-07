/* Tests: api/supabase/recipes.ts — listRecipes. */

import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { createFakeSupabaseClient } from "../../test/fake-supabase-client";

const fakeClient = createFakeSupabaseClient();

vi.mock("./client", () => ({
  supabase: fakeClient,
  getAuthedClient: async () => fakeClient,
  isSupabaseConfigured: true,
}));

const { listRecipes } = await import("./recipes");

const ROW_DEFAULT = {
  id: "r1",
  external_id: "spoon-123",
  submitted_by: null,
  status: "approved",
  rejection_reason: null,
  title: "Haferflocken-Porridge",
  meal_type: ["breakfast"],
  diet_tags: ["veg", "vegan"],
  contains_tags: ["gluten"],
  servings: 2,
  ingredients: [
    { name: "Haferflocken", amount: 100, unit: "g", category: "Getreide" },
  ],
  instructions: [{ text: "Kochen" }],
  nutrition: { kcal: 350, protein: 12, carbs: 50, fat: 8 },
  image_url: null,
  source: "own",
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

const ROW_MAPPER_TEST = {
  id: "r2",
  external_id: null,
  submitted_by: null,
  status: "approved",
  rejection_reason: "zu einfach",
  title: "Eier",
  meal_type: ["breakfast"],
  diet_tags: null,
  contains_tags: null,
  servings: 1,
  ingredients: null,
  instructions: null,
  nutrition: null,
  image_url: "https://example.com/eier.jpg",
  source: "own",
  created_at: "2026-09-02T00:00:00Z",
  updated_at: "2026-09-02T00:00:00Z",
};

describe("listRecipes", () => {
  it("gibt nur approved Rezepte zurueck (Default-Filter)", async () => {
    let filters: unknown[] = [];
    let order: unknown;
    fakeClient.handlers.recipes = (calls) => {
      filters = calls.filters;
      order = calls.order;
      return {
        data: [ROW_DEFAULT],
        error: null,
      };
    };
    const result = await listRecipes();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.recipes).toHaveLength(1);
      expect(result.recipes[0].title).toBe("Haferflocken-Porridge");
      expect(result.recipes[0].status).toBe("approved");
    }
    expect(filters).toContainEqual({ op: "eq", col: "status", val: "approved" });
    expect(order).toEqual({ col: "title", ascending: true });
  });

  it("filtert nach mealType", async () => {
    let filters: unknown[] = [];
    fakeClient.handlers.recipes = (calls) => {
      filters = calls.filters;
      return { data: [ROW_DEFAULT], error: null };
    };
    const result = await listRecipes({ mealType: "dinner" });
    expect(result.ok).toBe(true);
    expect(filters).toContainEqual({ op: "eq", col: "status", val: "approved" });
    expect(filters).toContainEqual({ op: "contains", col: "meal_type", val: ["dinner"] });
  });

  it("filtert nach dietTags", async () => {
    let filters: unknown[] = [];
    fakeClient.handlers.recipes = (calls) => {
      filters = calls.filters;
      return { data: [ROW_DEFAULT], error: null };
    };
    const result = await listRecipes({ dietTags: ["veg", "vegan"] });
    expect(result.ok).toBe(true);
    expect(filters).toContainEqual({ op: "eq", col: "status", val: "approved" });
    expect(filters).toContainEqual({ op: "contains", col: "diet_tags", val: ["veg", "vegan"] });
  });

  it("filtert nach source", async () => {
    let filters: unknown[] = [];
    fakeClient.handlers.recipes = (calls) => {
      filters = calls.filters;
      return { data: [ROW_DEFAULT], error: null };
    };
    const result = await listRecipes({ source: "own" });
    expect(result.ok).toBe(true);
    expect(filters).toContainEqual({ op: "eq", col: "status", val: "approved" });
    expect(filters).toContainEqual({ op: "eq", col: "source", val: "own" });
  });

  it("kann expliziten status setzen", async () => {
    let filters: unknown[] = [];
    fakeClient.handlers.recipes = (calls) => {
      filters = calls.filters;
      return { data: [ROW_DEFAULT], error: null };
    };
    const result = await listRecipes({ status: "pending" });
    expect(result.ok).toBe(true);
    expect(filters).toContainEqual({ op: "eq", col: "status", val: "pending" });
  });
});

describe("listRecipes — mapper", () => {
  it("mappt alle Felder auf camelCase", async () => {
    fakeClient.handlers.recipes = () => ({ data: [ROW_DEFAULT], error: null });
    const result = await listRecipes();
    expect(result.ok).toBe(true);
    if (result.ok) {
      const r = result.recipes[0];
      expect(r.id).toBe("r1");
      expect(r.externalId).toBe("spoon-123");
      expect(r.submittedBy).toBeNull();
      expect(r.rejectionReason).toBeNull();
      expect(r.mealType).toEqual(["breakfast"]);
      expect(r.dietTags).toEqual(["veg", "vegan"]);
      expect(r.containsTags).toEqual(["gluten"]);
      expect(r.imageUrl).toBeNull();
      expect(r.createdAt).toBe("2026-09-01T00:00:00Z");
      expect(r.updatedAt).toBe("2026-09-01T00:00:00Z");
    }
  });

  it("null-Felder bleiben null", async () => {
    fakeClient.handlers.recipes = () => ({ data: [ROW_MAPPER_TEST], error: null });
    const result = await listRecipes();
    expect(result.ok).toBe(true);
    if (result.ok) {
      const r = result.recipes[0];
      expect(r.externalId).toBeNull();
      expect(r.submittedBy).toBeNull();
      expect(r.rejectionReason).toBe("zu einfach");
      expect(r.dietTags).toBeNull();
      expect(r.imageUrl).toBe("https://example.com/eier.jpg");
      expect(r.ingredients).toBeNull();
      expect(r.instructions).toBeNull();
      expect(r.nutrition).toBeNull();
    }
  });

  it("fehlendes contains_tags wird zu []", async () => {
    fakeClient.handlers.recipes = () => ({ data: [ROW_MAPPER_TEST], error: null });
    const result = await listRecipes();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.recipes[0].containsTags).toEqual([]);
    }
  });

  it("leeres contains_tags bleibt []", async () => {
    fakeClient.handlers.recipes = () => ({ data: [{ ...ROW_DEFAULT, contains_tags: [] }], error: null });
    const result = await listRecipes();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.recipes[0].containsTags).toEqual([]);
    }
  });
});

describe("listRecipes — error cases", () => {
  it("Supabase-Fehler → ok:false, kein Crash", async () => {
    fakeClient.handlers.recipes = () => ({ data: null, error: { message: "Connection refused" } });
    const result = await listRecipes();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNKNOWN");
      expect(result.error.message).toBe("Connection refused");
    }
  });

  it("leeres Ergebnis → ok:true, leeres Array", async () => {
    fakeClient.handlers.recipes = () => ({ data: [], error: null });
    const result = await listRecipes();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.recipes).toEqual([]);
    }
  });
});

describe("not configured path", () => {
  it("null-Supabase → ok:false mit Konfigurationsmeldung", async () => {
    vi.resetModules();
    vi.doMock("./client", () => ({
      supabase: null,
      getAuthedClient: async () => null,
      isSupabaseConfigured: false,
    }));
    const { listRecipes: lr } = await import("./recipes");
    const result = await lr();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNKNOWN");
      expect(result.error.message).toBe("Supabase nicht konfiguriert");
    }
  });
});
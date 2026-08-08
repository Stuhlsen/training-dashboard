/* Minimaler Mocking-Seam für den Supabase-Client — bildet dieselbe
   Chain-API wie @supabase/supabase-js nach, damit die Adapter in
   api/supabase/* DIREKT prüfbar sind (Query-Aufbau, Row-Mapping,
   Result-Konvention) statt nur über die Hooks darüber.

   Portiert aus tests/helpers/fake-supabase-client.js (Vanilla). Neu
   gegenüber dem Original: `.returns<T>()`, das die getypten Adapter für
   Listen-Abfragen aufrufen — reiner Typ-Hinweis an supabase-js, zur
   Laufzeit ein Durchreicher. */

export interface FakeCall {
  table: string;
  filters: Array<{ op: string; col: string; val: unknown }>;
  select?: string;
  order?: { col: string; ascending?: boolean };
  limit?: number;
  method?: "upsert" | "insert" | "update" | "delete";
  payload?: never | Record<string, unknown> | Record<string, unknown>[];
  upsertOpts?: { onConflict?: string };
  terminal?: "single" | "maybeSingle" | "list";
}

export interface FakeResponse {
  data: unknown;
  error: { message: string } | null;
}

export type FakeHandler = (calls: FakeCall) => FakeResponse;

export function createFakeSupabaseClient() {
  const handlers: Record<string, FakeHandler> = {};

  function resolve(table: string, calls: FakeCall): Promise<FakeResponse> {
    const handler = handlers[table];
    if (!handler) {
      throw new Error(`fake-supabase-client: kein Handler für Tabelle/View "${table}" registriert`);
    }
    return Promise.resolve(handler(calls));
  }

  function builder(table: string) {
    const calls: FakeCall = { table, filters: [] };
    const api = {
      select(cols: string) {
        calls.select = cols;
        return api;
      },
      eq(col: string, val: unknown) {
        calls.filters.push({ op: "eq", col, val });
        return api;
      },
      gte(col: string, val: unknown) {
        calls.filters.push({ op: "gte", col, val });
        return api;
      },
      lte(col: string, val: unknown) {
        calls.filters.push({ op: "lte", col, val });
        return api;
      },
      in(col: string, val: unknown) {
        calls.filters.push({ op: "in", col, val });
        return api;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        calls.order = { col, ...opts };
        return api;
      },
      limit(n: number) {
        calls.limit = n;
        return api;
      },
      upsert(payload: FakeCall["payload"], opts?: { onConflict?: string }) {
        calls.method = "upsert";
        calls.payload = payload;
        calls.upsertOpts = opts;
        return api;
      },
      insert(payload: FakeCall["payload"]) {
        calls.method = "insert";
        calls.payload = payload;
        return api;
      },
      update(payload: FakeCall["payload"]) {
        calls.method = "update";
        calls.payload = payload;
        return api;
      },
      delete() {
        calls.method = "delete";
        return api;
      },
      /** Nur ein Typ-Hinweis bei supabase-js — hier ein Durchreicher. */
      returns() {
        return api;
      },
      single() {
        return resolve(table, { ...calls, terminal: "single" });
      },
      maybeSingle() {
        return resolve(table, { ...calls, terminal: "maybeSingle" });
      },
      /** Terminal-Fallback für Ketten ohne .single()/.maybeSingle() — bei
       *  supabase-js ist der PostgrestBuilder selbst schon ein thenable. */
      then(
        onFulfilled?: (value: FakeResponse) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        return resolve(table, { ...calls, terminal: "list" }).then(onFulfilled, onRejected);
      },
    };
    return api;
  }

  return {
    handlers,
    from: (table: string) => builder(table),
  };
}

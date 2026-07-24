/* Minimaler, wiederverwendbarer Mocking-Seam für den Supabase-Client (Node
   node:test kann data-access/supabase/client.js nicht importieren — der
   Import lädt @supabase/supabase-js per esm.sh-URL, s. Kommentar in
   tests/plan-cards-move.test.js). Für data-access/supabase/*-Module, die
   DIREKT getestet werden sollen (nicht nur über eine gemockte state/-Grenze
   wie plan-cards-move.test.js), wird stattdessen client.js selbst per
   mock.module() durch einen Fake-Client ersetzt, der dieselbe Chain-API wie
   @supabase/supabase-js nachbildet.

   Erster Verbraucher: tests/wellbeing.test.js. Bewusst nur an dieser einen
   Stelle eingesetzt — die übrigen data-access/supabase/*-Module (goals.js,
   profiles.js, events.js, …) bleiben in diesem Schritt unangetastet (s.
   docs/offene-punkte.md), auch wenn der Seam dafür wiederverwendbar ist. */

/** @returns {{ from: (table: string) => object, handlers: Record<string, (calls: object) => {data: any, error: any}> }} */
export function createFakeSupabaseClient() {
  const handlers = {};

  function resolve(table, calls) {
    const handler = handlers[table];
    if (!handler) throw new Error(`fake-supabase-client: kein Handler für Tabelle/View "${table}" registriert`);
    return Promise.resolve(handler(calls));
  }

  function builder(table) {
    const calls = { table, filters: [] };
    const api = {
      select(cols) {
        calls.select = cols;
        return api;
      },
      eq(col, val) {
        calls.filters.push({ op: "eq", col, val });
        return api;
      },
      gte(col, val) {
        calls.filters.push({ op: "gte", col, val });
        return api;
      },
      lte(col, val) {
        calls.filters.push({ op: "lte", col, val });
        return api;
      },
      order(col, opts) {
        calls.order = { col, ...opts };
        return api;
      },
      limit(n) {
        calls.limit = n;
        return api;
      },
      upsert(payload, opts) {
        calls.method = "upsert";
        calls.payload = payload;
        calls.upsertOpts = opts;
        return api;
      },
      insert(payload) {
        calls.method = "insert";
        calls.payload = payload;
        return api;
      },
      update(payload) {
        calls.method = "update";
        calls.payload = payload;
        return api;
      },
      delete() {
        calls.method = "delete";
        return api;
      },
      single() {
        return resolve(table, { ...calls, terminal: "single" });
      },
      maybeSingle() {
        return resolve(table, { ...calls, terminal: "maybeSingle" });
      },
      // Terminal-Fallback für Ketten ohne .single()/.maybeSingle() (z.B.
      // getRange()/getSharedRange(): `await client.from(...).select(...)...order(...)`
      // ist bei supabase-js selbst schon ein thenable PostgrestBuilder).
      then(onFulfilled, onRejected) {
        return resolve(table, { ...calls, terminal: "list" }).then(onFulfilled, onRejected);
      },
    };
    return api;
  }

  return {
    handlers,
    from: (table) => builder(table),
  };
}

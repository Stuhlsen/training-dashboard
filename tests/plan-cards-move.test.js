/* Tests: state/plan-cards.js::movePlanCard — gemeinsamer Schreibpfad von
   "Verschieben"-Button UND Drag & Drop (ui/planned.js).

   Anders als die übrigen Suiten testet das hier die STATE-Schicht, nicht
   core/: Optimistik, requestId-Schutz und Rollback leben bewusst dort
   (damit beide Eingabearten sie haben, s. Modul-Kommentar), also müssen
   sie auch dort geprüft werden. state/plan-cards.js importiert transitiv
   data-access/supabase/client.js, das per URL von esm.sh lädt — unter
   node:test nicht importierbar. Deshalb wird die data-access-Grenze per
   mock.module() gestubbt (braucht --experimental-test-module-mocks, s.
   package.json → "test"); die Schicht darunter ist damit ohnehin nicht
   Gegenstand dieser Tests. */

import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import path from "node:path";

const JS = path.resolve(fileURLToPath(new URL("../assets/js", import.meta.url)));
const u = (p) => pathToFileURL(path.join(JS, p)).href;

/** Ausstehende updatePlanCard-Aufrufe: der Test entscheidet, WANN (und mit
 *  welchem Ergebnis) jeder einzelne zurückkommt — nur so lässt sich das
 *  Überholen zweier Moves deterministisch nachstellen. */
let pending = [];

mock.module(u("data-access/supabase/plan-cards.js"), {
  exports: {
    listPlanCards: async () => ({ ok: true, cards: SEED.map((c) => ({ ...c })) }),
    updatePlanCard: (id, patch) =>
      new Promise((resolve) => pending.push({ id, patch, resolve })),
    createPlanCard: async () => ({ ok: true, card: {} }),
    removePlanCard: async () => ({ ok: true }),
  },
});
mock.module(u("data-access/supabase/profiles.js"), {
  exports: { findProfileIdByDisplayName: async () => ({ ok: true, id: "profile-uuid-1" }) },
});
mock.module(u("data-access/intervals/push.js"), {
  exports: { pushCardWorkout: async () => ({ ok: true }) },
});
mock.module(u("state/session.js"), {
  exports: { getSession: () => ({ id: "user-1" }) },
});

const { loadPlanCards, movePlanCard, cancelPlanCard, undoAdjustment, getState } = await import(
  u("state/plan-cards.js")
);

const SEED = [
  {
    id: "card-A",
    date: "2026-07-20",
    sortOrder: 0,
    name: "Sweet Spot 3×12",
    typ: "Sweet Spot",
    week: "P2-W3",
    phase: "Sweet Spot",
  },
  {
    id: "card-B",
    date: "2026-07-28",
    sortOrder: 0,
    name: "Erholung",
    typ: "Z1 Recovery",
    week: "P2-W4",
    phase: "Erholung",
  },
];

/** Frischer Store vor jedem Test (cards werden von loadPlanCards ersetzt). */
async function seed() {
  pending = [];
  await loadPlanCards("athlete1");
}

const cardById = (id) => getState().cards.find((c) => c.id === id);
/** Server-Antwort in der Shape, die der Adapter (toSession) liefert. */
const serverCard = (base, patch) => ({
  ...base,
  date: patch.plannedDate ?? base.date,
  originalDate: patch.movedFromDate ?? base.originalDate,
  movedReason: patch.moveReason || undefined,
  week: patch.week ?? base.week,
  phase: patch.phase ?? base.phase,
});

/* ── Optimistik + Persistenz ─────────────────────────────────── */

test("movePlanCard setzt die Karte optimistisch, bevor der Server antwortet", async () => {
  await seed();
  const p = movePlanCard("card-A", "2026-07-22", "Regen");

  assert.equal(cardById("card-A").date, "2026-07-22", "sofort am Zieltag");
  assert.equal(cardById("card-A").originalDate, "2026-07-20", "Verschoben-von-Badge sofort da");
  assert.equal(pending.length, 1, "genau ein Schreibvorgang");

  pending[0].resolve({ ok: true, card: serverCard(SEED[0], pending[0].patch) });
  const result = await p;
  assert.equal(result.ok, true);
  assert.equal(cardById("card-A").date, "2026-07-22");
});

test("movePlanCard schreibt moved_from_date nur beim ERSTEN Verschieben", async () => {
  await seed();
  const p1 = movePlanCard("card-A", "2026-07-22", "Regen");
  pending[0].resolve({ ok: true, card: serverCard(SEED[0], pending[0].patch) });
  await p1;

  const p2 = movePlanCard("card-A", "2026-07-24", "Hitze");
  assert.equal(pending[1].patch.movedFromDate, "2026-07-20", "bleibt auf dem Urspung stehen");
  pending[1].resolve({ ok: true, card: serverCard(SEED[0], pending[1].patch) });
  await p2;
  assert.equal(cardById("card-A").originalDate, "2026-07-20");
});

test("movePlanCard übernimmt week/phase der Zielwoche", async () => {
  await seed();
  // card-A (P2-W3) auf die Woche von card-B (P2-W4) ziehen
  const p = movePlanCard("card-A", "2026-07-29", "");
  assert.equal(pending[0].patch.week, "P2-W4");
  assert.equal(pending[0].patch.phase, "Erholung");
  pending[0].resolve({ ok: true, card: serverCard(SEED[0], pending[0].patch) });
  await p;
  assert.equal(cardById("card-A").week, "P2-W4", "hängt unter der richtigen Wochenüberschrift");
});

test("movePlanCard lässt week/phase unangetastet, wenn die Zielwoche leer ist", async () => {
  await seed();
  const p = movePlanCard("card-A", "2026-08-19", "");
  assert.equal(pending[0].patch.week, undefined, "kein week im Patch → Spalte bleibt");
  assert.equal(pending[0].patch.phase, undefined);
  pending[0].resolve({ ok: true, card: serverCard(SEED[0], pending[0].patch) });
  await p;
  assert.equal(cardById("card-A").week, "P2-W3", "behält v1-gemäß sein altes Label");
});

test("movePlanCard reaktiviert eine ausgefallene Karte als geplant", async () => {
  await seed();
  movePlanCard("card-A", "2026-07-22", "");
  assert.equal(pending[0].patch.status, "geplant");
  assert.equal(pending[0].patch.cancelReason, null);
});

/* ── Rollback ────────────────────────────────────────────────── */

test("Schreibfehler rollt die optimistische Verschiebung zurück", async () => {
  await seed();
  const p = movePlanCard("card-A", "2026-07-22", "Regen");
  assert.equal(cardById("card-A").date, "2026-07-22");

  pending[0].resolve({ ok: false, error: { code: "HTTP", message: "403" } });
  const result = await p;

  assert.equal(result.ok, false);
  assert.equal(cardById("card-A").date, "2026-07-20", "Karte kehrt sichtbar zurück");
  assert.equal(cardById("card-A").originalDate, undefined, "kein halber Verschoben-Zustand");
});

/* ── Race: der Kern des optimistischen Pfads ─────────────────── */

test("Rollback-Race: A optimistisch → B startet → A schlägt fehl → B bleibt erhalten", async () => {
  await seed();

  // A: 20. → 22.
  const pA = movePlanCard("card-A", "2026-07-22", "A");
  assert.equal(cardById("card-A").date, "2026-07-22");

  // B startet, BEVOR A persistiert ist: 22. → 24.
  const pB = movePlanCard("card-A", "2026-07-24", "B");
  assert.equal(cardById("card-A").date, "2026-07-24");
  assert.equal(pending.length, 2);

  // Jetzt schlägt A fehl. Ein blinder Rollback würde B's Zustand klobbern.
  pending[0].resolve({ ok: false, error: { code: "HTTP", message: "503" } });
  await pA;

  assert.equal(cardById("card-A").date, "2026-07-24", "A's Fehler klobbert B NICHT zurück");

  // B kommt sauber durch und gewinnt.
  pending[1].resolve({ ok: true, card: serverCard(SEED[0], pending[1].patch) });
  await pB;
  assert.equal(cardById("card-A").date, "2026-07-24");
});

test("Race: eine überholte ERFOLGS-Antwort überschreibt den neueren Move nicht", async () => {
  await seed();
  const pA = movePlanCard("card-A", "2026-07-22", "A");
  const pB = movePlanCard("card-A", "2026-07-24", "B");

  // A kommt verspätet, aber erfolgreich zurück — mit dem alten Zieldatum.
  pending[0].resolve({ ok: true, card: serverCard(SEED[0], pending[0].patch) });
  await pA;
  assert.equal(cardById("card-A").date, "2026-07-24", "A's Erfolg springt nicht auf den 22.");

  pending[1].resolve({ ok: true, card: serverCard(SEED[0], pending[1].patch) });
  await pB;
  assert.equal(cardById("card-A").date, "2026-07-24");
});

test("Race: der Rollback eines Moves überschreibt keine dazwischen gelaufene Mutation", async () => {
  await seed();
  // Move optimistisch losschicken …
  const pMove = movePlanCard("card-A", "2026-07-22", "");
  assert.equal(cardById("card-A").date, "2026-07-22");

  // … und die Karte, während der Move noch unterwegs ist, ausfallen lassen.
  const pCancel = cancelPlanCard("card-A", "Krank");
  pending[1].resolve({
    ok: true,
    card: { ...SEED[0], date: "2026-07-22", cancelled: true, cancelReason: "Krank" },
  });
  await pCancel;
  assert.equal(cardById("card-A").cancelled, true);

  // Jetzt schlägt der Move fehl. Ohne Bump in cancelPlanCard() sähe der
  // Move-Guard denselben requestId wie beim Start und würde den Ausfall
  // wegrollen — obwohl die DB die Karte als ausgefallen führt.
  pending[0].resolve({ ok: false, error: { code: "HTTP", message: "503" } });
  await pMove;

  assert.equal(cardById("card-A").cancelled, true, "Ausfall bleibt sichtbar");
});

/* ── Rückgängig nach Drag = Rückgängig nach Button ───────────── */

test("Rückgängig nach einer Verschiebung stellt das Ursprungsdatum wieder her", async () => {
  await seed();
  // Drag & Drop und Button rufen dieselbe Funktion — dieser Ablauf gilt
  // deshalb für beide Eingabearten gleichermaßen.
  const p = movePlanCard("card-A", "2026-07-22", "Regen");
  pending[0].resolve({ ok: true, card: serverCard(SEED[0], pending[0].patch) });
  await p;
  assert.equal(cardById("card-A").originalDate, "2026-07-20");

  const pUndo = undoAdjustment("card-A");
  pending[1].resolve({
    ok: true,
    card: { ...SEED[0], date: "2026-07-20", originalDate: undefined, movedReason: undefined },
  });
  await pUndo;

  assert.equal(pending[1].patch.plannedDate, "2026-07-20", "zurück auf moved_from_date");
  assert.equal(pending[1].patch.movedFromDate, null);
  assert.equal(cardById("card-A").date, "2026-07-20");
  assert.equal(cardById("card-A").originalDate, undefined, "Badge ist weg");
});

/* ── Guards ──────────────────────────────────────────────────── */

test("movePlanCard schreibt nicht ohne bekannte Karte", async () => {
  await seed();
  const result = await movePlanCard("gibt-es-nicht", "2026-07-22", "");
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "NO_DATA");
  assert.equal(pending.length, 0, "kein Schreibvorgang");
});

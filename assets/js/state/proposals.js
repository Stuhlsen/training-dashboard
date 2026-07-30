/* ============================================================
   STATE/PROPOSALS.JS — Vorschläge laden + annehmen/ablehnen
   (Phase 4 — Vorschlags-Schema-Konzept §3/§4/§5)

   Annehmen wendet den Vorschlag über die BEREITS BESTEHENDEN
   plan-cards-Aktionen an (createPlanCard/updatePlanCard/movePlanCard/
   cancelPlanCard aus state/plan-cards.js) statt die Karten-Logik
   (moved_from_date, week/phase-Übernahme, Ausfall-Reset) hier zu
   duplizieren — genau die Wiederverwendung, die die Konzepte verlangen.
   Nach erfolgreicher Kartenänderung: Vorschlag auf `accepted` setzen und
   konkurrierende offene Vorschläge auf dieselbe Karte automatisch `stale`
   (Schema-Konzept §4) — beides hier, nicht in der UI. */

import {
  listProposals as listProposalsAdapter,
  insertProposals as insertProposalsAdapter,
  decideProposal as decideProposalAdapter,
  markProposalsStale as markProposalsStaleAdapter,
} from "../data-access/supabase/proposals.js";
import {
  resolveAthleteProfileId,
  createPlanCard,
  updatePlanCard,
  movePlanCard,
  cancelPlanCard,
  getState as getPlanCardsState,
} from "./plan-cards.js";
import { payloadToCardData } from "../core/proposal-payload.js";
import { parseProposalImport } from "../core/proposal-import-parser.js";
import { validateImport } from "../core/proposal-validator.js";
import { getSession } from "./session.js";

let proposals = [];
let loading = false;
let error = null;
let loadedForAthleteId = null;
// Analog zu state/events.js/state/plan-cards.js: verhindert, dass eine
// überholte Antwort (Athletenwechsel während des Ladens, oder ein
// Annehmen/Ablehnen, das schneller zurückkommt als ein zuvor gestarteter
// loadProposals()) den lokalen Stand überschreibt.
let requestId = 0;
const listeners = new Set();

function notify() {
  for (const fn of listeners) fn(getState());
}

function requireUser() {
  const user = getSession();
  if (!user) return { ok: false, error: { code: "UNKNOWN", message: "Nicht eingeloggt" } };
  return { ok: true, user };
}

/** Aktueller In-Memory-Zustand → { proposals, loading, error, loadedForAthleteId }.
 *  `proposals` enthält JEDEN Status (offen/entschieden) — Konsumenten filtern
 *  selbst (s. core/proposal-groups.js für die offene Review-Liste). */
export function getState() {
  return { proposals, loading, error, loadedForAthleteId };
}

/** Lädt alle Vorschläge von `athleteId` ("athlete1"/"athlete2") neu. */
export async function loadProposals(athleteId) {
  const myRequest = ++requestId;
  loading = true;
  error = null;
  notify();

  const profileId = await resolveAthleteProfileId(athleteId);
  if (myRequest !== requestId) return { ok: false, error: { code: "UNKNOWN", message: "Überholt" } };
  if (!profileId) {
    loading = false;
    error = { code: "NO_DATA", message: "Athlet hat (noch) keinen Supabase-Account" };
    proposals = [];
    loadedForAthleteId = athleteId;
    notify();
    return { ok: false, error };
  }

  const result = await listProposalsAdapter(profileId);
  if (myRequest !== requestId) return result;
  loading = false;
  if (result.ok) {
    proposals = result.proposals;
    loadedForAthleteId = athleteId;
  } else {
    error = result.error;
  }
  notify();
  return result;
}

/** Legt einen Vorschlag des menschlichen Trainers an (Trainer-Sicht-Konzept
 *  §3, "Als Vorschlag" statt Direktänderung) — `source` liegt fest auf
 *  "trainer", `groupId` bleibt leer (Einzelvorschlag). */
export async function createTrainerProposal(athleteId, { op, targetCardId, targetUpdatedAt, payload, reason }) {
  const gate = requireUser();
  if (!gate.ok) return gate;
  const profileId = await resolveAthleteProfileId(athleteId);
  if (!profileId)
    return { ok: false, error: { code: "NO_DATA", message: "Athlet hat (noch) keinen Supabase-Account" } };

  const result = await insertProposalsAdapter(profileId, gate.user.id, [
    { op, targetCardId, targetUpdatedAt, payload, reason, source: "trainer", groupId: null },
  ]);
  if (result.ok && (loadedForAthleteId === null || athleteId === loadedForAthleteId)) {
    proposals = [...result.proposals, ...proposals];
    loadedForAthleteId = athleteId;
    notify();
  }
  return result.ok ? { ok: true, proposal: result.proposals[0] } : result;
}

/** Parst + validiert eine eingefügte Claude-Antwort (Export/Import-Workflow-
 *  Konzept §3/§4) — reiner Auswertungsschritt, schreibt NICHTS. Der Import-
 *  Dialog (ui/) ruft nur dies auf und kennt core/proposal-import-parser.js/
 *  core/proposal-validator.js nicht direkt (Schichtenregel: ui → state →
 *  core). `knownCardIds` kommt aus dem bereits geladenen plan-cards-State
 *  (Planungstab lädt die Karten des Athleten ohnehin vor dem Öffnen des
 *  Dialogs), `openProposals` analog aus dem bereits geladenen proposals-
 *  State (Dedup-Erkennung — s. core/proposal-validator.js::
 *  isDuplicateOpenProposal, bisherige v1-Einschränkung laut docs/offene-
 *  punkte.md: zwei Importe derselben Antwort erzeugten zwei offene
 *  Vorschläge). Rückgabe bei hartem Abbruch (kein JSON-Block, kaputtes
 *  JSON, fremde athlete_id, unbekannte schema_version): `{ ok:false, error
 *  }`. Bei erfolgreicher Struktur: `{ ok:true, results: [{proposal, valid,
 *  errors}] }` — ein Eintrag pro Vorschlag, Teilerfolg möglich (Konzept §4). */
export function previewClaudeImport(text) {
  const gate = requireUser();
  if (!gate.ok) return gate;

  const parsed = parseProposalImport(text);
  if (!parsed.ok) return parsed;

  const knownCardIds = new Set(getPlanCardsState().cards.map((c) => c.id));
  const openProposals = proposals
    .filter((p) => p.status === "open" && p.source === "claude")
    .map((p) => ({ op: p.op, targetCardId: p.targetCardId, payload: p.payload }));
  return validateImport(parsed.data, {
    ownAthleteId: gate.user.id,
    knownCardIds,
    openProposals,
  });
}

/** Legt die validen Einträge eines Claude-Imports als offene Vorschläge an —
 *  derselbe Insert-Pfad wie der menschliche Trainer (insertProposalsAdapter),
 *  `source: "claude"`, `created_by` = der importierende Athlet selbst
 *  (Schema-Konzept §5). Alle Einträge EINES Imports teilen sich eine
 *  `groupId`, damit sie im Review als zusammengehörige Runde erscheinen und
 *  über "Alle übernehmen" gemeinsam angenommen werden können (Schema-
 *  Konzept §5, V1). `validProposals` sind die rohen, bereits als valide
 *  geprüften Einträge aus previewClaudeImport() (`op`/`target_card_id`/
 *  `target_updated_at`/`payload`/`reason` im JSON-Schema-Format).
 *  @param {string} athleteId interne Kennung ("athlete1"/"athlete2") — nur
 *    für den lokalen Cache-Schlüssel, athlete_id/created_by sind immer die
 *    eigene Profil-UUID (Selbst-Import). */
export async function importClaudeProposals(athleteId, validProposals) {
  const gate = requireUser();
  if (!gate.ok) return gate;
  if (!validProposals?.length) return { ok: true, proposals: [] };

  const groupId = crypto.randomUUID();
  const items = validProposals.map((p) => ({
    op: p.op,
    targetCardId: p.target_card_id ?? null,
    targetUpdatedAt: p.target_updated_at ?? null,
    payload: p.payload,
    reason: p.reason ?? null,
    source: "claude",
    groupId,
  }));

  const result = await insertProposalsAdapter(gate.user.id, gate.user.id, items);
  if (result.ok && (loadedForAthleteId === null || athleteId === loadedForAthleteId)) {
    proposals = [...result.proposals, ...proposals];
    loadedForAthleteId = athleteId;
    notify();
  }
  return result;
}

function replaceLocal(updated) {
  const byId = new Map(updated.map((p) => [p.id, p]));
  proposals = proposals.map((p) => byId.get(p.id) || p);
}

/** Wendet EINEN Vorschlag an — Kartenmutation zuerst, danach Status. Bricht
 *  ohne Statusänderung ab, wenn die Kartenmutation fehlschlägt (kein halb
 *  angenommener Vorschlag). `athleteId` ist die interne Kennung
 *  ("athlete1"/"athlete2"), die die UI ohnehin aus Data.activeAthleteId
 *  kennt — plan-cards.js's Aktionen erwarten dieselbe Form. */
export async function acceptProposal(athleteId, proposal) {
  const gate = requireUser();
  if (!gate.ok) return gate;

  // Veraltet-Erkennung (Schema-Konzept §4): weicht target_updated_at vom
  // aktuellen updated_at der Zielkarte ab, wurde die Karte seit Erstellung
  // des Vorschlags geändert (z. B. der Athlet selbst hat sie bearbeitet,
  // nicht nur ein konkurrierender Vorschlag — der Fall unten). Ein
  // Annehmen würde diese Änderung sonst stillschweigend überschreiben.
  // Fehlt die Karte im bereits geladenen State (noch nicht geladen/
  // inzwischen gelöscht), blockiert das NICHT — nur ein tatsächlicher
  // Abweichungsbeleg tut das.
  if (proposal.targetCardId && proposal.targetUpdatedAt) {
    const liveCard = getPlanCardsState().cards.find((c) => c.id === proposal.targetCardId);
    if (liveCard && liveCard.updatedAt !== proposal.targetUpdatedAt) {
      await markProposalsStaleAdapter([proposal.id]);
      replaceLocal([{ ...proposal, status: "stale" }]);
      notify();
      return {
        ok: false,
        error: { code: "SCHEMA", message: "Vorschlag ist veraltet — die Karte wurde seitdem geändert." },
      };
    }
  }

  let cardResult;
  if (proposal.op === "add") {
    cardResult = await createPlanCard(athleteId, payloadToCardData(proposal.payload));
  } else if (proposal.op === "replace") {
    cardResult = await updatePlanCard(proposal.targetCardId, payloadToCardData(proposal.payload));
  } else if (proposal.op === "move") {
    cardResult = await movePlanCard(proposal.targetCardId, proposal.payload?.plan_date, proposal.reason || "");
  } else if (proposal.op === "cancel") {
    cardResult = await cancelPlanCard(proposal.targetCardId, proposal.payload?.reason || proposal.reason || "");
  } else {
    return { ok: false, error: { code: "SCHEMA", message: `Unbekannte Operation: ${proposal.op}` } };
  }
  if (!cardResult.ok) return cardResult;

  const decided = await decideProposalAdapter(proposal.id, "accepted");
  if (!decided.ok) return decided;

  // Konkurrierende offene Vorschläge auf dieselbe Karte werden stale — nur
  // relevant bei replace/move/cancel (add hat kein targetCardId).
  const competitorIds = proposal.targetCardId
    ? proposals
        .filter((p) => p.id !== proposal.id && p.status === "open" && p.targetCardId === proposal.targetCardId)
        .map((p) => p.id)
    : [];
  const staleResult = competitorIds.length
    ? await markProposalsStaleAdapter(competitorIds)
    : { ok: true, proposals: [] };

  replaceLocal([decided.proposal, ...(staleResult.ok ? staleResult.proposals : [])]);
  notify();
  return { ok: true };
}

/** "Alle übernehmen" für eine Gruppe (Schema-Konzept §5) — sequentiell,
 *  damit Konkurrenz-Erkennung (stale) zwischen den Elementen einer Gruppe
 *  korrekt greift, falls zwei Gruppenmitglieder dieselbe Karte anfassen.
 *  Bricht NICHT beim ersten Fehler ab — jedes Element bekommt eine eigene
 *  Chance, Fehler werden gesammelt zurückgegeben. */
export async function acceptGroup(athleteId, groupId) {
  const items = proposals.filter((p) => p.status === "open" && p.groupId === groupId);
  const results = [];
  for (const p of items) {
    results.push({ id: p.id, result: await acceptProposal(athleteId, p) });
  }
  const failed = results.filter((r) => !r.result.ok);
  return { ok: failed.length === 0, results, failed };
}

export async function rejectProposal(id) {
  const gate = requireUser();
  if (!gate.ok) return gate;
  const result = await decideProposalAdapter(id, "rejected");
  if (result.ok) {
    replaceLocal([result.proposal]);
    notify();
  }
  return result;
}

/** Zieht einen SELBST erstellten Vorschlag zurück (source "claude" — der
 *  Athlet hat ihn per Claude-Import angelegt, s. docs/phase-4-konzept-
 *  export-import-workflow.md). Anders als `rejectProposal()`: "ablehnen"
 *  passt semantisch nicht auf einen eigenen Vorschlag, den man sich anders
 *  überlegt hat. Nutzt denselben `decideProposal`-Adapter/dieselbe RLS-
 *  Spalten-Härtung (status, decided_at) wie accept/reject — nur ein
 *  anderer erlaubter Statuswert (proposals_status_check kennt "withdrawn"
 *  seit Migration 0006). Bisher ohne UI-Pfad: Zurückziehen lief nur über
 *  harte Löschung (RLS erlaubt DELETE bei status='open'), s. docs/offene-
 *  punkte.md. */
export async function withdrawProposal(id) {
  const gate = requireUser();
  if (!gate.ok) return gate;
  const result = await decideProposalAdapter(id, "withdrawn");
  if (result.ok) {
    replaceLocal([result.proposal]);
    notify();
  }
  return result;
}

export function onProposalsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

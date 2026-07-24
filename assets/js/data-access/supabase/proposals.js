import { supabase, getAuthedClient } from "./client.js";

const NOT_CONFIGURED = { code: "UNKNOWN", message: "Supabase nicht konfiguriert" };
const SELECT_COLS =
  "id, athlete_id, created_by, source, group_id, op, target_card_id, target_updated_at, " +
  "payload, reason, status, created_at, decided_at";

/** Mapped eine proposals-Zeile auf die Domänen-Shape, die state/proposals.js
 *  und die Review-UI (ui/proposal-list.js, ui/proposal-compare.js) nutzen —
 *  Schema-Konzept §1/§3. */
function toProposal(row) {
  return {
    id: row.id,
    athleteId: row.athlete_id,
    createdBy: row.created_by,
    source: row.source,
    groupId: row.group_id,
    op: row.op,
    targetCardId: row.target_card_id,
    targetUpdatedAt: row.target_updated_at,
    payload: row.payload,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  };
}

/** Lädt ALLE Vorschläge (jeder Status) eines Athleten, neueste zuerst —
 *  Konsumenten filtern selbst nach `status` (analog zu state/events.js,
 *  das ebenfalls unsortiert nach Status liefert). RLS lässt nur den
 *  betroffenen Athleten und dessen Trainer durch (0006-Migration). */
export async function listProposals(athleteId) {
  if (!supabase) return { ok: true, proposals: [] };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("proposals")
    .select(SELECT_COLS)
    .eq("athlete_id", athleteId)
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, proposals: data.map(toProposal) };
}

/** Legt einen oder mehrere Vorschläge auf einmal an — derselbe Insert-Pfad
 *  für den menschlichen Trainer (ein Element) und einen Claude-Import
 *  (mehrere Elemente, gemeinsame `groupId` — Schema-Konzept §5 "Alle
 *  übernehmen"). `items`: [{ op, targetCardId, targetUpdatedAt, payload,
 *  reason, source, groupId }]. */
export async function insertProposals(athleteId, createdBy, items) {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  if (!items?.length) return { ok: true, proposals: [] };
  const client = (await getAuthedClient()) ?? supabase;
  const rows = items.map((item) => ({
    athlete_id: athleteId,
    created_by: createdBy,
    source: item.source,
    group_id: item.groupId ?? null,
    op: item.op,
    target_card_id: item.targetCardId ?? null,
    target_updated_at: item.targetUpdatedAt ?? null,
    payload: item.payload,
    reason: item.reason ?? null,
  }));
  const { data, error } = await client.from("proposals").insert(rows).select(SELECT_COLS);
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, proposals: data.map(toProposal) };
}

/** Setzt einen Vorschlag auf `accepted`/`rejected` inkl. `decided_at` — die
 *  einzigen Spalten, die der Athlet laut Spalten-Härtung (0001) schreiben
 *  darf. Annehmen/Ablehnen ist eine bewusste Athleten-Entscheidung, anders
 *  als `stale` (Systemfolge, s. markProposalsStale). */
export async function decideProposal(id, status) {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("proposals")
    .update({ status, decided_at: new Date().toISOString() })
    .eq("id", id)
    .select(SELECT_COLS)
    .single();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, proposal: toProposal(data) };
}

/** Markiert konkurrierende offene Vorschläge auf dieselbe Karte als `stale`
 *  (Schema-Konzept §4, Veraltet-Erkennung bei Annahme) — kein `decided_at`,
 *  das ist keine bewusste Athleten-Entscheidung sondern eine Systemfolge.
 *  No-op bei leerer Liste (spart einen Request im Regelfall "keine Konkurrenz"). */
export async function markProposalsStale(ids) {
  if (!ids?.length) return { ok: true, proposals: [] };
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("proposals")
    .update({ status: "stale" })
    .in("id", ids)
    .select(SELECT_COLS);
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, proposals: data.map(toProposal) };
}

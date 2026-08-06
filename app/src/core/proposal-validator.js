/* ============================================================
   CORE/PROPOSAL-VALIDATOR.JS — Struktur- und Semantikprüfung für
   Vorschlags-JSON (kein DOM)
   (Phase 4 — Vorschlags-Schema-Konzept §4)

   Prüft, was Claude (Import) ODER der menschliche Trainer (App-UI erzeugt
   dasselbe JSON, s. Schema-Konzept §3) an payload/op-Kombination liefert —
   EIN Validator für beide Pfade. Reihenfolge: erst Struktur (unbekannte
   Felder, bekannte Ops/Typen), dann Semantik (target_card_id-Existenz,
   Datum nicht in der Vergangenheit). Jede Regel liefert einen benannten
   Fehler; validateProposal() sammelt ALLE Fehler statt beim ersten
   abzubrechen (Konzept §4: "der Import zeigt alle Fehler gesammelt").

   validateEnvelope()/validateImport() prüfen die Datei-Ebene (schema_version,
   athlete) — das sind die beiden harten Abbrüche aus dem Export/Import-
   Workflow-Konzept §4/§6, VOR jeder Einzelprüfung.
   ============================================================ */

import { localISODate } from "./format.js";
import { KNOWN_PLAN_TYPES } from "./plan-config.js";
import { validateWorkoutStructure } from "./workout-validator.js";

export const SCHEMA_VERSION = 1;
export const KNOWN_OPS = ["add", "replace", "move", "cancel"];

const TSS_MIN = 0;
const TSS_MAX = 400;

const ENVELOPE_FIELDS = ["schema_version", "athlete", "source", "proposals"];
const PROPOSAL_FIELDS = ["op", "target_card_id", "target_updated_at", "reason", "payload"];
// workout_structure (D1, docs/konzept-progressionssteuerung.md) — Prompt-
// Vorlage selbst wird erst in Fenster E (Schritt 12) angepasst, das Feld
// muss aber schon jetzt bekannt sein, sonst scheitert jeder Vorschlag mit
// Struktur an "Unbekannte payload-Felder" (derselbe Fehler wie beim
// bisherigen Payload-Schema-Bug, s. Konzept Schrittfolge Fußnote).
const PAYLOAD_FIELDS_BY_OP = {
  add: ["title", "type", "plan_date", "target_tss", "km", "workout", "workout_structure", "note"],
  replace: ["title", "type", "plan_date", "target_tss", "km", "workout", "workout_structure", "note"],
  move: ["plan_date"],
  cancel: ["reason"],
};

function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Strukturvergleich, ordnungsunabhängig bei Objekt-Keys (payload kommt aus
 *  neu generiertem JSON — dieselbe Bedeutung kann in anderer Key-Reihenfolge
 *  ankommen, ein `JSON.stringify()`-Vergleich würde solche Duplikate
 *  übersehen). Reicht für payload/target_card_id/op — durchweg einfache
 *  JSON-Werte (keine Dates/Functions/Symbols).
 *  @param {*} a @param {*} b @returns {boolean} */
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a == null || b == null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === "object") {
    const keysA = Object.keys(a),
      keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
  }
  return false;
}

/** Prüft, ob ein Import-Eintrag inhaltlich bereits als offener Claude-
 *  Vorschlag existiert (Dedup-Erkennung — bisher bewusste v1-Einschränkung,
 *  s. docs/offene-punkte.md: "zwei Importe derselben Antwort erzeugen zwei
 *  offene Vorschläge"). Gleich = gleiches `op`, gleiche `target_card_id`
 *  (bzw. beide null bei `add`) UND strukturell gleiches `payload`.
 *  `reason`/`target_updated_at` fließen bewusst NICHT ein: ein zweiter
 *  Import mit nur leicht umformulierter Begründung, aber identischem
 *  Vorschlag, soll trotzdem als Duplikat erkannt werden.
 *  @param {any} proposal ein Element aus data.proposals[]
 *  @param {Array<{op:string, targetCardId:string|null, payload:any}>} openProposals
 *  @returns {boolean} */
export function isDuplicateOpenProposal(proposal, openProposals) {
  return (openProposals || []).some(
    (p) =>
      p.op === proposal.op &&
      (p.targetCardId ?? null) === (proposal.target_card_id ?? null) &&
      deepEqual(p.payload, proposal.payload)
  );
}

/** Datei-Ebene: schema_version bekannt, `athlete` gehört dem importierenden
 *  Athleten, `proposals` ist eine Liste. Harter Abbruch der GESAMTEN Datei
 *  bei Fehler (Konzept §4 Schritt 1/2, §6) — keine Teilprüfung.
 *  @param {any} data geparstes Import-JSON
 *  @param {{ownAthleteId?: string}} [ctx] `ownAthleteId` = Profil-UUID des
 *    eingeloggten Athleten; ohne sie wird der Athlet-Abgleich übersprungen
 *    (z. B. für den menschlichen Trainer-Pfad, der kein Import-JSON prüft).
 *  @returns {{ok:true}|{ok:false, error:{code:string, message:string}}} */
export function validateEnvelope(data, { ownAthleteId } = {}) {
  if (!isPlainObject(data)) {
    return { ok: false, error: { code: "SCHEMA", message: "Kein gültiges JSON-Objekt." } };
  }
  const unknown = Object.keys(data).filter((k) => !ENVELOPE_FIELDS.includes(k));
  if (unknown.length) {
    return { ok: false, error: { code: "SCHEMA", message: `Unbekannte Felder: ${unknown.join(", ")}` } };
  }
  if (data.schema_version !== SCHEMA_VERSION) {
    return {
      ok: false,
      error: {
        code: "SCHEMA",
        message: `Unbekannte Schema-Version (${data.schema_version ?? "fehlt"}) — bitte das Briefing neu exportieren und den Import erneut versuchen.`,
      },
    };
  }
  if (ownAthleteId && data.athlete !== ownAthleteId) {
    return {
      ok: false,
      error: { code: "SCHEMA", message: "Dieser Export gehört zu einem anderen Account." },
    };
  }
  if (!Array.isArray(data.proposals)) {
    return { ok: false, error: { code: "SCHEMA", message: "Feld 'proposals' fehlt oder ist keine Liste." } };
  }
  return { ok: true };
}

/** Validiert EINEN Vorschlag — Struktur, dann Semantik. Sammelt alle Fehler.
 *  @param {any} proposal ein Element aus data.proposals[]
 *  @param {{knownCardIds?: Set<string>, today?: string, openProposals?: Array}} [ctx]
 *    `knownCardIds` = IDs der `plan_cards` des Athleten (nur diese dürfen als
 *    `target_card_id` referenziert werden — s. Konzept §4 "target_card_id
 *    existiert und gehört dem Athleten"). `today` fixierbar für Tests.
 *    `openProposals` = bereits offene Claude-Vorschläge des Athleten
 *    (Dedup-Erkennung, s. isDuplicateOpenProposal()).
 *  @returns {{valid:boolean, errors:string[]}} */
export function validateProposal(proposal, { knownCardIds = new Set(), today, openProposals = [] } = {}) {
  const todayIso = today ?? localISODate();
  const errors = [];

  if (!isPlainObject(proposal)) {
    return { valid: false, errors: ["Kein gültiges Objekt."] };
  }

  const unknownTop = Object.keys(proposal).filter((k) => !PROPOSAL_FIELDS.includes(k));
  if (unknownTop.length) errors.push(`Unbekannte Felder: ${unknownTop.join(", ")}`);

  if (!KNOWN_OPS.includes(proposal.op)) {
    errors.push(`Unbekannte Operation '${proposal.op}'.`);
    // Pflichtfelder hängen am op — ohne bekanntes op nicht sinnvoll weiterprüfbar.
    return { valid: false, errors };
  }

  // ── target_card_id/target_updated_at: Pflicht außer bei add, das eine
  //    NEUE Karte anlegt und daher keine Zielkarte referenzieren kann.
  if (proposal.op === "add") {
    if (proposal.target_card_id != null) errors.push("target_card_id ist bei 'add' nicht erlaubt.");
  } else {
    if (!proposal.target_card_id) {
      errors.push("target_card_id fehlt.");
    } else if (!knownCardIds.has(proposal.target_card_id)) {
      errors.push("target_card_id ist unbekannt oder gehört nicht zu diesem Athleten.");
    }
    if (!proposal.target_updated_at) errors.push("target_updated_at fehlt.");
  }

  // ── payload: Struktur (bekannte Felder je op) + Pflichtfelder + Semantik.
  const payload = proposal.payload;
  if (!isPlainObject(payload)) {
    errors.push("payload fehlt oder ist kein Objekt.");
    return { valid: errors.length === 0, errors };
  }

  const allowedPayloadFields = PAYLOAD_FIELDS_BY_OP[proposal.op] || [];
  const unknownPayload = Object.keys(payload).filter((k) => !allowedPayloadFields.includes(k));
  if (unknownPayload.length) {
    errors.push(`Unbekannte payload-Felder für '${proposal.op}': ${unknownPayload.join(", ")}`);
  }

  const needsPlanDate = proposal.op === "add" || proposal.op === "replace" || proposal.op === "move";
  if (needsPlanDate) {
    if (!payload.plan_date) {
      errors.push("payload.plan_date fehlt.");
    } else if (payload.plan_date < todayIso) {
      errors.push("payload.plan_date liegt in der Vergangenheit.");
    }
  }
  if (proposal.op === "add" && !payload.title) {
    errors.push("payload.title fehlt.");
  }
  if ((proposal.op === "add" || proposal.op === "replace") && payload.type != null) {
    if (!KNOWN_PLAN_TYPES.includes(payload.type)) errors.push(`Unbekannter Typ '${payload.type}'.`);
  }
  if ((proposal.op === "add" || proposal.op === "replace") && payload.target_tss != null) {
    if (!(Number.isFinite(payload.target_tss) && payload.target_tss >= TSS_MIN && payload.target_tss <= TSS_MAX)) {
      errors.push(`payload.target_tss außerhalb ${TSS_MIN}–${TSS_MAX}.`);
    }
  }
  if ((proposal.op === "add" || proposal.op === "replace") && payload.workout_structure != null) {
    const wsResult = validateWorkoutStructure(payload.workout_structure);
    if (!wsResult.valid) {
      errors.push(...wsResult.errors.map((e) => `payload.workout_structure: ${e}`));
    }
  }

  if (isDuplicateOpenProposal(proposal, openProposals)) {
    errors.push("Bereits als offener Vorschlag vorhanden (Duplikat eines früheren Imports).");
  }

  return { valid: errors.length === 0, errors };
}

/** Validiert eine komplette Import-Datei: Envelope zuerst (harter Abbruch
 *  der GESAMTEN Datei bei Fehler), danach jeden Vorschlag einzeln
 *  (Teilerfolg möglich — Import-Workflow-Konzept §4).
 *  @param {any} data geparstes Import-JSON
 *  @param {{ownAthleteId?: string, knownCardIds?: Set<string>, today?: string, openProposals?: Array}} [ctx]
 *  @returns {{ok:true, results: Array<{proposal:any, valid:boolean, errors:string[]}>}|{ok:false, error:{code:string,message:string}}} */
export function validateImport(data, ctx = {}) {
  const envelope = validateEnvelope(data, ctx);
  if (!envelope.ok) return envelope;
  const results = data.proposals.map((p) => ({ proposal: p, ...validateProposal(p, ctx) }));
  return { ok: true, results };
}

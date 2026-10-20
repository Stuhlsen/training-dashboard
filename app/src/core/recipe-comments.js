/* ============================================================
   CORE/RECIPE-COMMENTS.JS — Kommentare zu Rezepten (kein I/O)
   (Fahrplan 30, B5; Entscheidungen K-1 bis K-4)

   Regeln, die auch die Datenbank erzwingt (Migration 0077): 1 bis 500 Zeichen,
   nicht nur Leerraum, kein Daumen auf den eigenen Kommentar, Schreiben nur mit
   gesetztem Pseudonym. Hier stehen sie, damit die Oberfläche gar nicht erst einen
   Knopf anbietet, der ohnehin abgelehnt würde.
   Kommentare sind Nutzertext: diese Datei prüft Länge und Leerraum, escaped aber
   nichts — die Oberfläche zeigt den Text immer als Text (nie als HTML).
   ============================================================ */

export const COMMENT_MAX_CHARS = 500;

/**
 * Prüft einen Kommentartext. Gibt den getrimmten Text zurück, der gesendet wird.
 * Gezählt wird nach dem Trimmen, in Zeichen (nicht UTF-16-Einheiten): ein Emoji zählt eins.
 * @param {unknown} text
 * @returns {{ ok: true, text: string } | { ok: false, reason: "empty" | "too_long" }}
 */
export function validateCommentText(text) {
  const clean = typeof text === "string" ? text.trim() : "";
  if (clean.length === 0) return { ok: false, reason: "empty" };
  if ([...clean].length > COMMENT_MAX_CHARS) return { ok: false, reason: "too_long" };
  return { ok: true, text: clean };
}

/**
 * Wie viele Zeichen noch frei sind (kann unter null fallen, wenn der Text zu lang ist).
 * @param {string | null | undefined} text
 * @returns {number}
 */
export function remainingChars(text) {
  return COMMENT_MAX_CHARS - [...(typeof text === "string" ? text.trim() : "")].length;
}

/**
 * Teil der E-Mail vor dem @, kleingeschrieben. Leer, wenn keine E-Mail da ist.
 * @param {string | null | undefined} email
 */
function emailLocalPart(email) {
  if (typeof email !== "string") return "";
  return email.split("@")[0].trim().toLowerCase();
}

/**
 * Hat der Athlet ein eigenes Pseudonym gesetzt? Nein bei leerem Namen und bei dem
 * Namen, den die Anmeldung aus der E-Mail ableitet (Teil vor dem @) — der wäre sonst
 * für alle sichtbar. Dieselbe Regel prüft der Trigger der Datenbank.
 * @param {string | null | undefined} displayName
 * @param {string | null | undefined} email
 * @returns {boolean}
 */
export function hasPseudonym(displayName, email) {
  const name = typeof displayName === "string" ? displayName.trim() : "";
  if (name === "") return false;
  const local = emailLocalPart(email);
  return local === "" || name.toLowerCase() !== local;
}

/**
 * Reihenfolge der Anzeige: die meisten Daumen zuerst (hoch minus runter), bei Gleichstand
 * der ältere Kommentar zuerst. Gibt eine neue Liste zurück, die Eingabe bleibt unverändert.
 * @template {{ id: string, up: number, down: number, createdAt: string }} C
 * @param {C[]} comments
 * @returns {C[]}
 */
export function sortCommentsByThumbs(comments) {
  const score = (c) => (c.up || 0) - (c.down || 0);
  return [...(Array.isArray(comments) ? comments : [])].sort((a, b) => {
    const diff = score(b) - score(a);
    if (diff !== 0) return diff;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Daumen auf einen Kommentar: nur auf fremde, nur angemeldet.
 * @param {{ isMine?: boolean } | null | undefined} comment
 * @param {string | null | undefined} userId
 */
export function canVoteComment(comment, userId) {
  if (!comment || !userId) return false;
  return comment.isMine !== true;
}

/**
 * Löschen: der Schreiber den eigenen, der Admin jeden. Der Server prüft beides noch einmal.
 * @param {{ isMine?: boolean } | null | undefined} comment
 * @param {boolean} isAdmin
 */
export function canDeleteComment(comment, isAdmin) {
  if (!comment) return false;
  return comment.isMine === true || isAdmin === true;
}

/**
 * "20.10.2026" aus einem ISO-Zeitstempel; leer bei ungültigem Wert.
 * @param {string | null | undefined} iso
 */
export function formatCommentDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

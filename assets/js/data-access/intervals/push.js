/* ============================================================
   DATA-ACCESS/INTERVALS/PUSH.JS — Workout-Push zu intervals.icu
   I/O-Grenze (Schichtenregel): reiner fetch-Wrapper, kein DOM/localStorage.
   Umgezogen aus ui/planned.js (Karten-CRUD, Schritt 2, M3) — behebt den
   Schichten-Verstoß (externe API-Calls gehörten nicht nach ui/) UND den
   4×-Duplikat-Bug: statt eines heuristischen Matches über Name+Datum+
   Description (_findExistingEvent, alt) nutzt der Push jetzt den
   events/bulk-Endpoint mit upsert=true und external_id = plan_cards.id —
   der Server matcht selbst, kein Duplikat bei erneutem Push nach einem
   Verschieben. S. docs/phase-3-konzept-planungstab.md §5/§8.

   ACHTUNG: external_id/upsert-Verhalten ist anhand von Forum-/API-Hinweisen
   recherchiert (intervals.icu-Events tragen ein external_id-Feld, der
   events/bulk-Endpoint unterstützt upsert darüber), aber noch NICHT live
   gegen einen echten Account verifiziert. Vor Vertrauen in Produktion:
   Karte mit Workout pushen → auf intervals.icu ein Event prüfen → Karte
   verschieben → erneut pushen → weiterhin nur EIN Event (aktualisiert,
   kein Duplikat). Analog zum RPE/Feel-Feldnamen-Livecheck (s. AGENTS.md).
   ============================================================ */

function authHeader(token) {
  return { Authorization: "Basic " + btoa("API_KEY:" + token) };
}

/** Altes, starres Workout-Format (migrierte Plan-2-Karten):
 *  { warmup, intervals, duration, rest, cooldown, pct, watts, label }. */
function legacyDescription(w, details) {
  const lines = [];
  lines.push("Warmup");
  lines.push(`- ${w.warmup}m 60% 85rpm`);
  lines.push("");

  if (w.intervals && w.duration) {
    lines.push(`Main Set ${w.intervals}x`);
    lines.push(`- ${w.duration}m ${w.pct[0]}-${w.pct[1]}% 90rpm`);
    if (w.rest) lines.push(`- ${w.rest}m 50% 80rpm`);
    lines.push("");
  }

  lines.push("Cooldown");
  lines.push(`- ${w.cooldown}m 50%-40% 80rpm`);

  const workoutText = lines.join("\n");
  const label = w.label + (details ? `\n${details}` : "");
  return `${label}\n\n${workoutText}`;
}

/** Neue Blockform (Karten-Dialog, Schritt 2): { blocks: [{ type, text }] }
 *  ohne numerische %FTP-Angaben — Beschreibungstext gruppiert die Freitext-
 *  Zeilen unter Warmup/Main Set/Cooldown analog zum alten Textformat. */
function blockDescription(blocks, details) {
  const HEADING = { warmup: "Warmup", interval: "Main Set", cooldown: "Cooldown" };
  const lines = [];
  let lastHeading = null;
  for (const b of blocks) {
    const heading = HEADING[b.type] || "Main Set";
    if (heading !== lastHeading) {
      if (lastHeading) lines.push("");
      lines.push(heading);
      lastHeading = heading;
    }
    lines.push(`- ${b.text}`);
  }
  const text = lines.join("\n");
  return details ? `${details}\n\n${text}` : text;
}

/** @returns {{ ok: true, description: string } | { ok: false, error: import("../../types.js").AppError }} */
function buildDescription(card) {
  const w = card.workout;
  if (!w) {
    return { ok: false, error: { code: "NO_DATA", message: "Kein strukturiertes Workout definiert" } };
  }
  if (Array.isArray(w.blocks)) {
    if (!w.blocks.length) {
      return { ok: false, error: { code: "NO_DATA", message: "Kein strukturiertes Workout definiert" } };
    }
    return { ok: true, description: blockDescription(w.blocks, card.details) };
  }
  // Altes Format: intervals.icu-Workout-Text braucht %FTP (w.pct) — nicht
  // alle migrierten Objekte tragen das.
  if (w.intervals && w.duration && !w.pct) {
    return {
      ok: false,
      error: { code: "NO_DATA", message: "Workout ohne %FTP-Angabe (pct) — Push nicht möglich" },
    };
  }
  return { ok: true, description: legacyDescription(w, card.details) };
}

/** Pusht das Workout einer Karte als Kalender-Event zu intervals.icu.
 *  `card` ist die Session-Shape aus data-access/supabase/plan-cards.js::toSession().
 *  @returns {Promise<import("../../types.js").Result>} */
export async function pushCardWorkout(card, token, athleteId) {
  const built = buildDescription(card);
  if (!built.ok) return built;

  const event = {
    category: "WORKOUT",
    name: card.name,
    description: built.description,
    type: "Ride",
    start_date_local: card.date + "T07:00:00",
    external_id: card.id,
  };

  try {
    const res = await fetch(`https://intervals.icu/api/v1/athlete/${athleteId}/events/bulk?upsert=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(token) },
      body: JSON.stringify([event]),
    });
    if (!res.ok) {
      const txt = await res.text();
      return { ok: false, error: { code: "HTTP", message: `intervals.icu Fehler ${res.status}: ${txt}` } };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: { code: "NETWORK", message: e.message, cause: e } };
  }
}

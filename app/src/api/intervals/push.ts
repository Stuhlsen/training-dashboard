/* ============================================================
   API/INTERVALS/PUSH.TS — Workout-Push zu intervals.icu

   Port von data-access/intervals/push.js (Vanilla, Etappe 6d). Reiner
   fetch-Wrapper, kein Supabase-Bezug — deshalb bewusst nicht unter
   api/supabase/. Nutzt den events/bulk-Endpoint mit upsert=true und
   external_id = plan_cards.id: der Server matcht selbst, kein Duplikat bei
   erneutem Push nach einem Verschieben (der historische 4×-Duplikat-Bug,
   s. Vanilla-Kopfkommentar).

   external_id/upsert-Verhalten live gegen einen echten Account verifiziert
   (26.08.2026, Alex, dashboard-dev-Build im lokalen Docker-Container):
   Karte mit Workout gepusht → ein Event auf intervals.icu → Karte
   verschoben → erneut gepusht → weiterhin nur EIN Event (aktualisiert,
   kein Duplikat). Frühere Unsicherheit (nur aus Forum-/API-Hinweisen
   recherchiert, s. Git-Historie) damit ausgeräumt.
   ============================================================ */

import type { PlanCard, Result } from "../types";

function authHeader(token: string): Record<string, string> {
  return { Authorization: "Basic " + btoa("API_KEY:" + token) };
}

/** Altes, starres Workout-Format (migrierte Plan-2-Karten). */
interface LegacyWorkout {
  warmup: number;
  cooldown: number;
  label: string;
  intervals?: number;
  duration?: number;
  rest?: number;
  pct?: [number, number];
}

interface WorkoutBlock {
  type: string;
  text: string;
}

/** Neue Blockform (Karten-Dialog, Etappe 6a): { blocks: [{ type, text }] }
 *  ohne numerische %FTP-Angaben. */
interface BlockWorkout {
  blocks: WorkoutBlock[];
}

function isBlockWorkout(w: unknown): w is BlockWorkout {
  return !!w && typeof w === "object" && Array.isArray((w as BlockWorkout).blocks);
}

function legacyDescription(w: LegacyWorkout, details?: string | null): string {
  const lines: string[] = [];
  lines.push("Warmup");
  lines.push(`- ${w.warmup}m 60% 85rpm`);
  lines.push("");

  if (w.intervals && w.duration) {
    lines.push(`Main Set ${w.intervals}x`);
    lines.push(`- ${w.duration}m ${w.pct?.[0]}-${w.pct?.[1]}% 90rpm`);
    if (w.rest) lines.push(`- ${w.rest}m 50% 80rpm`);
    lines.push("");
  }

  lines.push("Cooldown");
  lines.push(`- ${w.cooldown}m 50%-40% 80rpm`);

  const workoutText = lines.join("\n");
  const label = w.label + (details ? `\n${details}` : "");
  return `${label}\n\n${workoutText}`;
}

/** Beschreibungstext gruppiert die Freitext-Zeilen unter Warmup/Main
 *  Set/Cooldown analog zum alten Textformat. */
function blockDescription(blocks: WorkoutBlock[], details?: string | null): string {
  const HEADING: Record<string, string> = { warmup: "Warmup", interval: "Main Set", cooldown: "Cooldown" };
  const lines: string[] = [];
  let lastHeading: string | null = null;
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

function buildDescription(card: Pick<PlanCard, "workout" | "details">): Result<{ description: string }> {
  const w = card.workout;
  if (!w) {
    return { ok: false, error: { code: "NO_DATA", message: "Kein strukturiertes Workout definiert" } };
  }
  if (isBlockWorkout(w)) {
    if (!w.blocks.length) {
      return { ok: false, error: { code: "NO_DATA", message: "Kein strukturiertes Workout definiert" } };
    }
    return { ok: true, description: blockDescription(w.blocks, card.details) };
  }
  const legacy = w as LegacyWorkout;
  // Altes Format: intervals.icu-Workout-Text braucht %FTP (pct) — nicht
  // alle migrierten Objekte tragen das.
  if (legacy.intervals && legacy.duration && !legacy.pct) {
    return {
      ok: false,
      error: { code: "NO_DATA", message: "Workout ohne %FTP-Angabe (pct) — Push nicht möglich" },
    };
  }
  return { ok: true, description: legacyDescription(legacy, card.details) };
}

/** Pusht das Workout einer Karte als Kalender-Event zu intervals.icu.
 *  `card` trägt das bereits aufgelöste Datum (inkl. Verschiebung). */
export async function pushCardWorkout(card: PlanCard, token: string, athleteId: string): Promise<Result> {
  const built = buildDescription(card);
  if (!built.ok) return built;

  const event = {
    category: "WORKOUT",
    name: card.name,
    description: built.description,
    type: "Ride",
    start_date_local: `${card.date}T07:00:00`,
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
    return { ok: false, error: { code: "NETWORK", message: e instanceof Error ? e.message : String(e) } };
  }
}

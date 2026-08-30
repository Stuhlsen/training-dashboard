/* ============================================================
   SCRIPTS/LIB/PLAN-CARDS-FETCH.JS — plan_cards aus Supabase laden
   (Progressionssteuerung C1, docs/konzept-progressionssteuerung.md)

   `workout_structure` (Migration 0013) existiert ausschließlich in
   Supabase plan_cards — der alte statische Plan (scripts/lib/plan2.js,
   PLANNED_SESSIONS) kennt keine Struktur. Für C1 muss generate-data.js
   deshalb erstmals plan_cards lesen.

   Login-Muster identisch zu scripts/lib/ftp-history.js::loadFtpHistory()
   (dieselben Athleten-Credentials sind in generate-data.js bereits im
   Scope) — plan_cards ist zwar `anon`-lesbar (RLS "öffentlich lesbar",
   0001_initial_schema.sql, seither unverändert), der Login liefert aber
   `user.id` sicher statt eine athlete_id-UUID hart zu kodieren.

   Gibt bei fehlenden Credentials/Netzwerkfehlern `[]` zurück statt zu
   werfen — derselbe Degradationspfad wie ftp-history.js: ohne plan_cards
   gibt es schlicht keine Compliance-Objekte (core/compliance-match.js::
   shouldEvaluateCard() findet dann für keine Fahrt eine passende Karte).
   Keine eigene Datenquellen-Kopplung zu assets/js/data-access/supabase/
   plan-cards.js — das importiert client.js, das per Design nur im Browser
   läuft (esm.sh-URL-Import).
   ============================================================ */

import { ENV } from "./env.js";
import { log } from "./log.js";

const SELECT_COLS =
  "id,planned_date,moved_from_date,sort_order,title,workout_type,workout_structure,status";

/** Eine plan_cards-Zeile (PostgREST-Spaltennamen) auf die schlanke Shape
 *  mappen, die core/compliance-match.js braucht.
 *  @param {Object} row */
function toCard(row) {
  return {
    id: row.id,
    date: row.planned_date,
    movedFromDate: row.moved_from_date ?? null,
    sortOrder: row.sort_order,
    name: row.title,
    typ: row.workout_type,
    workoutStructure: row.workout_structure ?? null,
    status: row.status,
  };
}

/**
 * Reale plan_cards (aktueller Stand inkl. Verschiebungen/Tausch im
 * Planungstab) auf den "Datum → Typ/Name"-Index verdichten, den
 * mapActivity()/mapActivity2() (scripts/lib/map-activity.js) für
 * typPlanned/typSource erwarten — dieselbe Rolle wie das alte
 * buildEffectivePlanIndex(PLANNED_SESSIONS, adjustments.json), aber aus dem
 * echten, aktuellen Kartenstand statt der statischen Plan+adjustments.json-
 * Kombination. adjustments.json wird seit der Migration auf plan_cards
 * (scripts/migrate-plan-to-supabase.js) von keinem Schreibpfad mehr
 * aktualisiert — ein Kartentausch im (neuen) Planungstab landet nur noch
 * hier, nie mehr in der alten Datei (s. docs/offene-punkte.md).
 * Ausgefallene Karten (status "ausgefallen") liefern bewusst keinen Typ —
 * ein ausgefallener Plantag soll die Ist-Erkennung/IF-Ableitung einer
 * trotzdem gefahrenen Fahrt nicht überschreiben. Mehrere Karten am selben
 * Tag: pro Datum selbst nach sort_order sortiert (unabhängig von der
 * Reihenfolge, in der `cards` hier ankommt — kein stillschweigender
 * Vertrag mit loadPlanCards()' API-Sortierung), die erste NICHT
 * ausgefallene gewinnt.
 *
 * `generate-data.js` führt diesen Index mit dem alten statischen
 * `buildEffectivePlanIndex(PLANNED_SESSIONS, adjustments)` per
 * Objekt-Spread zusammen (echte Karte überschreibt statischen Fallback pro
 * Datum) — ein reiner "Datum → Wert setzen"-Merge kann aber nichts
 * LÖSCHEN. Für zwei Fälle wird ein Datum deshalb hier bewusst explizit auf
 * `null` gesetzt (statt einfach ausgelassen zu werden), damit die äußere
 * Zusammenführung dort NICHT stillschweigend auf den eingefrorenen
 * statischen Stand zurückfällt (map-activity.js liest `effectivePlan[date]
 * || {}` — `null` degradiert dort korrekt zu "kein Plan", genau wie ein
 * fehlender Key es bei einer eigenständigen Karten-Quelle täte):
 * 1. Alle Karten eines Tages sind "ausgefallen" (kein `winner`).
 * 2. Eine Karte wurde WEG von diesem Datum verschoben (`moved_from_date`
 *    einer anderen Karte zeigt hierher) und keine andere aktuelle Karte
 *    sitzt jetzt hier — sonst bliebe am Ursprungsdatum eines einseitigen
 *    Verschiebens (kein Tausch) die längst überholte alte Session stehen.
 *    Bei einem beidseitigen Tausch (zwei Karten tauschen Datum) hat das
 *    Ursprungsdatum bereits einen eigenen `winner` aus der jeweils anderen
 *    Karte — die `null`-Markierung greift dort korrekt nicht.
 * @param {ReturnType<typeof toCard>[]} cards
 * @returns {Record<string, {typ:string, name:string}|null>}
 */
export function buildPlanCardTypeIndex(cards) {
  const byDate = new Map();
  const vacatedDates = new Set();
  for (const card of cards) {
    if (!card.date) continue;
    if (!byDate.has(card.date)) byDate.set(card.date, []);
    byDate.get(card.date).push(card);
    if (card.movedFromDate) vacatedDates.add(card.movedFromDate);
  }
  const index = {};
  for (const [date, group] of byDate) {
    const winner = [...group]
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .find((c) => c.status !== "ausgefallen");
    index[date] = winner ? { typ: winner.typ, name: winner.name } : null;
  }
  for (const date of vacatedDates) {
    if (!(date in index)) index[date] = null;
  }
  return index;
}

/**
 * plan_cards eines Athleten ab `fromDate` laden.
 *
 * Zwei Wege (Fahrplan 7 CRED3):
 *  - `{ profileId, serviceRoleKey }` — der Sync-Weg: ein GET mit dem
 *    Service-Role-Key (RLS-Bypass), kein Login. `profileId` kommt aus
 *    athlete_sync_config (scripts/lib/sync-config-fetch.js).
 *  - `{ email, password }` — Legacy-Login (`grant_type=password`): Athlet 2,
 *    solange seine athlete_key-Zeile fehlt (CRED4), sowie die Einmal-Skripte
 *    backtest-ladder.js / report-derived-workout-structure.js.
 *
 * Gibt bei fehlenden Credentials/Netzwerkfehlern `[]` zurück statt zu werfen
 * — derselbe Degradationspfad wie ftp-history.js.
 * @param {{profileId?:string, serviceRoleKey?:string, email?:string, password?:string}} credentials
 * @param {{fromDate:string}} opts Datum (YYYY-MM-DD), ab dem Karten geladen werden
 * @returns {Promise<Array<{id:string, date:string, movedFromDate:string|null,
 *   sortOrder:number, name:string, typ:string, workoutStructure:Object|null,
 *   status:string}>>}
 */
export async function loadPlanCards(
  { profileId, serviceRoleKey, email, password } = {},
  { fromDate } = {}
) {
  if (!ENV.SUPABASE_URL || !fromDate) return [];
  if (serviceRoleKey && !profileId) {
    log.warn(
      "plan_cards: serviceRoleKey ohne profileId (athlete_key-Zeile ohne Supabase-Login?) — keine Compliance-Auswertung"
    );
    return [];
  }
  const cardsUrl = (athleteId, apikey, token) =>
    fetch(
      `${ENV.SUPABASE_URL}/rest/v1/plan_cards?athlete_id=eq.${athleteId}&planned_date=gte.${fromDate}&select=${SELECT_COLS}&order=planned_date.asc,sort_order.asc`,
      { headers: { apikey, Authorization: `Bearer ${token}` } }
    );
  try {
    if (profileId && serviceRoleKey) {
      const res = await cardsUrl(profileId, serviceRoleKey, serviceRoleKey);
      if (!res.ok) {
        log.warn(`plan_cards: Abruf fehlgeschlagen (HTTP ${res.status}) — keine Compliance-Auswertung`);
        return [];
      }
      return (await res.json()).map(toCard);
    }

    if (!ENV.SUPABASE_ANON_KEY || !email || !password) return [];
    const signIn = await fetch(`${ENV.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ENV.SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password }),
    });
    if (!signIn.ok) {
      log.warn(`plan_cards: Supabase-Login fehlgeschlagen (HTTP ${signIn.status}) — keine Compliance-Auswertung`);
      return [];
    }
    const { access_token: token, user } = await signIn.json();
    const res = await cardsUrl(user.id, ENV.SUPABASE_ANON_KEY, token);
    if (!res.ok) {
      log.warn(`plan_cards: Abruf fehlgeschlagen (HTTP ${res.status}) — keine Compliance-Auswertung`);
      return [];
    }
    return (await res.json()).map(toCard);
  } catch (e) {
    log.warn(`plan_cards: Netzwerkfehler beim Abruf (${e.message}) — keine Compliance-Auswertung`);
    return [];
  }
}

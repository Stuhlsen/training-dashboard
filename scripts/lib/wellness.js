/* ============================================================
   SCRIPTS/LIB/WELLNESS.JS — Wellness-Mapping (intervals.icu → JSON)
   Zentralisiert das Mapping der Wellness-Tage für BEIDE Athleten.
   Erweitert um Körper-/Regenerationsfelder (Gewicht, Kalorien,
   Hydration, Körperfett) und eFTP aus sportInfo — Feldnamen laut
   intervals.icu-Wellness-Modell; die tatsächliche Befüllung wird
   pro Sync-Lauf via logWellnessCoverage() verifiziert statt
   angenommen (siehe AGENTS.md: Felder beim echten Lauf prüfen).
   ============================================================ */

import { log } from "./log.js";

/** Positiver, gerundeter Zahlenwert oder null @param {unknown} v */
function posNum(v) {
  return typeof v === "number" && v > 0 ? Math.round(v) : null;
}

/** Felder, die in die wellnessList übernommen werden (Quelle → Ziel).
 *  Reihenfolge = Reihenfolge im Coverage-Log. */
export const WELLNESS_FIELDS = [
  { out: "sleepHours", pick: (w) => (w.sleepSecs ? Math.round(w.sleepSecs / 360) / 10 : null) },
  { out: "avgSleepingHR", pick: (w) => w.avgSleepingHR || null },
  { out: "restingHR", pick: (w) => w.restingHR || null },
  { out: "hrv", pick: (w) => w.hrvSDNN || null },
  // Regeneration & Körper (neu) — null-tolerant, UI blendet datengetrieben aus
  { out: "weight", pick: (w) => (w.weight > 0 ? Math.round(w.weight * 10) / 10 : null) },
  { out: "bodyFat", pick: (w) => (w.bodyFat > 0 ? Math.round(w.bodyFat * 10) / 10 : null) },
  // Energieverbrauch (Apple Health via intervals.icu): Feldnamen laut UI
  // ActiveEnergy (aktiv verbrannt) + RestingEnergy (Grundumsatz). Groß-/Klein-
  // schreibung tolerant, da intervals.icu die Rohfelder unter dem Code-Namen liefert.
  { out: "activeEnergy", pick: (w) => posNum(w.ActiveEnergy ?? w.activeEnergy) },
  { out: "restingEnergy", pick: (w) => posNum(w.RestingEnergy ?? w.restingEnergy) },
  { out: "hydration", pick: (w) => (w.hydration != null ? w.hydration : null) },
  { out: "hydrationVolume", pick: (w) => posNum(w.hydrationVolume ?? w.Water ?? w.water) },
  // eFTP aus sportInfo (Ride) — robusteste Tagesquelle für die FTP-Prognose,
  // falls icu_eftp an den Activities leer bleibt
  { out: "eftp", pick: (w) => eftpFromSportInfo(w) },
];

/** eFTP (Ride) aus dem sportInfo-Array eines Wellness-Tags
 *  @param {Object} w @returns {number|null} */
export function eftpFromSportInfo(w) {
  if (!Array.isArray(w?.sportInfo)) return null;
  const ride = w.sportInfo.find((s) => s && (s.type === "Ride" || s.type == null) && s.eftp > 0);
  return ride ? Math.round(ride.eftp) : null;
}

/** Hat der Tag mindestens ein verwertbares Feld?
 *  @param {Record<string, unknown>} day gemapptes Tagesobjekt (ohne date) */
function hasAnyValue(day) {
  return Object.entries(day).some(([k, v]) => k !== "date" && v != null);
}

/**
 * Wellness-Map (date → Rohobjekt) → sortierte Liste gemappter Tage.
 * Tage ganz ohne verwertbare Felder entfallen.
 * @param {Record<string, Object>} wellness
 * @returns {Array<Record<string, unknown>>}
 */
export function mapWellnessList(wellness) {
  return Object.entries(wellness || {})
    .map(([date, w]) => {
      const day = { date };
      for (const f of WELLNESS_FIELDS) day[f.out] = f.pick(w || {});
      return day;
    })
    .filter(hasAnyValue)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Letztes bekanntes Gewicht (Skalar, für Hero/W-pro-kg)
 *  @param {Record<string, Object>} wellness
 *  @returns {{weight: number, date: string}|null} */
export function latestWeight(wellness) {
  const entries = Object.entries(wellness || {})
    .filter(([, w]) => w && w.weight > 0)
    .sort((a, b) => b[0].localeCompare(a[0]));
  if (!entries.length) return null;
  return { weight: Math.round(entries[0][1].weight * 10) / 10, date: entries[0][0] };
}

/** Feld-Abdeckung zählen: Feld → Anzahl non-null-Tage.
 *  @param {Array<Record<string, unknown>>} wellnessList gemappte Liste
 *  @returns {Record<string, number>} */
export function fieldCoverage(wellnessList) {
  const counts = {};
  for (const f of WELLNESS_FIELDS) counts[f.out] = 0;
  for (const day of wellnessList || []) {
    for (const f of WELLNESS_FIELDS) {
      if (day[f.out] != null) counts[f.out]++;
    }
  }
  return counts;
}

/** Verifikationslog: welche Wellness-Felder sind real befüllt?
 *  Entscheidungsgrundlage für die "Regeneration & Körper"-Sektion.
 *  @param {Array<Record<string, unknown>>} wellnessList
 *  @param {string} label z.B. "Athlet 1" */
export function logWellnessCoverage(wellnessList, label) {
  const counts = fieldCoverage(wellnessList);
  const total = (wellnessList || []).length;
  const parts = Object.entries(counts).map(([k, n]) => `${k}: ${n}/${total}`);
  log.info(`   📊 Wellness-Feldabdeckung ${label}: ${parts.join(" · ")}`);
  const empty = Object.entries(counts)
    .filter(([, n]) => n === 0)
    .map(([k]) => k);
  if (empty.length) {
    log.info(
      `   ℹ️  Ohne Daten (${label}): ${empty.join(", ")} — zugehörige UI-Kacheln bleiben ausgeblendet`
    );
  }
}

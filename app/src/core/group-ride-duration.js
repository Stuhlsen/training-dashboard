/* ============================================================
   CORE/GROUP-RIDE-DURATION.JS — Dauer-Schätzung für Gruppenfahrten (kein I/O)

   Gruppenfahrten haben keine feste Länge. Der Vorschlag für einen festen Tag
   kommt deshalb aus dem Schnitt der letzten eigenen Fahrten, getrennt nach
   drinnen (Zwift & Co.) und draußen: eine Winter-Runde auf der Rolle ist kein
   Maßstab für die Sommer-Ausfahrt und umgekehrt.

   Fahrten tragen kein Drinnen/Draußen-Feld (der Sync normalisiert
   `VirtualRide` zu `ride`). Beides wird am Namen und am Typ der Plankarte
   erkannt: reicht für einen änderbaren Vorschlag und braucht kein neues
   Datenfeld.
   ============================================================ */

/** Startwert für Zwift-Gruppen, bis genug eigene Fahrten da sind (Alex,
 *  05.11.2026). Eigene Annahme, kein Literaturwert. */
export const GROUP_RIDE_INDOOR_FALLBACK_MIN = 90;

/** Ab so vielen Fahrten gilt der Schnitt als brauchbar. */
const MIN_RIDES = 3;
/** Nur die letzten Fahrten zählen, die Länge ändert sich mit der Saison. */
const LAST_RIDES = 6;
const ROUND_TO_MIN = 5;

const GROUP_NAME = /gruppe|group/i;
const INDOOR_NAME = /zwift|mywhoosh|rouvy|indoor/i;

/** @param {{sport?:string, name?:string|null, typPlanned?:string|null}} ride */
function isGroupRide(ride) {
  if (ride.sport && ride.sport !== "ride") return false;
  return ride.typPlanned === "Gruppenfahrt" || GROUP_NAME.test(ride.name ?? "");
}

/**
 * Schnitt der letzten Gruppenfahrten einer Umgebung, auf 5 min gerundet.
 * @param {Array<{dateISO:string, name?:string|null, min?:number|null, typPlanned?:string|null, sport?:string}>|null|undefined} rides
 * @param {"indoor"|"outdoor"} environment
 * @returns {number|null}  null bei weniger als MIN_RIDES passenden Fahrten
 */
export function estimateGroupRideMin(rides, environment) {
  const wantIndoor = environment === "indoor";
  const matching = (rides ?? [])
    .filter(
      (r) =>
        isGroupRide(r) &&
        Number.isFinite(r.min) &&
        r.min > 0 &&
        INDOOR_NAME.test(r.name ?? "") === wantIndoor
    )
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO))
    .slice(-LAST_RIDES);
  if (matching.length < MIN_RIDES) return null;
  const mean = matching.reduce((sum, r) => sum + r.min, 0) / matching.length;
  return Math.round(mean / ROUND_TO_MIN) * ROUND_TO_MIN;
}

/**
 * Vorschläge für beide Gruppenfahrten. Nur Zwift hat einen Startwert: ohne
 * Daten draußen wählt weiter der Generator die Dauer.
 * @param {Parameters<typeof estimateGroupRideMin>[0]} rides
 * @returns {{indoor:number, outdoor:number|null}}
 */
export function groupRideEstimates(rides) {
  return {
    indoor: estimateGroupRideMin(rides, "indoor") ?? GROUP_RIDE_INDOOR_FALLBACK_MIN,
    outdoor: estimateGroupRideMin(rides, "outdoor"),
  };
}

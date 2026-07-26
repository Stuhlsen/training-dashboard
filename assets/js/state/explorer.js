/* ============================================================
   STATE/EXPLORER.JS — Explorer-Ansichtszustand (Phase 5, Schritt 0)
   docs/phase-5-konzept-explorer.md §2.1/§7.1/§10.3 (X9).

   Hält NUR Ansichtszustand (Zeitraum, Hover/Selektion, Vergleichsslots,
   What-if-Szenario) — keine Trainingsdaten. Persistiert lokal je Athlet
   (localStorage), kein Backend, kein neuer Schreibpfad (§9: der Explorer
   schreibt nirgends in geteilte Daten).

   Schritt 0: nur `range` ist aktiv (voller Anzeigebereich, noch kein
   Brush-Fenster — das ist Schritt 1). `compareSlots` ist von Anfang an ein
   Array modelliert (§7.1: der nachträgliche Umbau von 1 auf n wäre teurer
   als es gleich als Liste zu bauen), `hovered`/`selected`/`scenario` sind
   vorhandene, aber in Schritt 0 inerte Felder für Schritt 2/3/4.

   Bewusst KEIN Import von state/data.js oder state/plan-cards.js: den
   Default-Zeitraum (heute − 90 Tage … projection.horizonEnd) berechnet die
   aufrufende Stelle (ui/explorer.js) und übergibt ihn an loadForAthlete() —
   dasselbe Injektionsmuster wie configureProjection() in state/plan-
   cards.js, das dort genau deshalb existiert (kein state/-Modul soll ein
   anderes state/-Modul importieren müssen, nur um an dessen Daten zu
   kommen). */

let range = null; // {from, to} — aktiver Anzeigebereich
let hovered = null; // ISO-Datum oder null (Schritt 2)
let selected = null; // ISO-Datum oder null (Schritt 2/3)
let compareSlots = []; // [{from,to}, ...] (Schritt 4)
let scenario = null; // What-if-Parameter (Schritt 3)
let loadedForAthleteId = null;

const listeners = new Set();

function storageKey(athleteId) {
  return `explorer_${athleteId}`;
}

function notify() {
  const state = getState();
  for (const fn of listeners) fn(state);
}

/** @returns {{range: {from:string,to:string}|null, hovered: string|null,
 *  selected: string|null, compareSlots: Array<{from:string,to:string}>,
 *  scenario: object|null}} */
export function getState() {
  return { range, hovered, selected, compareSlots, scenario };
}

/** @param {(state: ReturnType<typeof getState>) => void} fn @returns {() => void} */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Lädt den persistierten Zustand eines Athleten (oder legt den übergebenen
 * Default an, falls nichts/nur defektes JSON vorliegt). Wiederholte Aufrufe
 * für denselben Athleten sind ein No-op — verhindert, dass ein
 * Athletenwechsel-Race den falschen (fremden) Zustand überschreibt (Muster
 * `loadedForAthleteId` aus state/plan-cards.js).
 * @param {string} athleteId
 * @param {{from:string, to:string}} defaultRange
 */
export function loadForAthlete(athleteId, defaultRange) {
  if (loadedForAthleteId === athleteId) return;
  loadedForAthleteId = athleteId;

  let saved = null;
  try {
    const raw = localStorage.getItem(storageKey(athleteId));
    saved = raw ? JSON.parse(raw) : null;
  } catch {
    saved = null; // defektes JSON oder localStorage nicht verfügbar → Default
  }

  range = saved?.range ?? defaultRange;
  compareSlots = Array.isArray(saved?.compareSlots) ? saved.compareSlots : [];
  scenario = saved?.scenario ?? null;
  hovered = null;
  selected = null;
  notify();
}

function persist() {
  if (!loadedForAthleteId) return;
  try {
    localStorage.setItem(
      storageKey(loadedForAthleteId),
      JSON.stringify({ range, compareSlots, scenario })
    );
  } catch {
    // localStorage kann fehlschlagen (privater Modus, Speicherlimit) —
    // Zustand bleibt dann In-Memory für die laufende Sitzung gültig.
  }
}

/** @param {string} from @param {string} to */
export function setRange(from, to) {
  range = { from, to };
  persist();
  notify();
}

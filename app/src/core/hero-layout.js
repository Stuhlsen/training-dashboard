/* ============================================================
   CORE/HERO-LAYOUT.JS — Hero-Kachel-Anordnung (kein DOM)
   Reine Platzierungslogik für ein 2D-Raster (react-grid-layout,
   HeroTileGrid.tsx): führt eine gespeicherte Positionsliste mit den
   gerade sichtbaren Kacheln zusammen. Kein Supabase-Zugriff hier (s.
   api/supabase/hero-layout.ts), keine React-Zustandslogik hier (s.
   api/hooks/useHeroLayout.ts).
   ============================================================ */

/** Spaltenzahl des Hero-Rasters im Edit-Modus. 12 statt der sichtbaren 3
 *  großen Kacheln pro Zeile, damit die kleinen Kennzahlen-Kacheln (jede
 *  Kennzahl ist seit dem Umbau ihre eigene Kachel, s. HERO_METRIC_KEYS)
 *  fein genug daneben Platz finden — eine große Kachel spannt 4 von 12
 *  Spalten (3 pro Zeile, wie vorher), eine Kennzahl spannt 2 von 12
 *  (6 pro Zeile). */
export const HERO_GRID_COLS = 12;

/** Zeilenhöhe/Randabstand des Hero-Rasters (HeroTileGrid.tsx) — react-grid-
 *  layout berechnet die Pixelhöhe einer Kachel als
 *  `h * ROW_HEIGHT + (h-1) * ROW_MARGIN` (die Formel zieht den Randabstand
 *  für JEDE interne Zeilen-Einheit einer mehrzeiligen Kachel mit ein, nicht
 *  nur zwischen Kacheln — bei einem Randabstand, der größer ist als die
 *  Zeilenhöhe selbst, explodiert die Höhe dadurch schnell). ROW_MARGIN
 *  bewusst gleich groß wie ROW_HEIGHT gewählt, damit `h` unten einfach aus
 *  der gewünschten Pixelhöhe zurückgerechnet werden kann. */
export const HERO_ROW_HEIGHT = 10;
export const HERO_ROW_MARGIN = 10;

/** Rundet eine gewünschte Pixelhöhe auf die passende Zeilen-Einheit `h`
 *  (Umkehrung von react-grid-layouts `h*ROW_HEIGHT + (h-1)*ROW_MARGIN`). */
function rowsFor(px) {
  return Math.max(1, Math.round((px + HERO_ROW_MARGIN) / (HERO_ROW_HEIGHT + HERO_ROW_MARGIN)));
}

/** Größe je Kachel in Rastereinheiten (w = Spalten, h = Zeilen-Einheiten,
 *  s. rowsFor() oben). Von Hand auf die heutigen Kachelhöhen abgestimmt —
 *  bewusst keine Live-DOM-Messung (Grund s. Plan-Kontext: robuster nach
 *  zwei fehlgeschlagenen Anläufen). Kachel-Inhalt, der ungewöhnlich lang
 *  wird (z. B. viele Bestleistungen-Chips), darf sichtbar in die Zeile
 *  darunter hineinragen (`overflow: visible` in HeroTileGrid.tsx) statt
 *  abgeschnitten zu werden — kein Bug. */
/** Große Kacheln spannen 4 von 12 Spalten (3 pro Zeile). */
const BIG = 4;

export const HERO_TILE_SIZE = {
  session: { w: BIG, h: rowsFor(170) },
  weather: { w: BIG, h: rowsFor(180) },
  briefing: { w: BIG, h: rowsFor(330) },
  ftpRings: { w: BIG, h: rowsFor(420) },
  powerScale: { w: HERO_GRID_COLS, h: rowsFor(172) },
  consistency: { w: BIG, h: rowsFor(204) },
  records: { w: BIG, h: rowsFor(380) },
  raceResults: { w: BIG, h: rowsFor(150) },
  weekReview: { w: BIG, h: rowsFor(190) },
  wellbeing: { w: BIG, h: rowsFor(90) },
  readiness: { w: BIG, h: rowsFor(330) },
  // Kennzahlen (Etappe "Kennzahlen einzeln verschiebbar", Rückfrage
  // 2026-09-04) — seit hero-view-model.ts::buildHeroMetrics()s `key`-Feld
  // ist jede Kennzahl ihre eigene, kleine Kachel (2 von 12 Spalten, 6 pro
  // Zeile) statt Teil eines gemeinsamen Blocks. `ftp`/`eftp` können je nach
  // Sichtbarkeit fehlen (s. buildHeroMetrics()) — resolveTileLayout()
  // überspringt fehlende IDs automatisch, kein Sonderfall hier nötig.
  "metric-distance": { w: 2, h: rowsFor(145) },
  "metric-rides": { w: 2, h: rowsFor(145) },
  "metric-time": { w: 2, h: rowsFor(145) },
  "metric-tempo": { w: 2, h: rowsFor(145) },
  "metric-ftp": { w: 2, h: rowsFor(145) },
  "metric-eftp": { w: 2, h: rowsFor(145) },
  "metric-ctl": { w: 2, h: rowsFor(145) },
  "metric-longest": { w: 2, h: rowsFor(145) },
  "metric-hr": { w: 2, h: rowsFor(145) },
  "metric-cadence": { w: 2, h: rowsFor(145) },
};

const DEFAULT_TILE_SIZE = { w: BIG, h: 18 };

/** IDs der Kennzahlen-Kacheln in der Reihenfolge, in der
 *  `buildHeroMetrics()` sie liefert — s. HERO_TILE_SIZE oben. */
export const HERO_METRIC_KEYS = [
  "metric-distance",
  "metric-rides",
  "metric-time",
  "metric-tempo",
  "metric-ftp",
  "metric-eftp",
  "metric-ctl",
  "metric-longest",
  "metric-hr",
  "metric-cadence",
];

/** Kanonische Reihenfolge, wenn eine Kachel noch nie eine gespeicherte
 *  Position hatte — entspricht der heutigen Hero-Tab-Reihenfolge
 *  (HeroPage.tsx). Bestimmt nur die REIHENFOLGE, in der neue/erstmals
 *  sichtbare Kacheln ins Raster einsortiert werden, keine feste Position. */
export const DEFAULT_HERO_TILE_ORDER = [
  "session",
  "weather",
  "briefing",
  "ftpRings",
  "powerScale",
  ...HERO_METRIC_KEYS,
  "consistency",
  "records",
  "raceResults",
  "weekReview",
  "wellbeing",
  "readiness",
];

/** Verrechnet eine gespeicherte Positionsliste mit den GERADE sichtbaren
 *  Kachel-IDs: bekannte IDs behalten ihre gespeicherte `{x,y}` exakt
 *  (das ist, was "gestapelt bleiben" garantiert), IDs ohne gespeicherte
 *  Position (neu sichtbar, oder eine gespeicherte ID gehört zu einer
 *  inzwischen ausgeblendeten Kachel und wird stillschweigend übersprungen)
 *  werden kollisionsfrei in die jeweils niedrigste freie Zeile ihrer
 *  Spalten(-gruppe) einsortiert — einfacher Skyline-Algorithmus je Spalte,
 *  kein Backtracking, aber deterministisch und überlappungsfrei mit den
 *  bekannten Positionen.
 *  @param {{i:string,x:number,y:number}[] | null} savedLayout
 *  @param {string[]} availableIds
 *  @param {number} [cols]
 *  @returns {{i:string,x:number,y:number}[]} */
export function resolveTileLayout(savedLayout, availableIds, cols = HERO_GRID_COLS) {
  const available = new Set(availableIds);
  const known = (savedLayout ?? []).filter((p) => available.has(p.i));
  const knownIds = new Set(known.map((p) => p.i));
  const missing = DEFAULT_HERO_TILE_ORDER.filter((id) => available.has(id) && !knownIds.has(id));
  const knownAndMissing = new Set([...knownIds, ...missing]);
  // Sichtbare IDs, die nicht mal in DEFAULT_HERO_TILE_ORDER stehen (sollte
  // nicht vorkommen, schützt aber davor, eine Kachel stillschweigend zu
  // verschlucken).
  const leftover = availableIds.filter((id) => !knownAndMissing.has(id));

  const colHeights = new Array(cols).fill(0);
  for (const pos of known) {
    const size = HERO_TILE_SIZE[pos.i] ?? DEFAULT_TILE_SIZE;
    const bottom = pos.y + size.h;
    for (let c = pos.x; c < pos.x + size.w && c < cols; c++) {
      colHeights[c] = Math.max(colHeights[c], bottom);
    }
  }

  function placeNext(id) {
    const size = HERO_TILE_SIZE[id] ?? DEFAULT_TILE_SIZE;
    const w = Math.min(size.w, cols);
    let bestX = 0;
    let bestY = Infinity;
    for (let x = 0; x + w <= cols; x++) {
      let y = 0;
      for (let c = x; c < x + w; c++) y = Math.max(y, colHeights[c]);
      if (y < bestY) {
        bestY = y;
        bestX = x;
      }
    }
    for (let c = bestX; c < bestX + w; c++) colHeights[c] = bestY + size.h;
    return { i: id, x: bestX, y: bestY };
  }

  const placed = [...missing, ...leftover].map(placeNext);
  return [...known, ...placed];
}

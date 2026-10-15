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

/** Mindest-Containerbreite, ab der HeroTileGrid.tsx außerhalb des Edit-
 *  Modus dieselben echten 2D-Rasterpositionen zeigt wie im Edit-Modus
 *  (nicht-interaktiv, ohne Zieh-Griffe) statt des schmaleren responsiven
 *  Fließ-Grids.
 *
 *  Der eigentliche Grund ist NICHT Lesbarkeit (eine BIG-Kachel wäre schon ab
 *  ~1060px breit genug), sondern Sicherheit gegen echtes Überlaufen: HERO_
 *  TILE_SIZE gibt jeder Kachel eine FESTE Pixelhöhe, ihr echter Inhalt aber
 *  wird bei schmalerem Container automatisch breiter umgebrochen (mehr
 *  Zeilen) und damit höher — bei rein rechnerisch "ausreichend breiten"
 *  ~1080px liefen mehrere Kacheln beim Live-Test (Playwright, 06.09.2026)
 *  bereits deutlich über ihren zugewiesenen Rahmen hinaus (Bestleistungen
 *  −307px, Belastungsempfehlung −115px, FTP-Fortschritt −42px — sichtbar
 *  dank `overflow:visible`, aber eine echte Überlappung mit der Kachel
 *  darunter, nicht nur Kosmetik). Bei 1700px lag der knappste gemessene
 *  Puffer nur noch bei 8px (Trainingskonsistenz/FTP-Fortschritt) — 1800
 *  lässt zusätzlichen Spielraum für andere Athleten/Tage mit etwas längeren
 *  Texten. Das Fließ-Grid darunter bleibt der sichere Fallback, weil CSS
 *  dort die Zeilenhöhe automatisch an den echten Inhalt anpasst statt eine
 *  feste Pixelzahl vorzugeben. Bei künftigen Layoutänderungen hier zuerst
 *  mit echten Playwright-Messungen (nicht nur bei einer Fensterbreite)
 *  gegenprüfen, nicht schätzen — s. auch den Kommentar bei HERO_TILE_SIZE. */
export const HERO_GRID_MIN_WIDTH = 1800;

export const HERO_TILE_SIZE = {
  // session/weather/readiness am 06.09.2026 gegen echte, per Playwright
  // gemessene Inhaltshöhen nachjustiert (Rückfrage Alex — die gestrichelten
  // Rahmen im Edit-Modus passten sichtbar nicht zum Inhalt): session/weather
  // waren um 1-2 volle Zeilen-Einheiten zu groß (verschenkter Platz),
  // readiness umgekehrt zu KLEIN (Inhalt lief unbemerkt über den zugewiesenen
  // Rahmen hinaus, s. `overflow: visible` in HeroTileGrid.tsx — kein Absturz,
  // aber ein zu knapper Rahmen). Die übrigen Werte unten sind trotz sichtbar
  // wirkendem Leerraum NICHT reduzierbar, ohne echten Inhalt zu riskieren —
  // die Rasterzeile quantisiert in 20px-Schritten (HERO_ROW_HEIGHT +
  // HERO_ROW_MARGIN), ihr gemessener Inhalt liegt bereits so nah am
  // nächstkleineren Vielfachen, dass eine weitere Stufe nach unten den realen
  // Inhalt abschneiden würde (z. B. weekReview: 181px Inhalt, 190px Rahmen —
  // die nächstkleinere Stufe wäre 170px, zu knapp). Bei neuer Content-Menge
  // hier zuerst mit echten Playwright-Messungen gegenprüfen, nicht schätzen.
  session: { w: BIG, h: rowsFor(125) },
  weather: { w: BIG, h: rowsFor(170) },
  briefing: { w: BIG, h: rowsFor(330) },
  ftpRings: { w: BIG, h: rowsFor(420) },
  // Zonen-Erklärer (Fahrplan 24 E2), 15.10.2026, Chrome-DevTools-Messung gegen den
  // Docker-Produktions-Build, Viewport 1900 und 2200px (Container >= 1800), alle fünf
  // Zonen nacheinander gewählt. Die Beschreibungsfelder stapeln alle Zonentexte in einer
  // Rasterzelle, die Höhe ist daher unabhängig von der gewählten Zone (= längster Text).
  // Inhalt (offsetHeight inkl. 58px Padding): powerScale 410px, hrZones 433px. Rahmen mit
  // Puffer: 430px bzw. 450px (20px-Raster). Das aufgeklappte "ⓘ Quelle" ist ein Overlay
  // und zählt nicht zur Höhe.
  powerScale: { w: HERO_GRID_COLS, h: rowsFor(430) },
  // E3 (Lauf/Schwimmen), 15.10.2026, Playwright gegen den Docker-Produktions-Build, Viewport
  // 2200px (Kachelbreite 1860px), je Sport alle fünf Zonen nacheinander gewählt: die Höhe bleibt
  // konstant (Stapel-Ansatz). Inhalt (offsetHeight): paceZones 429px (Lauf = Schwimmen, im
  // degradierten Zustand ohne Schwelle gemessen; mit Schwelle entfällt der Hinweistext und die
  // Tick-Zeile kommt dazu, nicht separat gemessen), hrZones Rad 435px, Lauf 435px, Schwimmen
  // 486px (längerer Wasser-Hinweis). Der Rahmen kennt je Kachel-ID nur EINE Höhe, daher gilt für
  // hrZones das Maximum: 486px + Puffer → 500px (Rad/Lauf haben etwas Leerraum).
  hrZones: { w: HERO_GRID_COLS, h: rowsFor(500) },
  paceZones: { w: HERO_GRID_COLS, h: rowsFor(450) },
  consistency: { w: BIG, h: rowsFor(204) },
  records: { w: BIG, h: rowsFor(380) },
  raceResults: { w: BIG, h: rowsFor(150) },
  weekReview: { w: BIG, h: rowsFor(190) },
  wellbeing: { w: BIG, h: rowsFor(90) },
  readiness: { w: BIG, h: rowsFor(380) },
  // E9, 15.10.2026 (Playwright, 2200px): Inhalt nur mit Ziel 150px; mit Plan-Zeile + Ampel
  // und "gegessen" je ca. +22px → ca. 195px. Der volle Fall wurde NICHT live gemessen
  // (hätte einen Plan-Eintrag in die Dev-DB geschrieben), sondern aus den Zeilenhöhen gerechnet.
  nutrition: { w: BIG, h: rowsFor(210) },
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
  "paceZones",
  "hrZones",
  ...HERO_METRIC_KEYS,
  "consistency",
  "records",
  "raceResults",
  "weekReview",
  "wellbeing",
  "nutrition",
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

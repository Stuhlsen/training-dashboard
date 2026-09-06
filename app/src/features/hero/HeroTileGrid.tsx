import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import { GridLayout, calcGridItemPosition, getCompactor, useContainerWidth, type Layout, type LayoutItem } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { HERO_GRID_COLS, HERO_GRID_MIN_WIDTH, HERO_ROW_HEIGHT, HERO_ROW_MARGIN, HERO_TILE_SIZE } from "../../core/hero-layout.js";
import type { HeroTilePosition } from "../../api/supabase/hero-layout";

export interface HeroTile {
  id: string;
  node: ReactNode;
  /** Kacheln, die schon heute die volle Zeilenbreite brauchen
   *  (PowerScale, MetricsGrid) — spannen außerhalb des Edit-Modus über
   *  alle Spalten des einfachen Fließ-Grids. */
  wide?: boolean;
}

interface HeroTileGridProps {
  tiles: HeroTile[];
  /** Vollständig aufgelöste 2D-Anordnung für ALLE gerade sichtbaren
   *  Kacheln (core/hero-layout.js::resolveTileLayout) — außerhalb des
   *  Edit-Modus nur zur Lese-Reihenfolge (nach y, dann x) verwendet. */
  layout: HeroTilePosition[];
  editing: boolean;
  onLayoutChange: (next: HeroTilePosition[]) => void;
}

const MARGIN: readonly [number, number] = [HERO_ROW_MARGIN, HERO_ROW_MARGIN];
// compactType bewusst null (nicht "vertical"): react-grid-layout ruft
// compactor.compact() bei JEDEM Render, JEDEM Drag-Schritt und sofort beim
// Mounten auf. Mit "vertical" zieht das alle Kacheln eigenmächtig lückenlos
// nach oben — noch bevor der Nutzer überhaupt zieht (die von
// resolveTileLayout() bewusst exakt beibehaltenen gespeicherten Positionen
// wurden dadurch sofort überschrieben) und bei jedem Mausschritt während des
// Ziehens erneut (macht das Andocken am Punktegrid instabil). null
// (noCompactor) lässt die von resolveTileLayout() berechnete Anordnung
// unangetastet.
//
// preventCollision bewusst true: mit false (Wegschieben statt Zurück-
// springen, getestet 06.09.2026 per Playwright) erzeugte
// moveElementAwayFromCollision() beim allerersten Testzug sofort eine
// ECHTE Überlappung — die weggeschobene Kachel landete auf einer Zelle,
// die eine DRITTE Kachel schon belegte (kein rekursives Auflösen von
// Folge-Kollisionen). Bestätigt exakt das historische Risiko, das schon
// einmal zu "Belastungsempfehlung landete über der Kennzahlen-Reihe"
// geführt hatte. true lässt eine Kachel stattdessen an ihre letzte
// gültige Position zurückspringen, wenn das Ziel belegt ist — nie
// überlappend, aber nur dahin ziehbar, wo gerade eine Lücke ist. Der
// eigentliche Grund, warum sich "gar nichts" verschieben ließ (Rückfrage
// Alex, 06.09.2026), war ohnehin nicht diese Einstellung, sondern die
// permanente 3D-Kippung der Hero-Plate, die Klicks auf Kacheln unterhalb
// der Leistungsskala am echten Ziel vorbeilenkte — behoben in
// HeroPage.tsx (Kippung wird während editMode auf 0 gesetzt).
const HERO_COMPACTOR = getCompactor(null, false, true);
const DEFAULT_TILE_SIZE = { w: 1, h: 18 };

const FLOW_GRID_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
  gap: "clamp(20px,2vw,34px)",
  alignItems: "start",
};

function GripIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="6" cy="6" r="2" />
      <circle cx="6" cy="12" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="18" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </svg>
  );
}

/** Ziehgriff — trägt die Klasse, die `dragConfig.handle` (react-grid-layout)
 *  als Selektor bekommt. Nur der Griff löst das Ziehen aus, nicht die ganze
 *  Kachel, damit Buttons/Slider IN der Kachel (What-if-Regler in
 *  PowerScale, Befinden-Button, …) während des Bearbeitens normal auf
 *  Klicks reagieren. */
function TileGrip() {
  return (
    <button
      type="button"
      className="hero-tile-grip"
      aria-label="Kachel verschieben"
      style={{
        position: "absolute",
        top: -11,
        left: 14,
        width: 24,
        height: 24,
        border: "none",
        borderRadius: 7,
        background: "var(--accent-2)",
        color: "#0b0e13",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "grab",
        boxShadow: "0 4px 10px rgba(0,0,0,.4)",
        zIndex: 2,
        padding: 0,
      }}
    >
      <GripIcon />
    </button>
  );
}

/** Reihenfolge-/Positions-Grid für die Hero-Kacheln.
 *
 *  Ab HERO_GRID_MIN_WIDTH zeigt auch die Nicht-Edit-Ansicht dieselben
 *  echten 2D-Rasterpositionen wie der Edit-Modus (per calcGridItemPosition,
 *  derselben Funktion, die react-grid-layout selbst intern nutzt) — nur
 *  ohne Zieh-Griffe und ohne react-grid-layout zu mounten. Vorher zeigte
 *  die Nicht-Edit-Ansicht ein eigenes, einfaches 3-spaltiges CSS-Fließ-Grid
 *  in Lese-Reihenfolge, das mit der 2D-Anordnung des Edit-Modus so gut wie
 *  nie exakt übereinstimmte — sichtbar daran, dass sich beim Öffnen von
 *  "Kacheln anordnen" sofort alles verschob (Rückfrage Alex, 06.09.2026).
 *
 *  Unterhalb von HERO_GRID_MIN_WIDTH bleibt das alte responsive Fließ-Grid
 *  als Fallback bestehen — nicht wegen Lesbarkeit, sondern weil HERO_TILE_
 *  SIZEs feste Pixelhöhen bei schmalerem Container (mehr Textumbruch, s.
 *  Kommentar bei HERO_GRID_MIN_WIDTH) echt überlaufen können; das CSS-Grid
 *  passt seine Zeilenhöhe dagegen automatisch an den echten Inhalt an.
 *
 *  Im Edit-Modus übernimmt react-grid-layout (echtes 2D-Raster mit
 *  Spalte+Zeile je Kachel, Zurückspringen bei Kollision statt automatischem
 *  Wegschieben — s. HERO_COMPACTOR unten — und einem fertigen Andock-/
 *  Platzhalter-Muster) statt einer selbstgebauten Reihenfolge-Logik. */
export function HeroTileGrid({ tiles, layout, editing, onLayoutChange }: HeroTileGridProps) {
  const byId = new Map(tiles.map((t) => [t.id, t]));
  // containerRef muss auf JEDEM Render an ein tatsächlich gemountetes
  // Element hängen, egal welcher der drei Zweige unten greift — sonst
  // misst useContainerWidth() nie eine echte Breite (mounted bleibt false,
  // width bleibt für immer beim internen Notfallwert), und der
  // Breiten-Vergleich unten trifft nie zu (Bug-Fund 06.09.2026: der
  // Fließ-Grid-Zweig hatte keinen ref, dadurch blieb die App komplett am
  // Fließ-Grid hängen, egal wie breit das Fenster war). Deshalb ganz unten
  // EIN gemeinsamer `<div ref={containerRef}>` um alle drei Zweige, statt
  // je Zweig ein eigener (fehlender) ref.
  const { width, containerRef, mounted } = useContainerWidth();
  const [draggingId, setDraggingId] = useState<string | null>(null);

  let content: ReactNode;
  if (!editing && (!mounted || width < HERO_GRID_MIN_WIDTH)) {
    const flowIds = [...layout]
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((pos) => pos.i)
      .filter((id) => byId.has(id));

    // Kennzahlen-Kacheln (IDs "metric-*") sind seit dem Umbau einzeln
    // verschiebbar, sollen außerhalb des Edit-Modus aber wieder als EIN
    // zusammenhängender Streifen wirken (wie der frühere MetricsGrid-Block)
    // statt jede einzeln in eine 360px-Spalte des Fließ-Grids gezogen zu
    // werden. Aufeinanderfolgende metric-*-IDs in der Lese-Reihenfolge
    // werden dafür zu einer Gruppe zusammengefasst — deckt den Normalfall
    // ab (Kennzahlen liegen nach dem Einsortieren nebeneinander), ohne eine
    // beliebige Durchmischung mit anderen Kacheln eigens behandeln zu müssen.
    const groups: (string | string[])[] = [];
    for (const id of flowIds) {
      const isMetric = id.startsWith("metric-");
      const last = groups[groups.length - 1];
      if (isMetric && Array.isArray(last)) last.push(id);
      else if (isMetric) groups.push([id]);
      else groups.push(id);
    }

    content = (
      <div style={FLOW_GRID_STYLE}>
        {groups.map((group) =>
          Array.isArray(group) ? (
            <div
              key={group.join(",")}
              style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}
            >
              {group.map((id) => (
                <div key={id}>{byId.get(id)!.node}</div>
              ))}
            </div>
          ) : (
            <div key={group} style={{ gridColumn: byId.get(group)!.wide ? "1 / -1" : undefined }}>
              {byId.get(group)!.node}
            </div>
          ),
        )}
      </div>
    );
  } else if (!editing) {
    const visiblePositions = [...layout].sort((a, b) => a.y - b.y || a.x - b.x).filter((pos) => byId.has(pos.i));
    // Gleiche Pixelmathematik wie react-grid-layout selbst (calcGridItemPosition),
    // damit diese Ansicht garantiert 1:1 mit dem Edit-Modus übereinstimmt —
    // statt einer eigenen, potenziell abweichenden Nachbildung der Formel.
    const positionParams = {
      margin: MARGIN,
      containerPadding: MARGIN,
      containerWidth: width,
      cols: HERO_GRID_COLS,
      rowHeight: HERO_ROW_HEIGHT,
      maxRows: Infinity,
    };
    let totalHeight = 0;
    const placed = visiblePositions.map((pos) => {
      const size = HERO_TILE_SIZE[pos.i as keyof typeof HERO_TILE_SIZE] ?? DEFAULT_TILE_SIZE;
      const { left, top, width: w, height: h } = calcGridItemPosition(positionParams, pos.x, pos.y, size.w, size.h);
      totalHeight = Math.max(totalHeight, top + h);
      return { tile: byId.get(pos.i)!, left, top, w, h };
    });

    content = (
      <div style={{ position: "relative", height: totalHeight }}>
        {placed.map(({ tile, left, top, w, h }) => (
          <div key={tile.id} style={{ position: "absolute", left, top, width: w, height: h }}>
            {tile.node}
          </div>
        ))}
      </div>
    );
  } else {
    const gridLayout: LayoutItem[] = layout
      .filter((pos) => byId.has(pos.i))
      .map((pos) => {
        const size = HERO_TILE_SIZE[pos.i as keyof typeof HERO_TILE_SIZE] ?? DEFAULT_TILE_SIZE;
        return { i: pos.i, x: pos.x, y: pos.y, w: size.w, h: size.h };
      });

    const handleLayoutChange = (next: Layout) => {
      onLayoutChange(next.map(({ i, x, y }) => ({ i, x, y })));
    };

    content = (
      <>
        {/* Restyling der von react-grid-layout selbst gerenderten
            Platzhalter-Box (`.react-grid-placeholder`, aus dem importierten
            Bibliotheks-CSS oben) auf die Design-Sprache dieser Seite — die
            einzige Stelle im Hero-Bereich mit einem echten <style>-Tag statt
            Inline-Styles, weil eine fremde CSS-Klasse aus einer Bibliothek
            sich nicht per Inline-Prop erreichen lässt. */}
        <style>{`
          .react-grid-item.react-grid-placeholder {
            background: color-mix(in oklab, var(--accent-2) 16%, transparent) !important;
            border: 2px dashed var(--accent-2) !important;
            border-radius: var(--radius-lg) !important;
            opacity: 1 !important;
          }
        `}</style>
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: "-20px",
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.16) 1.6px, transparent 1.6px)",
            // Punktabstand MUSS die echten Andock-Punkte treffen — vertikal ist
            // das schlicht HERO_ROW_HEIGHT + HERO_ROW_MARGIN (jede Zeile ist
            // exakt so hoch), aber horizontal ist die Spaltenbreite NICHT
            // gleich der Zeilenhöhe: react-grid-layout verteilt HERO_GRID_COLS
            // Spalten responsiv über die gemessene Containerbreite
            // (calcGridColWidth: (width - margin*(cols-1) - padding*2) / cols,
            // wobei containerPadding mangels eigener Angabe auf margin
            // zurückfällt — s. react-grid-layout/dist/chunk-A5WIFECI.js). Ein
            // fixer 20px-Wert für beide Achsen (wie zuvor) zeigt links/rechts
            // ein Punkteraster, das mit den echten Spaltengrenzen nichts zu tun
            // hat — genau das ließ das Einhaken beim Ziehen falsch aussehen.
            backgroundSize: `${width > 0 ? (width - HERO_ROW_MARGIN * (HERO_GRID_COLS + 1)) / HERO_GRID_COLS + HERO_ROW_MARGIN : HERO_ROW_HEIGHT + HERO_ROW_MARGIN}px ${HERO_ROW_HEIGHT + HERO_ROW_MARGIN}px`,
            // Phase: Zeilen/Spalten beginnen bei containerPadding (=Randabstand,
            // 10px) relativ zum äußeren containerRef: die Deko-Ebene selbst
            // sitzt "inset: -20px" davor, also müssen die Punkte um
            // 20px (inset) + 10px (containerPadding) verschoben werden, damit
            // der erste Punkt exakt auf der Ecke der ersten Kachel liegt.
            backgroundPosition: "30px 30px",
            opacity: 0.5,
            pointerEvents: "none",
            borderRadius: 28,
          }}
        />
        {mounted && (
          <GridLayout
            layout={gridLayout}
            width={width}
            gridConfig={{ cols: HERO_GRID_COLS, rowHeight: HERO_ROW_HEIGHT, margin: MARGIN }}
            dragConfig={{ enabled: true, handle: ".hero-tile-grip", threshold: 5, bounded: false }}
            compactor={HERO_COMPACTOR}
            resizeConfig={{ enabled: false }}
            onLayoutChange={handleLayoutChange}
            onDragStart={(_layout, _oldItem, newItem) => setDraggingId(newItem?.i ?? null)}
            onDragStop={() => setDraggingId(null)}
          >
            {layout
              .filter((pos) => byId.has(pos.i))
              .map((pos) => {
                const tile = byId.get(pos.i)!;
                const isDragging = draggingId === tile.id;
                return (
                  <div
                    key={tile.id}
                    style={{
                      position: "relative",
                      overflow: "visible",
                      outline: "1.5px dashed color-mix(in oklab, var(--accent-2) 55%, transparent)",
                      outlineOffset: 3,
                      borderRadius: "var(--radius-lg)",
                      // Eigener perspective-Kontext für den 3D-Abhebe-Effekt
                      // beim Ziehen — react-grid-layout setzt selbst schon
                      // `transform` für die Positionierung auf dieses Element
                      // (überschreibt jeden eigenen transform-Wert hier), der
                      // Anheben-Effekt sitzt deshalb auf einem inneren Kind
                      // (s. unten), nicht auf diesem Element selbst.
                      perspective: isDragging ? 900 : undefined,
                      zIndex: isDragging ? 5 : undefined,
                    }}
                  >
                    <div
                      style={{
                        transform: isDragging ? "translateZ(140px) rotate(-1.5deg)" : undefined,
                        transition: "transform .15s ease",
                        boxShadow: isDragging ? "0 46px 90px -24px rgba(0,0,0,.8), 0 10px 28px rgba(0,0,0,.5)" : undefined,
                        borderRadius: "var(--radius-lg)",
                      }}
                    >
                      <TileGrip />
                      {tile.node}
                    </div>
                  </div>
                );
              })}
          </GridLayout>
        )}
      </>
    );
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {content}
    </div>
  );
}

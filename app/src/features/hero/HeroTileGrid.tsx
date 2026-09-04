import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import { GridLayout, getCompactor, useContainerWidth, type Layout, type LayoutItem } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { HERO_GRID_COLS, HERO_ROW_HEIGHT, HERO_ROW_MARGIN, HERO_TILE_SIZE } from "../../core/hero-layout.js";
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
// preventCollision: eine Kachel, deren Ziel-Zelle schon belegt ist, springt
// beim Loslassen einfach an ihre letzte gültige Position zurück, statt dass
// react-grid-layout versucht, andere Kacheln automatisch wegzuschieben —
// Letzteres erzeugte bei sehr unterschiedlich großen Kacheln beobachtbare
// echte Überlappungen (Bug-Fund: "Belastungsempfehlung" landete über der
// Kennzahlen-Reihe). preventCollision garantiert stattdessen, dass eine
// Kachel das Raster nie in einem überlappenden Zustand verlässt.
const HERO_COMPACTOR = getCompactor("vertical", false, true);
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
 *  Außerhalb des Edit-Modus wird stur in Lese-Reihenfolge (nach y, dann x
 *  aus `layout`) in ein einfaches, responsives CSS-Grid gerendert — OHNE
 *  react-grid-layout zu mounten, damit Klicks/Slider in den Kacheln dort
 *  unangetastet bleiben und die Seite außerhalb des Bearbeitens exakt so
 *  responsiv bleibt wie vorher.
 *
 *  Im Edit-Modus übernimmt react-grid-layout (echtes 2D-Raster mit
 *  Spalte+Zeile je Kachel, automatischem Ausweichen und einem fertigen
 *  Andock-/Platzhalter-Muster) statt einer selbstgebauten Reihenfolge-
 *  Logik — Kacheln können dadurch bewusst UNTEREINANDER in derselben
 *  Spalte liegen, nicht nur in einer festen Lese-Reihenfolge. */
export function HeroTileGrid({ tiles, layout, editing, onLayoutChange }: HeroTileGridProps) {
  const byId = new Map(tiles.map((t) => [t.id, t]));
  const { width, containerRef, mounted } = useContainerWidth();
  const [draggingId, setDraggingId] = useState<string | null>(null);

  if (!editing) {
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

    return (
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
  }

  const gridLayout: LayoutItem[] = layout
    .filter((pos) => byId.has(pos.i))
    .map((pos) => {
      const size = HERO_TILE_SIZE[pos.i as keyof typeof HERO_TILE_SIZE] ?? DEFAULT_TILE_SIZE;
      return { i: pos.i, x: pos.x, y: pos.y, w: size.w, h: size.h };
    });

  function handleLayoutChange(next: Layout) {
    onLayoutChange(next.map(({ i, x, y }) => ({ i, x, y })));
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
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
          // Punktabstand = tatsächliche Rasterzeile inkl. Randabstand
          // (HERO_ROW_HEIGHT + HERO_ROW_MARGIN, s. core/hero-layout.js) —
          // die Punkte markieren damit echte Andock-Zeilen, keine Deko-Zahl.
          backgroundSize: `${HERO_ROW_HEIGHT + HERO_ROW_MARGIN}px ${HERO_ROW_HEIGHT + HERO_ROW_MARGIN}px`,
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
    </div>
  );
}

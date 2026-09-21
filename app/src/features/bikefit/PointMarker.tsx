import { useState, useRef, useEffect } from "react";
export interface Point {
  x: number;
  y: number;
}

export interface PointDef {
  key: string;
  label: string;
  hint: string;
  color: string;
}

interface PointMarkerProps {
  imageUrl: string;
  pointsToMark: PointDef[];
  linesToDraw?: [string, string][];
  currentPoints: Record<string, Point>;
  onChange: (points: Record<string, Point>) => void;
  title: string;
  description: string;
}

export function PointMarker({
  imageUrl,
  pointsToMark,
  linesToDraw = [],
  currentPoints,
  onChange,
  title,
  description,
}: PointMarkerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activePointKey, setActivePointKey] = useState<string>(pointsToMark[0]?.key || "");
  const [draggedKey, setDraggedKey] = useState<string | null>(null);

  // Finde den ersten noch ungesetzten Punkt beim Bildwechsel
  useEffect(() => {
    const unplaced = pointsToMark.find((p) => !currentPoints[p.key]);
    if (unplaced) {
      setActivePointKey(unplaced.key);
    } else if (pointsToMark[0]) {
      setActivePointKey(pointsToMark[0].key);
    }
  }, [imageUrl, pointsToMark]);

  const handlePointerDownImage = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current || !activePointKey) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

    const updated = {
      ...currentPoints,
      [activePointKey]: { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 },
    };
    onChange(updated);

    // Wechsle automatisch zum nächsten noch ungesetzten Punkt
    const currentIndex = pointsToMark.findIndex((p) => p.key === activePointKey);
    const nextUnset = pointsToMark.find((p, i) => i > currentIndex && !updated[p.key]);
    if (nextUnset) {
      setActivePointKey(nextUnset.key);
    }
  };

  const handlePointDrag = (key: string, e: React.PointerEvent) => {
    e.stopPropagation();
    setDraggedKey(key);
    setActivePointKey(key);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggedKey || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

    onChange({
      ...currentPoints,
      [draggedKey]: { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 },
    });
  };

  const handlePointerUp = () => {
    setDraggedKey(null);
  };

  const activeDef = pointsToMark.find((p) => p.key === activePointKey);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <h3 style={{ margin: "0 0 4px", fontSize: "1.05rem", color: "var(--ink)", fontFamily: "var(--font-disp)" }}>
          {title}
        </h3>
        <p style={{ margin: 0, fontSize: ".85rem", color: "var(--ink-3)" }}>{description}</p>
      </div>

      {/* Button-Leiste zur Auswahl des aktuell aktiven Punkts */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {pointsToMark.map((p) => {
          const isSet = !!currentPoints[p.key];
          const isActive = p.key === activePointKey;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => setActivePointKey(p.key)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: "var(--radius-pill)",
                background: isActive ? "var(--glass-3)" : "var(--glass-1)",
                border: `1px solid ${isActive ? p.color : isSet ? "var(--border)" : "var(--hair)"}`,
                color: isActive ? "var(--ink)" : "var(--ink-2)",
                fontFamily: "var(--font-body)",
                fontSize: ".8rem",
                cursor: "pointer",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: isSet ? p.color : "transparent",
                  border: `2px solid ${p.color}`,
                }}
              />
              <span>{p.label}</span>
              {isSet && <span style={{ fontSize: ".7rem", color: "var(--z1)" }}>✓</span>}
            </button>
          );
        })}
      </div>

      {activeDef && (
        <div
          style={{
            padding: "8px 14px",
            borderRadius: "var(--radius-sm)",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid var(--hair)",
            fontSize: ".8rem",
            color: "var(--ink-2)",
          }}
        >
          <strong style={{ color: activeDef.color }}>{activeDef.label}:</strong> {activeDef.hint}
          {" · "}
          <span style={{ color: "var(--ink-3)" }}>Klicke ins Bild oder ziehe den Punkt an die richtige Position.</span>
        </div>
      )}

      {/* Bild & Interaktives Punkt-Overlay */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDownImage}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{
          position: "relative",
          width: "100%",
          maxHeight: "60vh",
          overflow: "hidden",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border)",
          background: "#05070a",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          userSelect: "none",
          touchAction: "none",
          cursor: "crosshair",
        }}
      >
        <img
          src={imageUrl}
          alt={title}
          style={{
            display: "block",
            maxWidth: "100%",
            maxHeight: "60vh",
            objectFit: "contain",
            pointerEvents: "none",
          }}
        />

        {/* SVG Verbindungslinien zwischen gesetzten Punkten */}
        <svg
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        >
          {linesToDraw.map(([startKey, endKey], idx) => {
            const p1 = currentPoints[startKey];
            const p2 = currentPoints[endKey];
            if (!p1 || !p2) return null;
            return (
              <line
                key={idx}
                x1={`${p1.x}%`}
                y1={`${p1.y}%`}
                x2={`${p2.x}%`}
                y2={`${p2.y}%`}
                stroke="rgba(255, 255, 255, 0.6)"
                strokeWidth={2}
                strokeDasharray="4 3"
              />
            );
          })}
        </svg>

        {/* Die gesetzten Punkte als interaktive Marker */}
        {pointsToMark.map((p) => {
          const pt = currentPoints[p.key];
          if (!pt) return null;
          const isActive = p.key === activePointKey;

          return (
            <div
              key={p.key}
              onPointerDown={(e) => handlePointDrag(p.key, e)}
              style={{
                position: "absolute",
                left: `${pt.x}%`,
                top: `${pt.y}%`,
                transform: "translate(-50%, -50%)",
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: p.color,
                border: "2px solid #ffffff",
                boxShadow: isActive ? "0 0 12px rgba(255,255,255,0.8)" : "0 2px 6px rgba(0,0,0,0.6)",
                cursor: "grab",
                zIndex: isActive ? 20 : 10,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: "50%",
                  background: "#000",
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
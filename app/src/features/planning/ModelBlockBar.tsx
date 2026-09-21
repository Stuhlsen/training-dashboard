/* ============================================================
   FEATURES/PLANNING/MODELBLOCKBAR.TSX — Balkenreihe locker/mittel/hart je
   Periodisierungsmodell (Fahrplan 20 E2). Reine Darstellung, keine Logik —
   Werte kommen aus MODEL_BLOCK_SHARES (new-plan-dialog-view-model.ts).
   ============================================================ */

import type { BlockShare } from "./new-plan-dialog-view-model";

export interface ModelBlockBarProps {
  shares: BlockShare;
}

const SEGMENTS: ReadonlyArray<{ key: keyof BlockShare; color: string; label: string }> = [
  { key: "locker", color: "var(--z2)", label: "locker" },
  { key: "mittel", color: "var(--ss)", label: "mittel" },
  { key: "hart", color: "var(--thr)", label: "hart" },
];

export function ModelBlockBar({ shares }: ModelBlockBarProps) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          width: "100%",
          height: 6,
          borderRadius: "var(--pill)",
          overflow: "hidden",
        }}
      >
        {SEGMENTS.map(({ key, color, label }) => (
          <div
            key={key}
            title={`${label}: ${shares[key]}%`}
            style={{ width: `${shares[key]}%`, background: color }}
          />
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 4, fontSize: ".68rem", color: "var(--ink-3)" }}>
        {SEGMENTS.map(({ key, color, label }) => (
          <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span
              style={{
                display: "inline-block",
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: color,
              }}
            />
            {label} {shares[key]}%
          </span>
        ))}
      </div>
    </div>
  );
}

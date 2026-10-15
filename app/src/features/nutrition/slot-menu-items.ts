/* ============================================================
   FEATURES/NUTRITION/SLOT-MENU-ITEMS.TS — Einträge des "⋯"-Menüs
   (Fahrplan 25, R1) — aus SlotMenu.tsx herausgelöst (Fast-Refresh-Regel:
   Komponentendateien exportieren nur Komponenten).
   ============================================================ */

import type { SlotMenuItem } from "./SlotMenu";

/** Die vier Aktionen einer belegten Mahlzeit — gleiche Reihenfolge in Kachel und Zeile.
 *  Ohne auflösbares Rezept bleiben nur Tauschen und Entfernen. */
export function buildSlotMenuItems(p: {
  busy: boolean;
  hasRecipe: boolean;
  onSwap: () => void;
  onDetails: () => void;
  onCook: () => void;
  onRemove: () => void;
}): SlotMenuItem[] {
  return [
    { key: "swap", label: "Tauschen", onSelect: p.onSwap, disabled: p.busy },
    ...(p.hasRecipe
      ? [
          { key: "details", label: "Details", onSelect: p.onDetails },
          { key: "cook", label: "Kochen", onSelect: p.onCook },
        ]
      : []),
    { key: "remove", label: "Entfernen", onSelect: p.onRemove, disabled: p.busy },
  ];
}

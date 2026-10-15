/* ============================================================
   FEATURES/NUTRITION/SLOTMENU.TSX — "⋯"-Menü einer Mahlzeit-Kachel
   (Fahrplan 25, R1; Entscheidung 3)

   Alle Aktionen einer Kachel (Tauschen, Details, Kochen, Entfernen)
   liegen hier. Tippziel 44 px, per Tastatur bedienbar:
   Enter/Leertaste öffnet, Pfeil hoch/runter + Pos1/Ende wandern durch
   die Einträge, Escape schließt und gibt den Fokus an den Knopf zurück,
   Tab oder ein Klick daneben schließt ohne den Fokus zu stehlen.
   ============================================================ */

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { TAP_MIN } from "./nutrition-styles";

export interface SlotMenuItem {
  key: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

const TRIGGER_STYLE: CSSProperties = {
  width: TAP_MIN,
  height: TAP_MIN,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 999,
  border: "1px solid rgba(255, 255, 255, 0.14)",
  // dunkle Scheibe, damit das Zeichen auch über hellen Bildstellen lesbar bleibt
  background: "rgba(8, 9, 12, 0.78)",
  color: "var(--ink)",
  fontFamily: "var(--font-disp)",
  fontSize: "1.2rem",
  fontWeight: 600,
  lineHeight: 1,
  cursor: "pointer",
};
const MENU_STYLE: CSSProperties = {
  position: "absolute",
  top: TAP_MIN + 4,
  right: 0,
  zIndex: 20,
  minWidth: 168,
  padding: 4,
  borderRadius: "var(--radius)",
  border: "1px solid var(--hair)",
  background: "var(--surface-tile)",
  boxShadow: "var(--e2)",
};
const ITEM_STYLE: CSSProperties = {
  display: "block",
  width: "100%",
  minHeight: TAP_MIN,
  padding: "8px 14px",
  border: "none",
  borderRadius: 8,
  background: "transparent",
  color: "var(--ink)",
  fontFamily: "var(--font-disp)",
  fontSize: ".9rem",
  fontWeight: 600,
  textAlign: "left",
  cursor: "pointer",
};

export function SlotMenu({
  label,
  items,
  onOpenChange,
}: {
  /** Zugänglicher Name des Knopfs, z. B. "Frühstück: Aktionen" */
  label: string;
  items: readonly SlotMenuItem[];
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpenState] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function setOpen(next: boolean) {
    setOpenState(next);
    onOpenChange?.(next);
  }

  const menuButtons = () =>
    Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? []);

  // Klick/Tipp außerhalb schließt
  useEffect(() => {
    if (!open) return;
    function onOutside(e: Event) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpenState(false);
        onOpenChange?.(false);
      }
    }
    document.addEventListener("pointerdown", onOutside);
    return () => document.removeEventListener("pointerdown", onOutside);
  }, [open, onOpenChange]);

  // Beim Öffnen auf den ersten Eintrag
  useEffect(() => {
    if (open) menuButtons()[0]?.focus();
  }, [open]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!open) return;
    if (e.key === "Escape") {
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (e.key === "Tab") {
      setOpen(false);
      return;
    }
    const buttons = menuButtons();
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let target: HTMLButtonElement | undefined;
    if (e.key === "ArrowDown") target = buttons[(index + 1) % buttons.length];
    else if (e.key === "ArrowUp") target = buttons[(index - 1 + buttons.length) % buttons.length];
    else if (e.key === "Home") target = buttons[0];
    else if (e.key === "End") target = buttons[buttons.length - 1];
    if (target) {
      e.preventDefault();
      target.focus();
    }
  }

  function select(item: SlotMenuItem) {
    setOpen(false);
    // Fokus zurück an den Knopf: folgt danach ein Blatt oder Dialog, merkt der sich diesen Ort
    triggerRef.current?.focus();
    item.onSelect();
  }

  return (
    <div ref={rootRef} onKeyDown={onKeyDown} style={{ position: "relative" }}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        style={TRIGGER_STYLE}
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open && (
        <div role="menu" aria-label={label} style={MENU_STYLE}>
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              style={item.disabled ? { ...ITEM_STYLE, opacity: 0.5, cursor: "not-allowed" } : ITEM_STYLE}
              onClick={() => select(item)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

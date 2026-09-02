/* ============================================================
   COMPONENTS/USERMENU.TSX — Konto-Pille oben rechts (ersetzt die frühere
   "Settings"-Pille + den separaten "Abmelden"-Knopf). Zeigt, als wer man
   eingeloggt ist (Profilname, sonst E-Mail) und öffnet per Klick ein
   kleines Menü mit "Einstellungen" und "Abmelden".

   Rein präsentational: `label` und `onSignOut` kommen als Props von
   Layout.tsx (das über `useAccountLabel()` aus der hooks/-Schicht lädt) —
   keine api/-Importe hier, s. AGENTS.md-Abhängigkeitstabelle.

   A11y: Disclosure-Muster (`aria-expanded` + `aria-controls`), bewusst KEIN
   `role="menu"`/APG-Menu — zwei native fokussierbare Kinder (Link + Button),
   Tab-Reihenfolge = DOM-Reihenfolge, Escape und Klick daneben schließen.
   ============================================================ */

import { useCallback, useId, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import { NavLink } from "react-router-dom";
import { useEscapeToClose } from "../hooks/useEscapeToClose";
import { useOnClickOutside } from "../hooks/useOnClickOutside";
import { PILL_BUTTON_STYLE } from "./pill-style";

const TRIGGER_STYLE: CSSProperties = {
  ...PILL_BUTTON_STYLE,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  maxWidth: 220,
  overflow: "hidden",
};

const MENU_ITEM_STYLE: CSSProperties = {
  padding: "8px 10px",
  borderRadius: "var(--radius-sm)",
  fontFamily: "var(--font-disp)",
  fontWeight: 600,
  fontSize: ".86rem",
  color: "var(--ink-2)",
  textDecoration: "none",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  textAlign: "left",
  width: "100%",
};

function hoverOn(e: ReactMouseEvent<HTMLElement>) {
  e.currentTarget.style.background = "rgba(255,255,255,0.08)";
}
function hoverOff(e: ReactMouseEvent<HTMLElement>) {
  e.currentTarget.style.background = "transparent";
}

interface UserMenuProps {
  /** Anzeigename (Profil oder E-Mail) — nie leer, s. hooks/account-label.ts. */
  label: string;
  onSignOut: () => void;
}

export function UserMenu({ label, onSignOut }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupId = useId();

  const close = useCallback(() => setOpen(false), []);
  // Escape schließt UND holt den Fokus zurück auf die Pille (Disclosure-
  // Muster). Der Klick-daneben-Pfad nutzt bewusst `close` ohne Refokus — dort
  // hat der Klick den Fokus schon woandershin getragen.
  const closeAndRefocus = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);
  useEscapeToClose(closeAndRefocus, open);
  useOnClickOutside(rootRef, close, open);

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? popupId : undefined}
        style={{
          ...TRIGGER_STYLE,
          background: open ? "rgba(255,255,255,0.14)" : "transparent",
          color: open ? "var(--ink)" : "var(--ink-3)",
        }}
      >
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
        <span aria-hidden="true" style={{ fontSize: ".7em", color: "var(--ink-3)" }}>
          ▾
        </span>
      </button>

      {open && (
        <div
          id={popupId}
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 6px)",
            minWidth: 190,
            background: "var(--surface-tooltip)",
            border: "1px solid var(--hair)",
            borderRadius: "var(--radius-sm)",
            padding: 6,
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
          }}
        >
          <NavLink
            to="/settings"
            onClick={close}
            onMouseEnter={hoverOn}
            onMouseLeave={hoverOff}
            // Aktiv-Route nur über die Textfarbe markieren (nicht den
            // Hintergrund — den steuern die Hover-Handler oben) — ersetzt den
            // Aktiv-Zustand der früheren "Settings"-Pille.
            style={({ isActive }) => ({ ...MENU_ITEM_STYLE, color: isActive ? "var(--ink)" : "var(--ink-2)" })}
          >
            Einstellungen
          </NavLink>
          <button
            type="button"
            onClick={() => {
              close();
              onSignOut();
            }}
            onMouseEnter={hoverOn}
            onMouseLeave={hoverOff}
            style={MENU_ITEM_STYLE}
          >
            Abmelden
          </button>
        </div>
      )}
    </div>
  );
}

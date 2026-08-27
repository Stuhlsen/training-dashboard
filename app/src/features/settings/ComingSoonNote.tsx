import { HEADING_STYLE, SECTION_STYLE } from "./section-styles";

interface ComingSoonNoteProps {
  heading: string;
  body: string;
}

/** Geteilte Optik für Einstellungen, die bewusst noch nicht funktionieren
 *  (Aktive Sitzungen, Benachrichtigungen) — reiner Platzhalter, KEINE
 *  Toggles/Buttons, die eine Funktion vortäuschen würden. */
export function ComingSoonNote({ heading, body }: ComingSoonNoteProps) {
  return (
    <div style={SECTION_STYLE}>
      <div style={HEADING_STYLE}>{heading}</div>
      <p style={{ fontFamily: "var(--font-body)", fontSize: ".8rem", color: "var(--ink-3)", margin: "0 0 12px", maxWidth: 480 }}>
        {body}
      </p>
      <span
        style={{
          display: "inline-block",
          fontFamily: "var(--font-mono)",
          fontSize: ".62rem",
          textTransform: "uppercase",
          letterSpacing: ".06em",
          color: "var(--ink-3)",
          background: "rgba(255,255,255,.05)",
          border: "1px solid var(--hair)",
          borderRadius: "var(--pill)",
          padding: "4px 12px",
        }}
      >
        Kommt bald
      </span>
    </div>
  );
}

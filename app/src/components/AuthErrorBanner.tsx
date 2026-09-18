import { useState, type CSSProperties } from "react";
import { GlassCard } from "./GlassCard";
import { useEscapeToClose } from "../hooks/useEscapeToClose";

/* ============================================================
   COMPONENTS/AUTHERRORBANNER.TSX

   Supabase haengt bei abgelaufenen/ungueltigen Auth-Links (Invite,
   Passwort-Reset) den Fehler als URL-Fragment an
   (#error=access_denied&error_code=otp_expired&error_description=...)
   statt eine Seite zu rendern. Ohne diese Komponente blieb der Fehler
   nur in der Adressleiste sichtbar, nie im Frontend (admin-Invite-Test
   mit Tony, 18.09.2026). `detectSessionInUrl` in client.ts verarbeitet
   nur Token-Fragmente, keine Fehler-Fragmente — die muessen hier separat
   gelesen werden.

   Overlay-/Dialog-Muster wie FtpRescaleDialog.tsx (`useEscapeToClose`,
   Klick-daneben schliesst) statt einer Banner-Zeile — konsistent mit den
   uebrigen Popups im Projekt statt einer eigenen Stil-Insel.
   ============================================================ */

const ERROR_MESSAGES: Record<string, string> = {
  otp_expired: "Der Link ist abgelaufen. Bitte eine neue Einladung anfordern.",
};

const PRIMARY_BTN_STYLE: CSSProperties = {
  border: "1px solid var(--ss)",
  borderRadius: "var(--pill)",
  padding: "8px 18px",
  background: "var(--ss)",
  color: "#17110a",
  font: "inherit",
  fontSize: ".82rem",
  fontWeight: 600,
  cursor: "pointer",
};

function readHashError(): string | null {
  const hash = window.location.hash;
  if (!hash.includes("error=")) return null;

  const params = new URLSearchParams(hash.slice(1));
  const code = params.get("error_code");
  const description = params.get("error_description");
  return (
    (code && ERROR_MESSAGES[code]) ??
    (description ? description.replace(/\+/g, " ") : "Der Link ist ungültig oder abgelaufen.")
  );
}

// Fragment sofort beim ersten Render entfernen, nicht erst beim Schliessen —
// sonst bleibt es bei jedem Reload sichtbar und wirkt wie ein kaputter Link,
// auch waehrend das Popup noch offen ist.
function clearHashOnce(): boolean {
  const message = readHashError();
  if (!message) return false;
  const cleanUrl = window.location.pathname + window.location.search;
  window.history.replaceState(null, "", cleanUrl);
  return true;
}

export function AuthErrorBanner() {
  const [message] = useState(readHashError);
  const [dismissed, setDismissed] = useState(() => !clearHashOnce());

  useEscapeToClose(() => setDismissed(true), !dismissed);

  if (dismissed || !message) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(7,9,14,.75)",
        backdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setDismissed(true);
      }}
    >
      <GlassCard variant="strong" radius="22px" style={{ width: "100%", maxWidth: 420, padding: "26px 24px" }}>
        <div style={{ fontFamily: "var(--font-disp)", fontWeight: 700, fontSize: "1rem", color: "var(--ink)" }}>
          Link nicht gültig
        </div>
        <p style={{ margin: "10px 0 20px", fontSize: ".82rem", color: "var(--ink-3)" }}>{message}</p>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" style={PRIMARY_BTN_STYLE} onClick={() => setDismissed(true)}>
            Schließen
          </button>
        </div>
      </GlassCard>
    </div>
  );
}

/* ============================================================
   FEATURES/SETTINGS/INVITEATHLETESECTION.TSX — Admin-Athlet-Einladen
   (Fahrplan 15 E4, Muster FormatCatalogSection)

   Nur für `profile.isAdmin` gemountet (SettingsPage). E-Mail eingeben →
   „Einladen" → admin-api ruft GoTrues generate_link auf und liefert
   `hashedToken` zurück (kein SMTP, s. Nachtrag V1 in
   planning/fahrplan-15-einladungs-onboarding.md) — die Sektion baut daraus
   selbst einen Link auf die eigene Onboarding-Seite (nicht auf GoTrue
   direkt, s. V2-Kommentar in admin-api/invite.js: ein GoTrue-`action_link`
   verbraucht sich schon durch einen stillen Linkvorschau-Abruf, bevor die
   eingeladene Person je klickt). Wird hier angezeigt und ist per Button
   kopierbar, Alex verschickt ihn selbst (Signal/SMS).
   ============================================================ */

import { useState } from "react";
import { inviteAthlete, type InviteProfileRole } from "../../api/admin-invite";
import type { ResultError } from "../../api/types";
import { SECTION_STYLE, LABEL_STYLE, INPUT_STYLE, LINK_BUTTON_STYLE, ERROR_STYLE, HEADING_STYLE } from "./section-styles";

const PRIMARY_BUTTON_STYLE = {
  alignSelf: "flex-start" as const,
  padding: "9px 18px",
  borderRadius: "var(--pill)",
  border: "none",
  background: "var(--ss)",
  color: "#17110a",
  fontWeight: 600,
};

const LINK_BOX_STYLE = {
  display: "block",
  wordBreak: "break-all" as const,
  fontFamily: "var(--font-mono)",
  fontSize: ".7rem",
  color: "var(--ink)",
  background: "rgba(255,255,255,.04)",
  border: "1px solid var(--hair)",
  borderRadius: "var(--radius-sm)",
  padding: "8px 10px",
};

function translateError(error: ResultError): string {
  switch (error.code) {
    case "HTTP":
      return "Diese E-Mail ist bereits eingeladen oder registriert.";
    case "NETWORK":
      return "admin-api oder GoTrue gerade nicht erreichbar — später erneut versuchen.";
    case "SCHEMA":
      return "Ungültige E-Mail-Adresse.";
    case "TOKEN_INVALID":
      return "Sitzung abgelaufen — bitte neu einloggen.";
    default:
      return error.message || "Einladen fehlgeschlagen.";
  }
}

export function InviteAthleteSection() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteProfileRole>("athlete");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsPending(true);
    setError(null);
    setLink(null);
    setCopied(false);
    const result = await inviteAthlete(email.trim(), role, isAdmin);
    setIsPending(false);
    if (!result.ok) {
      setError(translateError(result.error));
      return;
    }
    const url = new URL("/onboarding/accept", window.location.origin);
    url.searchParams.set("token_hash", result.hashedToken);
    url.searchParams.set("type", "invite");
    setLink(url.toString());
    setEmail("");
  }

  async function handleCopy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setError("Kopieren fehlgeschlagen — Link von Hand markieren.");
    }
  }

  return (
    <div style={SECTION_STYLE}>
      <h3 style={HEADING_STYLE}>Neu einladen</h3>
      <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={LABEL_STYLE}>
          E-Mail der einzuladenden Person
          <input
            type="email"
            required
            value={email}
            disabled={isPending}
            onChange={(e) => setEmail(e.target.value)}
            style={INPUT_STYLE}
          />
        </label>
        <label style={LABEL_STYLE}>
          Rolle
          <select
            value={role}
            disabled={isPending}
            onChange={(e) => setRole(e.target.value as InviteProfileRole)}
            style={INPUT_STYLE}
          >
            <option value="athlete">Athlet</option>
            <option value="coach">Trainer</option>
          </select>
        </label>
        <label style={{ ...LABEL_STYLE, display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={isAdmin}
            disabled={isPending}
            onChange={(e) => setIsAdmin(e.target.checked)}
          />
          Admin-Rechte
        </label>
        <button
          type="submit"
          disabled={isPending || !email.trim()}
          style={{ ...PRIMARY_BUTTON_STYLE, cursor: isPending ? "default" : "pointer", opacity: isPending ? 0.7 : 1 }}
        >
          {isPending ? "Lädt …" : "Einladen"}
        </button>
      </form>

      {error && <p style={{ ...ERROR_STYLE, marginTop: 8 }}>{error}</p>}

      {link && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          <p style={{ margin: 0, color: "var(--ink-3)", fontSize: ".78rem" }}>
            Einladungslink erstellt — kein Mail-Versand, selbst weitergeben (Signal/SMS):
          </p>
          <code style={LINK_BOX_STYLE}>{link}</code>
          <button type="button" onClick={() => void handleCopy()} style={LINK_BUTTON_STYLE}>
            {copied ? "Kopiert ✓" : "Link kopieren"}
          </button>
        </div>
      )}
    </div>
  );
}

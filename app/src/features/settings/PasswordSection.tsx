/* ============================================================
   FEATURES/SETTINGS/PASSWORDSECTION.TSX — Passwortänderung, ALLE Rollen
   (C5.3), Port von ui/settings-panel.js::buildPasswordSection()
   ============================================================ */

import { useState } from "react";
import { useUpdatePassword } from "../../api/hooks/useProfile";
import { SavedCheck } from "./SavedCheck";
import { SECTION_STYLE, LABEL_STYLE, INPUT_STYLE, LINK_BUTTON_STYLE, HEADING_STYLE, ERROR_STYLE } from "./section-styles";

export function PasswordSection() {
  const { update, isPending } = useUpdatePassword();
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function reset() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("Neue Passwörter stimmen nicht überein.");
      return;
    }
    const result = await update(currentPassword, newPassword);
    if (!result.ok) {
      setError(result.error?.message || "Passwort konnte nicht geändert werden.");
      return;
    }
    reset();
    setOpen(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div style={SECTION_STYLE}>
      <div style={HEADING_STYLE}>Passwort</div>
      {!open && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <button type="button" onClick={() => setOpen(true)} style={LINK_BUTTON_STYLE}>
            Passwort ändern
          </button>
          {saved && <SavedCheck />}
        </span>
      )}
      {open && (
        <form
          onSubmit={(e) => void handleSubmit(e)}
          style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}
        >
          <label style={LABEL_STYLE}>
            Aktuelles Passwort
            <input
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              style={INPUT_STYLE}
            />
          </label>
          <label style={LABEL_STYLE}>
            Neues Passwort
            <input
              type="password"
              autoComplete="new-password"
              minLength={6}
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              style={INPUT_STYLE}
            />
          </label>
          <label style={LABEL_STYLE}>
            Neues Passwort wiederholen
            <input
              type="password"
              autoComplete="new-password"
              minLength={6}
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={INPUT_STYLE}
            />
          </label>
          {error && <div style={ERROR_STYLE}>{error}</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button
              type="submit"
              disabled={isPending}
              style={{
                padding: "9px 18px",
                borderRadius: "var(--pill)",
                border: "none",
                background: "var(--ss)",
                color: "#17110a",
                fontWeight: 600,
                cursor: isPending ? "default" : "pointer",
                opacity: isPending ? 0.7 : 1,
              }}
            >
              {isPending ? "Speichern …" : "Speichern"}
            </button>
            <button
              type="button"
              onClick={() => {
                reset();
                setOpen(false);
              }}
              style={{
                padding: "9px 18px",
                borderRadius: "var(--pill)",
                border: "1px solid var(--hair)",
                background: "transparent",
                color: "var(--ink-3)",
                cursor: "pointer",
              }}
            >
              Abbrechen
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

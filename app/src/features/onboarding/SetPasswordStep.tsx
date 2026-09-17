/* ============================================================
   FEATURES/ONBOARDING/SETPASSWORDSTEP.TSX — Pflicht-Schritt 1 des
   Onboarding-Assistenten (Fahrplan 17 E7). Einziger echter neuer Schritt:
   setzt das Passwort einer frisch eingeladenen Person OHNE Re-Auth
   (useSetInitialPassword()) — anders als die bestehende PasswordSection.tsx
   in Settings, die ein aktuelles Passwort verlangt. Kein onSkip: der
   Assistent erzwingt diesen Schritt.
   ============================================================ */

import { useState, type FormEvent } from "react";
import { useSetInitialPassword } from "../../api/hooks/useProfile";
import { LABEL_STYLE, INPUT_STYLE, HEADING_STYLE, ERROR_STYLE } from "../settings/section-styles";

export interface WizardStepProps {
  onComplete: () => void;
  onSkip?: () => void;
}

export function SetPasswordStep({ onComplete }: WizardStepProps) {
  const { update, isPending } = useSetInitialPassword();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("Passwörter stimmen nicht überein.");
      return;
    }
    const result = await update(newPassword);
    if (!result.ok) {
      setError(result.error?.message || "Passwort konnte nicht gesetzt werden.");
      return;
    }
    onComplete();
  }

  return (
    <div>
      <div style={HEADING_STYLE}>Passwort festlegen</div>
      <p style={{ fontSize: ".72rem", color: "var(--ink-3)", margin: "0 0 16px" }}>
        Bevor es losgeht: ein eigenes Passwort für den nächsten Login.
      </p>
      <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={LABEL_STYLE}>
          Neues Passwort
          <input
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            style={{ ...INPUT_STYLE, marginTop: 4 }}
          />
        </label>
        <label style={LABEL_STYLE}>
          Passwort wiederholen
          <input
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={{ ...INPUT_STYLE, marginTop: 4 }}
          />
        </label>
        {error && <div style={ERROR_STYLE}>{error}</div>}
        <button
          type="submit"
          disabled={isPending}
          style={{
            marginTop: 4,
            padding: "11px 18px",
            borderRadius: "var(--pill)",
            border: "none",
            background: "var(--ss)",
            color: "#17110a",
            fontFamily: "var(--font-disp)",
            fontWeight: 600,
            fontSize: ".86rem",
            cursor: isPending ? "default" : "pointer",
            opacity: isPending ? 0.7 : 1,
          }}
        >
          {isPending ? "Speichern …" : "Weiter"}
        </button>
      </form>
    </div>
  );
}

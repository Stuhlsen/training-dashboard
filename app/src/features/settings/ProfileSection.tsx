/* ============================================================
   FEATURES/SETTINGS/PROFILESECTION.TSX — Anzeigename (Port von
   ui/settings-panel.js::buildProfileSection())

   Nur noch der Name. Die Schalter, die hier früher mitstanden, leben jetzt
   dort, wo sie fachlich hingehören: „Befinden/FTP öffentlich" in
   SharingSection (Datenschutz & Freigaben), „Stufenvorschlag" in
   ProgressionSection (Training), „Befinden anpassen" in CheckinSection.
   ============================================================ */

import { useState } from "react";
import { useSessionProfile } from "../../api/hooks/useSession";
import { useUpdateDisplayName } from "../../api/hooks/useProfile";
import { SavedCheck } from "./SavedCheck";
import { SECTION_STYLE, LABEL_STYLE, INPUT_STYLE } from "./section-styles";

function initials(name: string | null): string {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function ProfileSection() {
  const profile = useSessionProfile();
  const { update: updateName, isPending: savingName } = useUpdateDisplayName();

  const [name, setName] = useState(profile?.displayName ?? "");
  const [nameSaved, setNameSaved] = useState(false);
  const [error, setError] = useState("");

  // Nachziehen, sobald das Profil (asynchron) eintrifft — vor dem ersten
  // Laden ist `profile` noch `null`, das Input-Feld startet dann leer.
  if (profile && name === "" && profile.displayName) {
    setName(profile.displayName);
  }

  async function handleNameBlur() {
    const trimmed = name.trim();
    if (!trimmed) {
      setName(profile?.displayName ?? "");
      return;
    }
    if (trimmed === profile?.displayName) return;
    setError("");
    const result = await updateName(trimmed);
    if (!result.ok) {
      setError(result.error?.message || "Name konnte nicht gespeichert werden.");
      return;
    }
    setNameSaved(true);
    setTimeout(() => setNameSaved(false), 1500);
  }

  if (!profile) return null;

  return (
    <div style={SECTION_STYLE}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            flexShrink: 0,
            width: 34,
            height: 34,
            borderRadius: "50%",
            background: "rgba(224,138,60,.16)",
            border: "1px solid rgba(224,138,60,.3)",
            color: "var(--ss)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-disp)",
            fontWeight: 700,
            fontSize: ".75rem",
          }}
        >
          {initials(profile.displayName)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <label style={LABEL_STYLE}>Name</label>
          <span style={{ display: "inline-flex", alignItems: "center", width: "100%", gap: 6 }}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => void handleNameBlur()}
              disabled={savingName}
              style={{ ...INPUT_STYLE, flex: 1 }}
            />
            {nameSaved && <SavedCheck />}
          </span>
        </div>
      </div>

      {error && (
        <div style={{ color: "var(--danger)", fontFamily: "var(--font-mono)", fontSize: ".62rem", marginTop: 10 }}>
          {error}
        </div>
      )}
    </div>
  );
}

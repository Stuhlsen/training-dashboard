/* ============================================================
   FEATURES/SETTINGS/PROFILESECTION.TSX — Name, Befinden-öffentlich-Toggle,
   Check-in-Kurzeinstieg (Port von ui/settings-panel.js::
   buildProfileSection())
   ============================================================ */

import { useState } from "react";
import { useSessionProfile } from "../../api/hooks/useSession";
import {
  useUpdateDisplayName,
  useUpdateWellbeingPublic,
  useUpdateLadderProgressionEnabled,
} from "../../api/hooks/useProfile";
import { ToggleSwitch } from "./ToggleSwitch";
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

interface ProfileSectionProps {
  onOpenCheckin: () => void;
}

export function ProfileSection({ onOpenCheckin }: ProfileSectionProps) {
  const profile = useSessionProfile();
  const { update: updateName, isPending: savingName } = useUpdateDisplayName();
  const { update: updateWellbeing } = useUpdateWellbeingPublic();
  const { update: updateLadderProgression } = useUpdateLadderProgressionEnabled();

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
  const isAthlete = profile.role === "athlete";

  return (
    <div style={SECTION_STYLE}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
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
        <div style={{ color: "var(--danger)", fontFamily: "var(--font-mono)", fontSize: ".62rem", marginBottom: 10 }}>
          {error}
        </div>
      )}

      {isAthlete && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            type="button"
            onClick={onOpenCheckin}
            style={{
              alignSelf: "flex-start",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: ".62rem",
              color: "var(--ss)",
              padding: 0,
            }}
          >
            Befinden anpassen
          </button>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: ".65rem", color: "var(--ink-3)" }}>
              Befinden öffentlich
            </span>
            <ToggleSwitch
              on={profile.wellbeingPublic}
              onChange={() => void updateWellbeing(!profile.wellbeingPublic)}
              label="Befinden öffentlich sichtbar"
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: ".65rem", color: "var(--ink-3)" }}>
              Stufenvorschlag (Auto-Progression)
            </span>
            <ToggleSwitch
              on={profile.ladderProgressionEnabled}
              onChange={() => void updateLadderProgression(!profile.ladderProgressionEnabled)}
              label="Stufenvorschlag aktiv"
            />
          </div>
        </div>
      )}
    </div>
  );
}

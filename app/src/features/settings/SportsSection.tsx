/* ============================================================
   FEATURES/SETTINGS/SPORTSSECTION.TSX — Self-Service
   Sportart-Auswahl (Fahrplan 21, E3). Checkboxen Rad/Lauf/Schwimm.
   KEINE Sportart ist Pflicht — auch Rad nicht (Q4). Die einzige
   Regel: die jeweils letzte *verbleibende* aktive Sportart (welche
   auch immer das gerade ist) lässt sich nicht abwählen, damit nie
   eine leere Auswahl entsteht. Kein Fehler-Dialog nötig, der Schalter
   bleibt einfach stehen.

   Schreibt direkt auf `profiles.sports` (nicht `profiles_own` — Q5
   verlangt Trainer-Sichtbarkeit über `profiles_visible`). Der Wert
   wird sofort gespeichert (wie UnitsSection), kein separater
   Speichern-Button.

   Läuft auch als Pflichtschritt im Onboarding-Assistenten (E4,
   V4-Contract): `onComplete` schaltet den Weiter-Footer ein, es gibt
   bewusst KEIN `onSkip` (Q8). Standalone in Settings bleibt
   `onComplete` ungenutzt (kein Footer).
   ============================================================ */

import { useState } from "react";
import { useCurrentProfile } from "../../api/hooks/useSession";
import { useUpdateSports } from "../../api/hooks/useProfile";
import { SavedCheck } from "./SavedCheck";
import type { Sport } from "../../api/types";

export interface SportsSectionProps {
  /** Nur relevant, wenn diese Sektion als Onboarding-Wizard-Schritt läuft
   *  (E4) statt standalone in Settings — in E3 ungenutzt (V4-Contract). */
  onComplete?: () => void;
}

const ALL_SPORTS: { id: Sport; label: string }[] = [
  { id: "ride", label: "Rad" },
  { id: "run", label: "Lauf" },
  { id: "swim", label: "Schwimm" },
];

export function SportsSection({ onComplete }: SportsSectionProps) {
  const profile = useCurrentProfile();
  const { update, isPending } = useUpdateSports();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const selected = profile.data?.sports ?? [];
  const isOnlyOneLeft = selected.length <= 1;

  async function toggle(sport: Sport, next: boolean) {
    setError("");
    let nextSelection: Sport[];
    if (next) {
      nextSelection = [...selected, sport];
    } else {
      // Letzte verbleibende Sportart darf nicht abgewählt werden (Q4:
      // mindestens eine). Schalter bleibt einfach stehen, kein Fehler.
      if (isOnlyOneLeft) return;
      nextSelection = selected.filter((s) => s !== sport);
    }
    // Reihenfolge wie ALL_SPORTS für eine stabile Anzeige.
    nextSelection = ALL_SPORTS.map((s) => s.id).filter((id) => nextSelection.includes(id));
    const result = await update(nextSelection);
    if (!result.ok) {
      setError(result.error?.message || "Konnte nicht gespeichert werden.");
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div style={{ padding: "18px 0", borderBottom: "1px solid var(--hair)" }}>
      <label
        style={{
          display: "block",
          fontFamily: "var(--font-mono)",
          fontSize: ".62rem",
          textTransform: "uppercase",
          letterSpacing: ".06em",
          color: "var(--ink-3)",
          marginBottom: 10,
        }}
      >
        Sportarten
      </label>

      {profile.isLoading ? (
        <div style={{ color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: ".8rem" }}>
          Lädt…
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {ALL_SPORTS.map(({ id, label }) => {
            const checked = selected.includes(id);
            const locked = checked && isOnlyOneLeft;
            return (
              <label
                key={id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  fontFamily: "var(--font-body)",
                  fontSize: ".85rem",
                  color: locked ? "var(--ink-3)" : "var(--ink)",
                  cursor: locked ? "not-allowed" : "pointer",
                }}
                title={locked ? "Mindestens eine Sportart muss aktiv bleiben" : undefined}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={locked || isPending}
                  onChange={(e) => void toggle(id, e.target.checked)}
                  style={{ accentColor: "var(--ss)", width: 16, height: 16 }}
                />
                {label}
                {checked && saved && <SavedCheck />}
              </label>
            );
          })}
        </div>
      )}

      {error && (
        <div style={{ color: "var(--danger)", fontFamily: "var(--font-mono)", fontSize: ".62rem", minHeight: "1em", marginTop: 8 }}>
          {error}
        </div>
      )}

      {onComplete && (
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button
            type="button"
            onClick={onComplete}
            style={{
              padding: "9px 18px",
              borderRadius: "var(--pill)",
              border: "none",
              background: "var(--ss)",
              color: "#17110a",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Weiter
          </button>
        </div>
      )}
    </div>
  );
}
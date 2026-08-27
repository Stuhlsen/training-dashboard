import { useSessionProfile } from "../../api/hooks/useSession";
import { useUpdateUnitsPreference } from "../../api/hooks/useProfile";
import { HEADING_STYLE, SECTION_STYLE } from "./section-styles";

const PILL_BASE = {
  padding: "8px 18px",
  borderRadius: "var(--pill)",
  border: "none",
  fontFamily: "var(--font-mono)",
  fontSize: ".7rem",
  cursor: "pointer" as const,
};

/** Zwei-Wert-Auswahl (km/mi) — kein ToggleSwitch, da nicht boolesch.
 *  Muster wie das Speichern/Abbrechen-Pillenpaar in PasswordSection.tsx. */
export function UnitsSection() {
  const profile = useSessionProfile();
  const { update, isPending } = useUpdateUnitsPreference();

  if (!profile) return null;
  const value = profile.unitsPreference;

  return (
    <div style={SECTION_STYLE}>
      <div style={HEADING_STYLE}>Einheiten</div>
      <div style={{ display: "inline-flex", background: "rgba(255,255,255,.06)", borderRadius: "var(--pill)", padding: 3 }}>
        <button
          type="button"
          disabled={isPending}
          onClick={() => void update("km")}
          style={{ ...PILL_BASE, background: value === "km" ? "var(--ss)" : "transparent", color: value === "km" ? "#17110a" : "var(--ink-3)" }}
        >
          km
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => void update("mi")}
          style={{ ...PILL_BASE, background: value === "mi" ? "var(--ss)" : "transparent", color: value === "mi" ? "#17110a" : "var(--ink-3)" }}
        >
          mi
        </button>
      </div>
    </div>
  );
}

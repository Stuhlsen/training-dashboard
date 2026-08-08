/** Pill-Toggle — Port der Inline-Toggle-Optik aus ui/settings-panel.js
 *  (Wellbeing-öffentlich/Formate). Lokal in features/settings/, weil bisher
 *  nur hier zweimal gebraucht (Profile-/Formats-Sektion) — kein globaler
 *  components/-Baustein, solange kein dritter Bereich ihn braucht. */
interface ToggleSwitchProps {
  on: boolean;
  onChange: () => void;
  disabled?: boolean;
  label?: string;
}

export function ToggleSwitch({ on, onChange, disabled, label }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      aria-pressed={on}
      aria-label={label}
      style={{
        width: 36,
        height: 20,
        borderRadius: "var(--pill)",
        flexShrink: 0,
        border: "none",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : 1,
        position: "relative",
        background: on ? "var(--ss)" : "rgba(255,255,255,.10)",
        transition: "background .15s",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: 2,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          transition: "transform .15s",
          transform: on ? "translateX(16px)" : "translateX(0)",
        }}
      />
    </button>
  );
}

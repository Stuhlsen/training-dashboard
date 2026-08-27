import { useState } from "react";
import { useAuthUserId } from "../../api/hooks/useSession";
import { exportOwnData } from "./export-own-data";
import { ERROR_STYLE, HEADING_STYLE, SECTION_STYLE } from "./section-styles";

export function DataExportSection() {
  const userId = useAuthUserId();
  const [isPending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleClick() {
    if (!userId) return;
    setPending(true);
    setError("");
    const result = await exportOwnData(userId);
    setPending(false);
    if (!result.ok) setError(result.error?.message || "Export fehlgeschlagen.");
  }

  return (
    <div style={SECTION_STYLE}>
      <div style={HEADING_STYLE}>Eigene Daten exportieren</div>
      <p style={{ fontFamily: "var(--font-body)", fontSize: ".8rem", color: "var(--ink-3)", margin: "0 0 12px", maxWidth: 420 }}>
        Aktive Ziele, FTP-Verlauf, Trainingskarten und Befinden-Einträge als Datei.
      </p>
      <button
        type="button"
        disabled={isPending}
        onClick={() => void handleClick()}
        style={{
          padding: "9px 18px",
          borderRadius: "var(--pill)",
          border: "1px solid var(--hair)",
          background: "transparent",
          color: "var(--ink)",
          fontFamily: "inherit",
          fontSize: ".8rem",
          cursor: isPending ? "default" : "pointer",
          opacity: isPending ? 0.7 : 1,
        }}
      >
        {isPending ? "Exportiere …" : "Exportieren"}
      </button>
      {error && <div style={{ ...ERROR_STYLE, marginTop: 8 }}>{error}</div>}
    </div>
  );
}

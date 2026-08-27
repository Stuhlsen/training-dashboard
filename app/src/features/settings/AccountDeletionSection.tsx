import { useState } from "react";
import { useAccountDeletionRequest, useRequestAccountDeletion } from "../../api/hooks/useAccountDeletionRequest";
import { fmtDate } from "../../core/format.js";
import { ERROR_STYLE, HEADING_STYLE, SECTION_STYLE } from "./section-styles";

export function AccountDeletionSection() {
  const { requestedAt, isLoading } = useAccountDeletionRequest();
  const { request, isPending } = useRequestAccountDeletion();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  async function handleConfirm() {
    setError("");
    const result = await request();
    if (!result.ok) {
      setError(result.error?.message || "Antrag konnte nicht gespeichert werden.");
      return;
    }
    setConfirming(false);
  }

  return (
    <div style={SECTION_STYLE}>
      <div style={HEADING_STYLE}>Account löschen</div>
      <div
        style={{
          border: "1px solid rgba(224,115,107,.28)",
          borderRadius: "var(--radius, 12px)",
          padding: "16px 18px",
        }}
      >
        {isLoading && <p style={{ color: "var(--ink-3)", fontSize: ".8rem", margin: 0 }}>Lädt …</p>}

        {!isLoading && requestedAt && (
          <p style={{ fontFamily: "var(--font-mono)", fontSize: ".68rem", color: "var(--danger)", margin: 0 }}>
            Löschantrag gestellt am {fmtDate(requestedAt.slice(0, 10))} — wird manuell bearbeitet.
          </p>
        )}

        {!isLoading && !requestedAt && !confirming && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: ".68rem", color: "var(--ink-3)" }}>
              Löscht Account und alle Daten unwiderruflich.
            </span>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              style={{
                padding: "8px 18px",
                borderRadius: "var(--pill)",
                border: "1px solid var(--danger)",
                background: "transparent",
                color: "var(--danger)",
                fontSize: ".78rem",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              Account löschen
            </button>
          </div>
        )}

        {!isLoading && !requestedAt && confirming && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: ".68rem", color: "var(--danger)" }}>
              Bist du sicher? Das kann nicht rückgängig gemacht werden.
            </span>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                disabled={isPending}
                onClick={() => void handleConfirm()}
                style={{
                  padding: "8px 18px",
                  borderRadius: "var(--pill)",
                  border: "none",
                  background: "var(--danger)",
                  color: "#2a0d0a",
                  fontWeight: 600,
                  fontSize: ".78rem",
                  cursor: isPending ? "default" : "pointer",
                  opacity: isPending ? 0.7 : 1,
                }}
              >
                {isPending ? "Wird gestellt …" : "Ja, endgültig löschen"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                style={{
                  padding: "8px 18px",
                  borderRadius: "var(--pill)",
                  border: "1px solid var(--hair)",
                  background: "transparent",
                  color: "var(--ink-3)",
                  fontSize: ".78rem",
                  cursor: "pointer",
                }}
              >
                Abbrechen
              </button>
            </div>
          </div>
        )}

        {error && <div style={{ ...ERROR_STYLE, marginTop: 8 }}>{error}</div>}
      </div>
    </div>
  );
}

/* ============================================================
   FEATURES/SETTINGS/WAHOOSECTION.TSX — Wahoo verbinden/trennen
   (Fahrplan 19 B3, Entscheidungen 9 + 11)

   Nur für Admins und nicht im Demo-Stack gemountet (SettingsPage).
   „Mit Wahoo verbinden" holt die Authorize-URL von der admin-api und
   leitet selbst weiter; die Rückkehr kommt als ?wahoo=connected bzw.
   ?wahoo=error&reason=… zurück (wahoo-return.ts) und wird danach aus der
   Adresse entfernt.
   ============================================================ */

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useWahooConnect, useWahooDisconnect, useWahooStatus } from "../../api/hooks/useWahoo";
import { parseWahooReturn, WAHOO_RETURN_PARAMS } from "./wahoo-return";
import { SECTION_STYLE, SECTION_DESC_STYLE, LINK_BUTTON_STYLE, ERROR_STYLE, HEADING_STYLE } from "./section-styles";

const PRIMARY_BUTTON_STYLE = {
  alignSelf: "flex-start" as const,
  padding: "9px 18px",
  borderRadius: "var(--pill)",
  border: "none",
  background: "var(--ss)",
  color: "#17110a",
  fontWeight: 600,
};

const SECONDARY_BUTTON_STYLE = {
  padding: "9px 18px",
  borderRadius: "var(--pill)",
  border: "1px solid var(--hair)",
  background: "transparent",
  color: "var(--ink)",
  fontWeight: 600,
  cursor: "pointer",
};

const NOTE_STYLE = { margin: "8px 0 0", color: "var(--ink-3)", fontSize: ".78rem" };

export function WahooSection() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [notice] = useState(() => parseWahooReturn(searchParams));
  const [confirming, setConfirming] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { status, isLoading, error, notConfigured } = useWahooStatus();
  const { start, isPending: isStarting } = useWahooConnect();
  const { disconnect, isPending: isDisconnecting } = useWahooDisconnect();

  // Rückkehr-Parameter nach dem Lesen aus der Adresse nehmen.
  useEffect(() => {
    if (!WAHOO_RETURN_PARAMS.some((key) => searchParams.has(key))) return;
    const next = new URLSearchParams(searchParams);
    for (const key of WAHOO_RETURN_PARAMS) next.delete(key);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  async function handleConnect() {
    setActionError(null);
    const result = await start();
    if (!result.ok) {
      setActionError(
        result.error.code === "NOT_CONFIGURED"
          ? "Die Wahoo-Anbindung ist auf dem Server noch nicht eingerichtet."
          : "Verbinden konnte nicht gestartet werden. Bitte später noch einmal versuchen.",
      );
      return;
    }
    window.location.assign(result.url);
  }

  async function handleDisconnect() {
    setActionError(null);
    const result = await disconnect();
    setConfirming(false);
    if (!result.ok) setActionError("Trennen hat nicht geklappt. Bitte später noch einmal versuchen.");
  }

  const connected = !!status?.connected;
  const busy = isStarting || isDisconnecting;

  return (
    <div style={SECTION_STYLE}>
      <h3 style={HEADING_STYLE}>Wahoo</h3>
      <p style={SECTION_DESC_STYLE}>
        Verbindet dein Wahoo-Konto, damit der Sync deine Fahrten bei Wahoo lesen kann. Gelesen wird nur, geschrieben
        wird nichts.
      </p>

      {notice && (
        <p role="status" style={{ ...NOTE_STYLE, color: notice.kind === "error" ? "var(--danger)" : "var(--ok)" }}>
          {notice.message}
        </p>
      )}

      {isLoading ? (
        <p style={NOTE_STYLE}>Lädt …</p>
      ) : notConfigured ? (
        <p style={NOTE_STYLE}>Die Wahoo-Anbindung ist auf dem Server noch nicht eingerichtet.</p>
      ) : error ? (
        <p style={ERROR_STYLE}>Status konnte nicht geladen werden.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ margin: 0, color: "var(--ink)", fontSize: ".88rem" }}>
            Status: <strong>{connected ? "Verbunden" : "Nicht verbunden"}</strong>
          </p>

          {!connected && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleConnect()}
              style={{ ...PRIMARY_BUTTON_STYLE, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}
            >
              {isStarting ? "Lädt …" : "Mit Wahoo verbinden"}
            </button>
          )}

          {connected && !confirming && (
            <button type="button" disabled={busy} onClick={() => setConfirming(true)} style={SECONDARY_BUTTON_STYLE}>
              Trennen
            </button>
          )}

          {connected && confirming && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <p style={{ ...NOTE_STYLE, margin: 0 }}>
                Beim Trennen wird der Zugriff bei Wahoo entzogen. Die gespeicherten Wahoo-Daten werden beim nächsten
                Sync entfernt.
              </p>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleDisconnect()}
                  style={{ ...SECONDARY_BUTTON_STYLE, opacity: busy ? 0.7 : 1 }}
                >
                  {isDisconnecting ? "Lädt …" : "Ja, trennen"}
                </button>
                <button type="button" disabled={busy} onClick={() => setConfirming(false)} style={LINK_BUTTON_STYLE}>
                  Abbrechen
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {actionError && <p style={{ ...ERROR_STYLE, marginTop: 8 }}>{actionError}</p>}
    </div>
  );
}

import { useState } from "react";
import {
  useMfaFactors,
  useEnrollTotpFactor,
  useVerifyTotpFactor,
  useUnenrollTotpFactor,
} from "../../api/hooks/useMfaFactors";
import { ERROR_STYLE, HEADING_STYLE, INPUT_STYLE, SECTION_STYLE } from "./section-styles";

/** Einrichten/Verwalten eines TOTP-Faktors — bewusst NICHT scharf geschaltet:
 *  LoginPage.tsx fragt den Code (noch) nicht ab, s. Hinweistext unten und
 *  docs/offene-punkte.md. */
export function TwoFactorSection() {
  const { status, factorId, isLoading } = useMfaFactors();
  const { enroll, isPending: enrolling } = useEnrollTotpFactor();
  const { verify, isPending: verifying } = useVerifyTotpFactor();
  const { unenroll, isPending: unenrolling } = useUnenrollTotpFactor();

  const [pending, setPending] = useState<{ factorId: string; qrCodeSvg: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  async function handleEnroll() {
    setError("");
    const result = await enroll();
    if (!result.ok) {
      setError(result.error?.message || "Konnte nicht eingerichtet werden.");
      return;
    }
    setPending({ factorId: result.factorId, qrCodeSvg: result.qrCodeSvg, secret: result.secret });
  }

  async function handleVerify() {
    if (!pending) return;
    setError("");
    const result = await verify(pending.factorId, code.trim());
    if (!result.ok) {
      setError(result.error?.message || "Code ungültig.");
      return;
    }
    setPending(null);
    setCode("");
  }

  async function handleUnenroll() {
    if (!factorId) return;
    setError("");
    const result = await unenroll(factorId);
    if (!result.ok) setError(result.error?.message || "Konnte nicht deaktiviert werden.");
  }

  const qrDataUri = pending ? `data:image/svg+xml;utf-8,${encodeURIComponent(pending.qrCodeSvg)}` : null;

  return (
    <div style={SECTION_STYLE}>
      <div style={HEADING_STYLE}>Zwei-Faktor-Login</div>

      {isLoading && <p style={{ color: "var(--ink-3)", fontSize: ".8rem", margin: 0 }}>Lädt …</p>}

      {!isLoading && !pending && status === "none" && (
        <button
          type="button"
          disabled={enrolling}
          onClick={() => void handleEnroll()}
          style={{
            padding: "9px 18px",
            borderRadius: "var(--pill)",
            border: "none",
            background: "var(--ss)",
            color: "#17110a",
            fontWeight: 600,
            cursor: enrolling ? "default" : "pointer",
            opacity: enrolling ? 0.7 : 1,
          }}
        >
          {enrolling ? "Wird eingerichtet …" : "Zwei-Faktor-Login aktivieren"}
        </button>
      )}

      {!isLoading && !pending && status === "unverified" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: ".68rem", color: "var(--warn)" }}>
            Einrichtung unvollständig.
          </span>
          <button
            type="button"
            disabled={unenrolling}
            onClick={() => void handleUnenroll()}
            style={{
              padding: "8px 18px",
              borderRadius: "var(--pill)",
              border: "1px solid var(--hair)",
              background: "transparent",
              color: "var(--ink-3)",
              fontSize: ".78rem",
              cursor: unenrolling ? "default" : "pointer",
            }}
          >
            {unenrolling ? "Wird verworfen …" : "Erneut einrichten"}
          </button>
        </div>
      )}

      {!isLoading && !pending && status === "verified" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: ".68rem", color: "var(--ok)" }}>Aktiv</span>
          <button
            type="button"
            disabled={unenrolling}
            onClick={() => void handleUnenroll()}
            style={{
              padding: "8px 18px",
              borderRadius: "var(--pill)",
              border: "1px solid var(--hair)",
              background: "transparent",
              color: "var(--ink-3)",
              fontSize: ".78rem",
              cursor: unenrolling ? "default" : "pointer",
            }}
          >
            {unenrolling ? "Wird deaktiviert …" : "Deaktivieren"}
          </button>
        </div>
      )}

      {pending && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 280 }}>
          <img src={qrDataUri!} alt="QR-Code für die Authenticator-App" width={160} height={160} style={{ borderRadius: "var(--radius-sm)" }} />
          <div style={{ fontFamily: "var(--font-mono)", fontSize: ".62rem", color: "var(--ink-3)", wordBreak: "break-all" }}>
            Falls Scannen nicht geht: {pending.secret}
          </div>
          <input
            type="text"
            inputMode="numeric"
            placeholder="6-stelliger Code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={INPUT_STYLE}
          />
          <button
            type="button"
            disabled={verifying || code.trim().length === 0}
            onClick={() => void handleVerify()}
            style={{
              alignSelf: "flex-start",
              padding: "9px 18px",
              borderRadius: "var(--pill)",
              border: "none",
              background: "var(--ss)",
              color: "#17110a",
              fontWeight: 600,
              cursor: verifying ? "default" : "pointer",
              opacity: verifying ? 0.7 : 1,
            }}
          >
            {verifying ? "Bestätige …" : "Bestätigen"}
          </button>
        </div>
      )}

      {error && <div style={{ ...ERROR_STYLE, marginTop: 8 }}>{error}</div>}

      <p style={{ fontFamily: "var(--font-mono)", fontSize: ".62rem", color: "var(--ink-3)", margin: "12px 0 0" }}>
        Wird beim nächsten Login noch nicht abgefragt.
      </p>
    </div>
  );
}

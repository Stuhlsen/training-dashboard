import { useState, type CSSProperties, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../api/auth/useAuth";
import { GlassCard } from "../../components/GlassCard";

/* ============================================================
   FEATURES/AUTH/LOGINPAGE.TSX — Etappe 11g

   Bei der 11a-Live-Verifikation aufgefallen: die Seite sass ausserhalb von
   Layout/PageShell (eigene Route ohne Kopfzeile, App.tsx) und war deshalb
   komplett unstyled HTML. AppBackground bleibt bereits gemountet (App.tsx),
   hier nur die GlassCard + Formular-Optik ergaenzt — Label/Input/Error-Stil
   1:1 aus dem etablierten Muster (section-styles.ts/EventForm.tsx: jede
   Feature-Datei haelt ihre eigenen lokalen Stil-Konstanten, kein geteiltes
   Modul quer ueber Features).
   ============================================================ */

const LABEL_STYLE: CSSProperties = {
  display: "block",
  fontFamily: "var(--font-mono)",
  fontSize: ".62rem",
  textTransform: "uppercase",
  letterSpacing: ".06em",
  color: "var(--ink-3)",
  marginBottom: 4,
};

const INPUT_STYLE: CSSProperties = {
  background: "rgba(255,255,255,.04)",
  border: "1px solid var(--hair)",
  borderRadius: "var(--radius-sm)",
  padding: "9px 11px",
  color: "var(--ink)",
  font: "inherit",
  fontSize: ".9rem",
  width: "100%",
};

const ERROR_STYLE: CSSProperties = {
  color: "var(--danger)",
  fontFamily: "var(--font-mono)",
  fontSize: ".62rem",
};

export function LoginPage() {
  const { session, loading, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && session) return <Navigate to="/" replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await signIn(email, password);
    setSubmitting(false);
    if (!result.ok) setError(result.error.message);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <GlassCard variant="strong" radius="var(--radius-xl)" style={{ width: "100%", maxWidth: 380, padding: "36px 32px" }}>
        <h1
          style={{
            margin: "0 0 24px",
            fontFamily: "var(--font-disp)",
            fontSize: "1.6rem",
            fontWeight: 600,
            color: "var(--ink)",
            textAlign: "center",
          }}
        >
          Anmelden
        </h1>
        <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <label style={LABEL_STYLE}>
            E-Mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              style={{ ...INPUT_STYLE, marginTop: 4 }}
            />
          </label>
          <label style={LABEL_STYLE}>
            Passwort
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              style={{ ...INPUT_STYLE, marginTop: 4 }}
            />
          </label>
          {error && (
            <p role="alert" style={{ ...ERROR_STYLE, margin: 0 }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
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
              cursor: submitting ? "default" : "pointer",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? "Anmelden …" : "Anmelden"}
          </button>
        </form>
      </GlassCard>
    </div>
  );
}

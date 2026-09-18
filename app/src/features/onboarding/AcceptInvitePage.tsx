import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { GlassCard } from "../../components/GlassCard";
import { verifyInviteToken } from "../../api/supabase/auth";

/* ============================================================
   FEATURES/ONBOARDING/ACCEPTINVITEPAGE.TSX — Fahrplan 17 E7 V2,
   `type`-Parameter Fahrplan 18 E2/V2

   Ziel des selbst gebauten Einladungslinks (statt GoTrues `action_link`
   direkt, s. Kommentar in admin-api/invite.js). Ein Linkvorschau-Bot
   (Signal etc.) sieht hier nur stilles HTML — der Token-Hash wird erst
   eingelöst, wenn ein echter Browser diese Seite lädt UND ihr JS
   `verifyOtp()` ausführt (POST, kein GET-Seiteneffekt). Bei Erfolg baut
   Supabase die Session automatisch auf (AuthContext.tsx übernimmt sie über
   `onAuthChange`) — der Redirect nach `/` läuft danach direkt in
   OnboardingGate (has_password === false → Assistent).

   Derselbe Link-Mechanismus trägt seit Fahrplan 18 auch "Link erneut
   senden" für Accounts mit vergessenem Passwort — dort liefert admin-api
   `type: "recovery"` statt "invite" (s. admin-api/users.js::
   resendUserLink()), als `type`-Query-Parameter im Link kodiert.
   ============================================================ */

type Status = "pending" | "done" | "error";

export function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") === "recovery" ? "recovery" : "invite";
  const [status, setStatus] = useState<Status>(() => (tokenHash ? "pending" : "error"));
  const [error, setError] = useState(() => (tokenHash ? "" : "Kein gültiger Einladungslink."));

  useEffect(() => {
    if (!tokenHash) return;
    let cancelled = false;
    void verifyInviteToken(tokenHash, type).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setStatus("done");
      } else {
        setStatus("error");
        setError(result.error?.message || "Link ist ungültig oder abgelaufen.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [tokenHash, type]);

  if (status === "done") return <Navigate to="/" replace />;

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
      <GlassCard
        variant="strong"
        radius="var(--radius-xl)"
        style={{ width: "100%", maxWidth: 380, padding: "36px 32px", textAlign: "center" }}
      >
        {status === "pending" && <p style={{ margin: 0, color: "var(--ink-2)" }}>Einladung wird geprüft …</p>}
        {status === "error" && (
          <>
            <h1
              style={{
                margin: "0 0 12px",
                fontFamily: "var(--font-disp)",
                fontSize: "1.1rem",
                fontWeight: 600,
                color: "var(--ink)",
              }}
            >
              Link nicht gültig
            </h1>
            <p style={{ margin: 0, color: "var(--ink-3)", fontSize: ".82rem" }}>{error}</p>
          </>
        )}
      </GlassCard>
    </div>
  );
}

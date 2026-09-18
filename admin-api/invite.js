// V1 — ruft GoTrues Admin-Endpunkt /admin/generate_link (type=invite) auf
// (Bearer = Service-Role-Key) statt /invite: der lokale Stack hat kein SMTP
// konfiguriert (und die aktuelle Produktion auch nicht), /invite wuerde den
// Einladungslink also verschicken wollen und verwerfen. generate_link legt
// das Konto genauso an — Alex verschickt den daraus gebauten Link selbst
// (Signal/SMS), s. Grilling-Entscheidung Fahrplan 15 nach E3.
//
// V2 (18.09.2026, Vorfall admin-Invite/Tony): GoTrues eigener `action_link`
// zeigt direkt auf GoTrues `/verify` — ein einfacher GET dort verbraucht den
// Einmal-Code sofort, OHNE dass ein Mensch je draufklickt. Signals eigene
// Linkvorschau (ruft die URL beim Versenden selbst ab, um die Vorschau-Karte
// zu bauen) hat genau das ausgeloest: Link war "otp_expired", bevor Tony ihn
// ueberhaupt gesehen hat. Fix: statt `action_link` liefert dieser Endpunkt
// `hashedToken` — der App-eigene Link (gebaut in InviteAthleteSection.tsx)
// zeigt auf UNSERE eigene Onboarding-Seite. Ein Vorschau-Bot ruft dort nur
// stilles HTML ab (kein JS-Effekt); der Code wird erst eingeloest, wenn ein
// echter Browser `supabase.auth.verifyOtp({ token_hash, type })` ausfuehrt
// (POST, kein passiver GET) — empirisch gegengeprueft: derselbe token_hash
// laesst sich nur genau einmal per POST einloesen (zweiter Versuch -> 403).
// Fehlerverhalten unveraendert: bereits bestaetigte Adresse -> 422
// email_exists (unser 409), leere/fehlende E-Mail -> 400.
async function sendInvite(email, env, fetchImpl = fetch) {
  let res;
  try {
    res = await fetchImpl(`${env.GOTRUE_INTERNAL_URL}/admin/generate_link`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: "invite", email }),
    });
  } catch {
    return { ok: false, status: 502, error: { code: "NETWORK", message: "GoTrue nicht erreichbar" } };
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    // body bleibt null — GoTrue liefert im Fehlerfall normalerweise JSON,
    // ein leerer/kaputter Body degradiert nur die Fehlermeldung, nicht den Status.
  }

  if (res.ok) {
    return { ok: true, hashedToken: body?.hashed_token ?? null };
  }

  if (res.status === 422 && body?.error_code === "email_exists") {
    return {
      ok: false,
      status: 409,
      error: { code: "HTTP", message: body?.msg ?? "E-Mail bereits registriert" },
    };
  }

  if (res.status === 400) {
    return {
      ok: false,
      status: 400,
      error: { code: "SCHEMA", message: body?.msg ?? "ungueltige E-Mail" },
    };
  }

  return { ok: false, status: 502, error: { code: "NETWORK", message: "GoTrue-Fehler" } };
}

module.exports = { sendInvite };

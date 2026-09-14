// V1 — ruft GoTrues Admin-Endpunkt /invite auf (Bearer = Service-Role-Key)
// und bildet dessen Antwort auf unsere eigenen Statuscodes ab. Empirisch
// geprueft (Fahrplan 15, E3) gegen den lokalen Self-Host-Stack ohne SMTP:
// GoTrue verschickt dann zwar keine E-Mail, quittiert den Request aber
// trotzdem mit 200 — kein Sonderfall fuer fehlendes SMTP noetig. Erneutes
// Einladen einer noch unbestaetigten Adresse ist bei GoTrue selbst schon
// idempotent (200, erneuert nur den Token) — nur eine bereits BESTAETIGTE
// Adresse liefert 422 "email_exists", das bilden wir auf 409 ab (V1).
async function sendInvite(email, env, fetchImpl = fetch) {
  let res;
  try {
    res = await fetchImpl(`${env.GOTRUE_INTERNAL_URL}/invite`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });
  } catch {
    return { ok: false, status: 502, error: { code: "NETWORK", message: "GoTrue nicht erreichbar" } };
  }

  if (res.ok) {
    return { ok: true };
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    // body bleibt null — GoTrue liefert im Fehlerfall normalerweise JSON,
    // ein leerer/kaputter Body degradiert nur die Fehlermeldung, nicht den Status.
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

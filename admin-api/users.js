// Fahrplan 18 E1 — Admin-Nutzerverwaltung. Ersetzt admin-api/athletes.js:
// listUsers() liefert jetzt alle Rollen (vorher role=eq.athlete-Filter),
// zusaetzlich role/isAdmin/bannedUntil je Zeile. Neu dazu: banUser/
// unbanUser/deleteUser/resendUserLink, jede schreibt eine
// admin_audit_log-Zeile (Migration 0044).

async function fetchJson(url, env, fetchImpl, label, init = {}) {
  let res;
  try {
    res = await fetchImpl(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new Error(`${label} nicht erreichbar`);
  }
  if (!res.ok) {
    throw new Error(`${label} antwortete mit ${res.status}`);
  }
  return res.json();
}

// Zeilen sind absteigend nach updated_at sortiert — der erste Treffer je
// Besitzer-Spalte ist damit schon der jüngste.
function latestPerOwner(rows, ownerColumn, area) {
  const result = new Map();
  for (const row of rows) {
    const owner = row[ownerColumn];
    if (owner && !result.has(owner)) {
      result.set(owner, { updatedAt: row.updated_at, area });
    }
  }
  return result;
}

function pickLatest(candidates) {
  let best = null;
  for (const candidate of candidates) {
    if (candidate && (!best || new Date(candidate.updatedAt) > new Date(best.updatedAt))) {
      best = candidate;
    }
  }
  return best;
}

async function listUsers(env, fetchImpl = fetch) {
  let usersBody;
  let profiles;
  let planCardRows;
  let syncConfigRows;
  try {
    [usersBody, profiles, planCardRows, syncConfigRows] = await Promise.all([
      fetchJson(`${env.GOTRUE_INTERNAL_URL}/admin/users`, env, fetchImpl, "GoTrue"),
      fetchJson(
        `${env.POSTGREST_INTERNAL_URL}/profiles?select=id,display_name,has_password,role,is_admin,updated_at`,
        env,
        fetchImpl,
        "PostgREST"
      ),
      fetchJson(
        `${env.POSTGREST_INTERNAL_URL}/plan_cards?select=athlete_id,updated_at&order=updated_at.desc`,
        env,
        fetchImpl,
        "PostgREST"
      ),
      fetchJson(
        `${env.POSTGREST_INTERNAL_URL}/athlete_sync_config?select=profile_id,updated_at&order=updated_at.desc`,
        env,
        fetchImpl,
        "PostgREST"
      ),
    ]);
  } catch (err) {
    return { ok: false, status: 502, error: { code: "NETWORK", message: err.message } };
  }

  const usersById = new Map(
    (Array.isArray(usersBody?.users) ? usersBody.users : []).map((user) => [user.id, user])
  );
  const planCardLatest = latestPerOwner(planCardRows, "athlete_id", "Trainingsplan");
  const syncConfigLatest = latestPerOwner(syncConfigRows, "profile_id", "Sync-Einstellungen");

  const users = profiles.map((profile) => {
    const user = usersById.get(profile.id) ?? null;
    const latest = pickLatest([
      { updatedAt: profile.updated_at, area: "Profil" },
      planCardLatest.get(profile.id) ?? null,
      syncConfigLatest.get(profile.id) ?? null,
    ]);
    return {
      id: profile.id,
      email: user?.email ?? null,
      displayName: profile.display_name ?? null,
      role: profile.role,
      isAdmin: profile.is_admin === true,
      hasPassword: profile.has_password === true,
      bannedUntil: user?.banned_until ?? null,
      lastSignInAt: user?.last_sign_in_at ?? null,
      lastChangedAt: latest?.updatedAt ?? null,
      lastChangedArea: latest?.area ?? null,
    };
  });

  return { ok: true, users };
}

// Audit-Log-Schreibfehler sollen die eigentliche Aktion nicht rueckgaengig
// machen (Konto ist zu diesem Zeitpunkt bereits gesperrt/entsperrt/
// geloescht) — analog zum best-effort Profil-PATCH in invite.js.
async function writeAuditLog(env, fetchImpl, { actorId, targetUserId, targetEmail, action, details }) {
  try {
    await fetchImpl(`${env.POSTGREST_INTERNAL_URL}/admin_audit_log`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        actor_id: actorId,
        target_user_id: targetUserId,
        target_email: targetEmail ?? null,
        action,
        details: details ?? null,
      }),
    });
  } catch {
    // s. Kommentar oben
  }
}

// ban_duration ist GoTrues eigener Admin-Update-Parameter: ein Duration-
// String setzt banned_until = now()+Duration, "none" hebt eine Sperre wieder
// auf. ~100 Jahre ist praktisch dauerhaft, ohne ein eigenes Dauer-Feld zu
// brauchen (s. Fahrplan 18 Nicht-Ziele).
async function banUser(userId, actorId, env, fetchImpl = fetch) {
  let res;
  try {
    res = await fetchImpl(`${env.GOTRUE_INTERNAL_URL}/admin/users/${userId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ban_duration: "876000h" }),
    });
  } catch {
    return { ok: false, status: 502, error: { code: "NETWORK", message: "GoTrue nicht erreichbar" } };
  }
  if (!res.ok) {
    return { ok: false, status: 502, error: { code: "NETWORK", message: "GoTrue-Fehler" } };
  }
  await writeAuditLog(env, fetchImpl, { actorId, targetUserId: userId, action: "ban" });
  return { ok: true };
}

async function unbanUser(userId, actorId, env, fetchImpl = fetch) {
  let res;
  try {
    res = await fetchImpl(`${env.GOTRUE_INTERNAL_URL}/admin/users/${userId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ban_duration: "none" }),
    });
  } catch {
    return { ok: false, status: 502, error: { code: "NETWORK", message: "GoTrue nicht erreichbar" } };
  }
  if (!res.ok) {
    return { ok: false, status: 502, error: { code: "NETWORK", message: "GoTrue-Fehler" } };
  }
  await writeAuditLog(env, fetchImpl, { actorId, targetUserId: userId, action: "unban" });
  return { ok: true };
}

// confirmEmail wird serverseitig geprueft (nicht nur clientseitig) — sonst
// ist die Bestaetigung nur Show. Trim + case-insensitiv, wie bei einer
// "tippe die E-Mail zur Bestaetigung"-Eingabe ueblich.
async function deleteUser(userId, confirmEmail, actorId, env, fetchImpl = fetch) {
  let userBody;
  try {
    userBody = await fetchJson(`${env.GOTRUE_INTERNAL_URL}/admin/users/${userId}`, env, fetchImpl, "GoTrue");
  } catch (err) {
    return { ok: false, status: 502, error: { code: "NETWORK", message: err.message } };
  }
  const email = userBody?.email ?? null;
  const confirmed = typeof confirmEmail === "string" ? confirmEmail.trim().toLowerCase() : "";
  if (!email || !confirmed || confirmed !== email.trim().toLowerCase()) {
    return { ok: false, status: 400, error: { code: "SCHEMA", message: "E-Mail stimmt nicht ueberein" } };
  }

  // Nur fuers Audit-Log — ein Fehler hier soll das Loeschen selbst nicht
  // blockieren, das Konto existiert nachweislich (s. GoTrue-Fetch oben).
  let profileRows = [];
  try {
    profileRows = await fetchJson(
      `${env.POSTGREST_INTERNAL_URL}/profiles?id=eq.${userId}&select=display_name,role,is_admin`,
      env,
      fetchImpl,
      "PostgREST"
    );
  } catch {
    // s. Kommentar oben
  }

  let res;
  try {
    res = await fetchImpl(`${env.GOTRUE_INTERNAL_URL}/admin/users/${userId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
    });
  } catch {
    return { ok: false, status: 502, error: { code: "NETWORK", message: "GoTrue nicht erreichbar" } };
  }

  if (!res.ok) {
    let body = null;
    try {
      body = await res.json();
    } catch {
      // body bleibt null
    }
    return {
      ok: false,
      status: 409,
      error: { code: "HTTP", message: body?.msg ?? "Loeschen fehlgeschlagen (verknuepfte Daten?)" },
    };
  }

  await writeAuditLog(env, fetchImpl, {
    actorId,
    targetUserId: userId,
    targetEmail: email,
    action: "delete",
    details: profileRows[0] ?? null,
  });
  return { ok: true };
}

// Ein Weg fuer zwei Faelle: has_password === false -> Reste-Invite,
// has_password === true -> vergessenes Passwort. GEGEN GOTRUE ist das
// IMMER ein "recovery"-generate_link, nicht "invite" (live gegen den
// lokalen Self-Host-Stack gefunden, Fahrplan 18 E2-Verifikation): GoTrues
// "invite" generate_link scheitert mit 422 email_exists fuer JEDEN
// bereits existierenden Nutzer, unabhaengig vom Passwort-Status (dasselbe
// Verhalten, das invite.js::sendInvite() fuer eine neue Einladung an eine
// bereits registrierte Adresse absichtlich als 409 durchreicht) — ein
// "Link erneut senden" adressiert per Definition einen bereits
// existierenden Account, "invite" waere also nie erfolgreich. "recovery"
// funktioniert auf jedem existierenden Account unabhaengig vom Passwort-
// Status. `type` im Rueckgabewert (geht als URL-Parameter in
// verifyInviteToken() ein) muss deshalb ebenfalls durchgehend "recovery"
// sein — er muss zum tatsaechlich von GoTrue signierten OTP-Typ passen,
// sonst schlaegt verifyOtp() fehl. Die Audit-Log-Aktion bleibt trotzdem
// nach has_password unterschieden (resend_invite/resend_recovery) — rein
// informativ, warum der Link erneut verschickt wurde.
async function resendUserLink(userId, actorId, env, fetchImpl = fetch) {
  let profileRows;
  try {
    profileRows = await fetchJson(
      `${env.POSTGREST_INTERNAL_URL}/profiles?id=eq.${userId}&select=has_password`,
      env,
      fetchImpl,
      "PostgREST"
    );
  } catch (err) {
    return { ok: false, status: 502, error: { code: "NETWORK", message: err.message } };
  }
  const hasPassword = Array.isArray(profileRows) && profileRows[0]?.has_password === true;

  let userBody;
  try {
    userBody = await fetchJson(`${env.GOTRUE_INTERNAL_URL}/admin/users/${userId}`, env, fetchImpl, "GoTrue");
  } catch (err) {
    return { ok: false, status: 502, error: { code: "NETWORK", message: err.message } };
  }
  const email = userBody?.email ?? null;
  if (!email) {
    return { ok: false, status: 404, error: { code: "NO_DATA", message: "Nutzer nicht gefunden" } };
  }

  const type = "recovery";
  let res;
  try {
    res = await fetchImpl(`${env.GOTRUE_INTERNAL_URL}/admin/generate_link`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type, email }),
    });
  } catch {
    return { ok: false, status: 502, error: { code: "NETWORK", message: "GoTrue nicht erreichbar" } };
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    // body bleibt null
  }
  if (!res.ok) {
    return { ok: false, status: 502, error: { code: "NETWORK", message: body?.msg ?? "GoTrue-Fehler" } };
  }

  const action = hasPassword ? "resend_recovery" : "resend_invite";
  await writeAuditLog(env, fetchImpl, {
    actorId,
    targetUserId: userId,
    targetEmail: email,
    action,
    details: { type },
  });
  return { ok: true, hashedToken: body?.hashed_token ?? null, type };
}

module.exports = { listUsers, banUser, unbanUser, deleteUser, resendUserLink };

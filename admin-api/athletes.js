// V4 — Admin-Athletenübersicht: GoTrue liefert E-Mail + last_sign_in_at je
// User, profiles (service_role, RLS-Bypass) liefert has_password/
// display_name/updated_at. "Zuletzt geändert" ist der jüngste updated_at
// über profiles + die beiden Athleten-Tabellen mit eigenem
// updated_at-Trigger (plan_cards, athlete_sync_config), grob gelabelt.

async function fetchJson(url, env, fetchImpl, label) {
  let res;
  try {
    res = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
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

async function listAthletes(env, fetchImpl = fetch) {
  let usersBody;
  let profiles;
  let planCardRows;
  let syncConfigRows;
  try {
    [usersBody, profiles, planCardRows, syncConfigRows] = await Promise.all([
      fetchJson(`${env.GOTRUE_INTERNAL_URL}/admin/users`, env, fetchImpl, "GoTrue"),
      fetchJson(
        `${env.POSTGREST_INTERNAL_URL}/profiles?select=id,display_name,has_password,updated_at&role=eq.athlete`,
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

  const athletes = profiles.map((profile) => {
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
      hasPassword: profile.has_password === true,
      lastSignInAt: user?.last_sign_in_at ?? null,
      lastChangedAt: latest?.updatedAt ?? null,
      lastChangedArea: latest?.area ?? null,
    };
  });

  return { ok: true, athletes };
}

module.exports = { listAthletes };

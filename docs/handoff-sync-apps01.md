# Handoff — sync container on apps01 (Issue #31)

**Stand:** 2026-08-29
**Zielablage:** `docs/handoff-sync-apps01.md`
**Für:** Tony (apps01 / rootless Podman + systemd Quadlet)
**Kontext im Repo:** `docs/fahrplan-3-sync-produktivbetrieb.md` Fenster B,
GitHub Issue #31. Der Env-lose Folgeumbau (Env schrumpft auf zwei Werte)
steht in `docs/fahrplan-7-sync-credentials-self-service.md` und braucht
Tony erst später (dortiges Fenster CRED5).

---

## What you're setting up

The full sync job runs on apps01 as an always-on container. It generates
`data/*.json` and writes them into the same host directory the frontend
container already reads. The old fetch-timer + one-shot setup gets retired
once this is confirmed working.

## Image

- `ghcr.io/stuhlsen/training-dashboard-sync`
- Use a **pinned version tag** (`v1.x.x`), not `:latest` — same pattern as
  the frontend image. New versions are published to GHCR on each `v*` tag.
- Only `frontend` and `sync` come from our GHCR. Postgres / GoTrue /
  PostgREST / Caddy stay on your own registry pulls as before.

## Quadlet unit

- Plain always-running container (`Restart=on-failure` or your standard).
  The entrypoint loops internally on `SYNC_INTERVAL_HOURS` (default `6`) —
  no timer, no one-shot.
- Publishes **no ports**.
- Set resource limits (memory + CPU) so it can't crowd the host.
- Host restart must bring it back on its own.

## Volume

- Mount the **existing** host `data/` directory — the one the frontend
  container mounts read-only at `/usr/share/nginx/html/data:ro`, the same
  one the current fetch-timer writes into.
- Mount it **read-write** into the sync container at `/sync/data`
  (matches its `WORKDIR /sync`).
- No new volume layout. Same path, the writer just changes.
- `data/interval-blocks.json` lives in that same directory and must survive
  restarts (it's a cache — losing it forces 150+ API calls on the next
  run). Covered automatically by the same mount.

## File permissions

- The frontend container runs nginx as a **non-root** user (`uid 1001`).
  The files the sync writes must be **readable by that user**.
- Match the sync container's write UID/GID to what the frontend can read,
  or set a umask that leaves world-read on the files.

## Env file

- One env file referenced by the Quadlet unit, permissions `600`.
- Contents: Alex sends the values privately (already prepared). The keys:
  ```
  NOTION_API_KEY            NOTION_DATABASE_ID
  INTERVALS_API_KEY         INTERVALS_ATHLETE_ID
  INTERVALS_API_KEY_2       INTERVALS_ATHLETE_ID_2
  WEATHER_LAT               WEATHER_LON
  WEATHER_LAT_2             WEATHER_LON_2
  WEATHER_LAT_4             WEATHER_LON_4
  SUPABASE_URL              SUPABASE_ANON_KEY
  SUPABASE_ATHLETE1_EMAIL   SUPABASE_ATHLETE1_PASSWORD
  SUPABASE_ATHLETE4_EMAIL   SUPABASE_ATHLETE4_PASSWORD
  ```
- Optional: `SYNC_INTERVAL_HOURS` (leave unset for the 6h default).
- Heads-up: a later change on our side will shrink this list to just
  `SUPABASE_URL` + one service-role key. Don't build tooling around the
  long list — a plain env file is fine.

## Bring-up

1. Start the container.
2. Watch the first run (`podman logs` / `journalctl -u …`): it logs a
   timestamp, activity count per athlete, duration, errors.
3. Check the `data/` directory: `rides*.json` / `wellbeing*.json` etc.
   have current timestamps.
4. Open `https://training-dashboard.clear-solutions-it.com` — data should
   be current (check the latest ride date / count).
5. An aborted run must leave the previous files intact (atomic
   write-then-rename — already tested on our side, just confirm prod uses
   the same image).
6. Once steady: retire the old fetch-timer + one-shot.

## Confirm back to Alex

- [ ] Sync container running on apps01, first real run completed clean
- [ ] Frontend serves data from the shared dir, not the old tarball poll
- [ ] No port / name collision with other apps on the host
- [ ] Host restart brings the stack back automatically

---

## After Tony confirms — Alex's side (not Tony's)

Tracked in `docs/fahrplan-3-sync-produktivbetrieb.md` Fenster C + D:

- Disable `sync-data.yml` (reduce to `workflow_dispatch`, do **not**
  delete — fallback).
- Remove `data/*.json` from version control, add to `.gitignore`.
- Observe one full 6h cycle before closing anything.
- Update `AGENTS.md` + `docs/offene-punkte.md`, tick the DKR2 checklist,
  close Issue #31.
- Check whether `SYNC_PUSH_TOKEN` is still needed anywhere.

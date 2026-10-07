# `admin-api/` — Admin-Accountverwaltung (Runbook)

Schlanker Node.js-HTTP-Server ohne Framework (`server.js`). Prüft Admin-Rechte
gegen PostgREST/GoTrue (`auth.js`) und kapselt Invite/Ban/Delete-Operationen,
die ein normaler `anon`/`authenticated`-Client nicht darf. Repo-weite
Struktur-Übersicht: `AGENTS.md`. Dieses Dokument ist das operative
Gegenstück — Env-Vertrag, Routing, Mail-Verhalten — für den Abgleich gegen
die apps01-Ansible-Rolle.

## Env-Vertrag

| Variable | Zweck | apps01/lokale Compose-Quelle |
|---|---|---|
| `PORT` | Listen-Port (intern, kein Host-Mapping) | fest `3001` |
| `JWT_SECRET` | prüft eingehende Bearer-Tokens (HS256, GoTrue-Format) selbst nach, ohne Rückfrage an GoTrue | dasselbe Secret wie `gotrue`/`postgrest` |
| `POSTGREST_INTERNAL_URL` | interner PostgREST-Host für den Admin-Check (`profiles_visible.is_admin`) und Profile-Patches | `http://postgrest:3000` (Container-Netz) |
| `GOTRUE_INTERNAL_URL` | interner GoTrue-Host für `/admin/generate_link`, `/admin/users/*` | `http://gotrue:8081` (Container-Netz) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-Role-JWT gegen GoTrue/PostgREST | **eigene, lokal signierte Variable** — lokal `SELFHOST_SERVICE_ROLE_KEY` (per `scripts/generate-jwt-keys.js` erzeugt), NICHT die `SUPABASE_SERVICE_ROLE_KEY` aus der Root-`.env` (die gehört dem Cloud-Projekt `dashboard-dev`) |
| `SUPER_ADMIN_ID` | user ID des einzigen Admins, der weitere Admins anlegen darf (opt-in: leer/fehlend → jeder Admin darf) | apps01-Ansible-Rolle muss den Wert explizit setzen; lokal `${SUPER_ADMIN_ID}` aus `.env` |

Kein `ports:`-Mapping auf dem Container — von außen ausschließlich über den
Proxy erreichbar (wie `postgres`/`storage-api`).

## Routing (Caddy)

`/admin/*` wird 1:1 an `admin-api:3001` durchgereicht — **kein**
Prefix-Strip, anders als `/auth/v1/*` und `/rest/v1/*`:

```
handle /admin/* {
    reverse_proxy admin-api:3001
}
```

Lokale Referenz: `Caddyfile.local` (Root-Repo). Beim Abgleich gegen die
apps01-Ansible-Rolle prüfen, dass dort ebenfalls kein Prefix-Strip passiert —
die Endpunkte im Server erwarten den vollen `/admin/...`-Pfad in `req.url`.

## Endpunkte

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/admin/health` | Healthcheck, kein Auth |
| POST | `/admin/invite` | legt Account an (Verhalten s. unten), Body `{ email, role?, isAdmin? }` |
| GET | `/admin/users` | Nutzerliste |
| POST | `/admin/users/:id/ban` \| `/unban` \| `/resend` | Account-Aktionen |
| DELETE | `/admin/users/:id` | Account löschen, Body `{ confirmEmail }` |

Alle Endpunkte außer `/admin/health` verlangen `Authorization: Bearer <JWT>`
und prüfen `profiles_visible.is_admin`.

## SMTP-Entscheidung: keine E-Mail, nur Link

Weder lokal noch auf apps01 ist SMTP konfiguriert. `/admin/invite` ruft
deshalb GoTrues `/admin/generate_link` (nicht `/invite`) auf und liefert im
Response-Body nur `hashedToken` zurück — **es wird keine E-Mail verschickt**.
Das Frontend (`InviteAthleteSection.tsx`) baut daraus selbst die volle
Onboarding-URL (`<frontend-origin>/app/onboarding/accept?token_hash=...`) und
zeigt sie zum manuellen Versand (Signal/SMS) an.

Zwei Gründe, keine Zwischenlösung:

1. Ohne SMTP würde `/invite` den Link ohnehin nur verschicken wollen und
   verwerfen.
2. GoTrues eigener `action_link` zeigt direkt auf `/verify` — ein einfacher
   GET dort (z. B. durch die Linkvorschau eines Messengers) verbraucht den
   Code sofort, bevor ein Mensch klickt (Vorfall 18.09.2026, s.
   Kopfkommentar `invite.js`). Der selbstgebaute Link zeigt stattdessen auf
   die eigene Onboarding-Seite, die den Code erst per `verifyOtp()` (POST)
   einlöst.

Für den Deployment-Abgleich: **kein SMTP-Relay in der apps01-Ansible-Rolle
einplanen** — admin-api braucht keins.

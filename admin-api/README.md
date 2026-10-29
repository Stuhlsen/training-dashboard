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
| `SUPER_ADMIN_ID` | user ID(s) der Admins, die weitere Admins anlegen dürfen — mehrere kommagetrennt (`id1,id2`), eine einzelne ID bleibt gültig (opt-in: leer/fehlend → jeder Admin darf) | apps01-Ansible-Rolle muss den Wert explizit setzen; lokal `${SUPER_ADMIN_ID}` aus `.env` |
| `WAHOO_CLIENT_ID` | Client-ID der Wahoo-Cloud-API-App (Fahrplan 19) — optional | Wahoo Developer-Portal; `docker-compose.selfhost.yml` reicht sie leer/optional durch, der Demo-Stack setzt sie fest leer |
| `WAHOO_CLIENT_SECRET` | Client-Secret derselben App; signiert zugleich den OAuth-`state` — optional, **nie ins Frontend** | wie oben |
| `WAHOO_REDIRECT_URI` | Rückkehr-Adresse, **identisch** zur Eintragung im Wahoo-Portal, z. B. `https://training-dashboard.clear-solutions-it.com/api/wahoo/callback` — optional | wie oben |
| `WAHOO_RETURN_URL` | Ziel nach dem Verbinden (`?wahoo=connected` bzw. `?wahoo=error&reason=…`) — optional, Standard: Ursprung von `WAHOO_REDIRECT_URI` + `/app/settings` | wie oben |

Fehlt eine der drei Pflichtwerte (`WAHOO_CLIENT_ID`, `WAHOO_CLIENT_SECRET`, `WAHOO_REDIRECT_URI`), startet die
admin-api normal und `/api/wahoo/*` antwortet `503`.

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

Seit Fahrplan 25 S1a kommen zwei weitere Pfade dazu, ebenfalls ohne Prefix-Strip:

```
handle /api/recipes* {
    reverse_proxy admin-api:3001
}
handle /api/ingredients* {
    reverse_proxy admin-api:3001
}
```

Seit S1b kommt eine dritte Regel dazu (`/api/ingredients*` trifft `/api/ingredient-requests`
**nicht**, der Pfad braucht eine eigene Zeile):

```
handle /api/ingredient-requests* {
    reverse_proxy admin-api:3001
}
```

**Hinweis für Tony (S1a):** neues `admin-api`-Image deployen und die zwei Caddy-Regeln
eintragen. Keine Migration, keine neuen Env-Variablen.

**Hinweis für Tony (S1b):** zuerst die Migrationen `0069` und `0070` einspielen (dbmate,
beide idempotent), dann das neue `admin-api`-Image deployen und die Caddy-Regel
`/api/ingredient-requests*` eintragen. Keine neuen Env-Variablen. Abnahmetest:
`POST /api/ingredient-requests` ohne Token muss `401` liefern.

Seit Fahrplan 19 B2 kommt eine vierte Regel dazu, ebenfalls ohne Prefix-Strip (`/api/wahoo/callback`
wird per Browser-Redirect von Wahoo aufgerufen, nicht vom Frontend):

```
handle /api/wahoo* {
    reverse_proxy admin-api:3001
}
```

**Hinweis für Tony (F19 B2):** Caddy-Regel `/api/wahoo*` eintragen und die vier `WAHOO_*`-Variablen an den
`admin-api`-Container geben. Keine Migration (die Tabelle `athlete_wahoo_tokens` kam mit `0080`). Abnahmetest:
`POST /api/wahoo/start` ohne Token muss `401` liefern.

**Vorgeschaltetes haproxy (apps01):** Dort muss `/api` ebenfalls in der ACL stehen,
sonst landet `/api/*` im Frontend (SPA) statt bei `admin-api` — Caddy sieht die
Anfrage dann gar nicht. Abnahmetest: `GET /api/ingredients?q=hafer` ohne Token
muss `401` liefern (nicht `404`, nicht die Landingpage).

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
| POST | `/admin/users/:id/verify-author` \| `/unverify-author` | Verifizierten Autor setzen/entziehen (Fahrplan 29), Antwort `{ ok, isVerifiedAuthor }` |
| POST | `/admin/recipes/:id/approve` \| `/reject` | Rezept in Prüfung freigeben oder ablehnen (Fahrplan 30 B4). `reject` braucht Body `{ reason }` (1–500 Zeichen), `approve` ignoriert den Body. Audit-Eintrag (`approve_recipe`/`reject_recipe`) VOR der Änderung; nur Rezepte mit `status = pending` (sonst 409). Antwort `{ ok, status }` |
| DELETE | `/admin/recipe-comments/:id` | Kommentar zu einem Rezept löschen (Fahrplan 30 B5). Audit-Eintrag `delete_recipe_comment` (nur IDs, nie der Text) VOR dem Löschen; entfernt per cascade auch die Daumen auf den Kommentar. Der Schreiber löscht den eigenen Kommentar selbst per RLS. Antwort `{ ok }`, unbekannte ID 404 |
| DELETE | `/admin/users/:id` | Account löschen, Body `{ confirmEmail }` |

Alle Endpunkte außer `/admin/health` verlangen `Authorization: Bearer <JWT>`
und prüfen `profiles_visible.is_admin`.

### Rezept-Einreichung (`/api/*`, Fahrplan 25 S1a/S1b)

Gültiges JWT (HS256, `aud`/`role` = `authenticated`) genügt, **Admin ist nicht nötig**.
Der Dienst schreibt mit der Service-Rolle (`source=athlete`, `status=pending`,
`submitted_by` = JWT-`sub`, `external_id` = `athlete-<uuid>`). Nährwerte, `contains_tags`
und `diet_tags` werden **abgeleitet**, nie vom Client übernommen.

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/ingredients?q=` | Zutaten-Suche (höchstens 20 Treffer, Groß/Klein und Umlaute egal), liefert Name, Kategorie, Einheiten |
| POST | `/api/recipes/preview` | prüft und rechnet wie Einreichen, speichert nichts; liefert `nutrition`, `contains_tags`, `diet_tags`, `ingredients` (mit Kategorie) |
| POST | `/api/recipes` | einreichen (201, `{ ok, recipe }`) |
| PUT | `/api/recipes/:id` | eigenes `pending`-Rezept ersetzen (200, `{ ok, recipe }`); prüft und leitet wie POST ab, löscht **alle** Stimmen zum Rezept (S1-10) |
| DELETE | `/api/recipes/:id` | eigenes `pending`-Rezept zurückziehen (Stimmen gehen per `ON DELETE CASCADE` mit) |
| POST | `/api/ingredient-requests` | Zutaten-Wunsch, Body `{ name, note? }` (201, `{ ok, request }`) |

`PUT` braucht Migration `0069`: der Trigger `recipes_check_content_update` (0062) lehnte
Inhaltsänderungen ab, wenn `auth.uid()` nicht der Einreicher ist — der Service-Key hat kein
`sub`. `0069` nimmt nur diese Einreicher-Prüfung für `service_role` aus; die Regel „Inhalt nur
bei `pending`“ gilt weiter für alle Rollen. `POST /api/ingredient-requests` braucht `0070`
(Tabelle `ingredient_requests`: Admin liest alle, Athlet nur die eigenen, kein UPDATE/DELETE
für `authenticated`).

Fehler bei `PUT`: `404 NO_DATA` für fremdes oder fehlendes Rezept (nichts über andere
verraten), `409 VALIDATION` wenn nicht mehr `pending` (auch wenn der Admin zwischen Prüfen und
Schreiben entscheidet), `422 VALIDATION` mit `details` je Feld. Die Stimmen werden erst **nach**
dem erfolgreichen Schreiben gelöscht; scheitert das Löschen, ist der Inhalt neu und ein
erneutes `PUT` räumt sie ab. Die direkte RLS-Sperre für Athleten-Writes auf `recipes` ist
bewusst **nicht** Teil von S1b (Entscheidung S1-12, kommt nach S2).

Wünsche: `name` 1 bis 100 Zeichen, `note` optional bis 300 (leer wird `null`), höchstens 20
Wünsche je Athlet (409 `VALIDATION`, `details.requests`; zusätzlich harter Trigger in der DB).
`requested_by` kommt immer aus dem JWT, nie aus dem Body.

Body für preview/POST/PUT: `{ title, meal_type[], servings, prep_minutes, ingredients: [{ name, amount, unit }],
instructions: [{ text, timerSeconds? }], image_url? }`. Grenzen: höchstens 5 offene Rezepte
je Athlet, 30 Zutaten, 20 Schritte, Titel 100, Schritt 500 Zeichen. `image_url` ist ein
Storage-Pfad `<JWT-sub>/<datei>` im Bucket `recipe-images`. Unbekannte Zutat oder Einheit
ist ein Fehler, kein Raten.
`prep_minutes` (aktive Zubereitungszeit ohne Wartezeit, ganze Minuten 1 bis 600) ist bei POST und PUT Pflicht, auch
für verifizierte Autoren; die Vorschau rechnet ohne Zeit und ignoriert einen mitgeschickten Wert.

Fehler: `{ ok: false, error: { code, message } }`; Formularfehler (HTTP 422, bei zu vielen
offenen Rezepten 409) haben Code `VALIDATION` und `error.details` je Feld
(`{ feld: [meldung, …] }`).

### Wahoo-Anbindung (`/api/wahoo/*`, Fahrplan 19 B2)

Verbindet einen Athleten per OAuth2 mit der Wahoo Cloud API (Scopes `user_read workouts_read`). Die
Tokens landen in `athlete_wahoo_tokens` (nur `service_role`) und werden **nie** ausgegeben. Zugriff vorerst nur
für Admins, das Gate ist die eine Funktion `requireWahooAccess` in `wahoo.js`. Verbunden oder getrennt wird immer
nur die `profile_id` aus dem JWT. Token-Erneuerung macht allein der Sync (B4), die admin-api nur das erste Verbinden.

| Methode | Pfad | Zweck |
|---|---|---|
| POST | `/api/wahoo/start` | Bearer-Login. Antwort `{ ok, url }` mit der fertigen Authorize-URL (der Browser kann bei einer Weiterleitung keinen Header senden, das Frontend leitet selbst weiter). `state` = `base64url("<profileId>.<ablaufMs>")` + `.` + HMAC-SHA256 (Schlüssel `WAHOO_CLIENT_SECRET`), 10 Minuten gültig |
| GET | `/api/wahoo/callback` | **Kein** Bearer (Browser-Redirect von Wahoo). Prüft `state`, tauscht den Code, schreibt die Zeile per Upsert (`on_conflict=profile_id`), dann `302` auf `WAHOO_RETURN_URL` mit `?wahoo=connected` oder `?wahoo=error&reason=…` (`state_invalid`, `state_expired`, `denied`, `missing_code`, `exchange`, `storage`) |
| POST | `/api/wahoo/disconnect` | Bearer-Login. Widerruf bei Wahoo (`DELETE https://api.wahooligan.com/v1/permissions`, best effort), danach Zeile löschen. Antwort `{ ok, revoked }`, auch `200`, wenn keine Zeile da war |
| GET | `/api/wahoo/status` | Bearer-Login. Antwort `{ ok, connected, scope, expiresAt }` |

Der Widerruf braucht ein gültiges Access-Token; ist es schon abgelaufen, meldet Wahoo einen Fehler,
`revoked` ist dann `false` und nur die Zeile wird gelöscht (die admin-api erneuert keine Tokens).

### Verifizierte Autoren (Fahrplan 29)

Der Admin setzt `profiles.is_verified_author` über `POST /admin/users/:id/verify-author` bzw.
`/unverify-author` (nur Admin, `GET /admin/users` liefert `isVerifiedAuthor`). Beide Aktionen
stehen im `admin_audit_log` (`verify_author` / `unverify_author`); der Eintrag wird **vor** der
Änderung geschrieben, ist er nicht schreibbar, passiert nichts (502). Die ID muss eine UUID sein
(sonst 404), ein unbekanntes Profil ist 404. Das Flag wird mit `Prefer: return=minimal` gesetzt:
der Dienst hat nur Spaltenrechte auf `profiles`.

Wirkung auf die Rezept-Endpunkte (die Prüfung läuft bei **jedem** Aufruf neu, ein Entzug wirkt sofort):

| Endpunkt | Nicht verifiziert | Verifiziert |
|---|---|---|
| `POST /api/recipes` | `pending`, höchstens 5 offene | sofort `approved`, kein Limit offener Rezepte |
| `PUT /api/recipes/:id` | eigenes `pending` | eigenes `pending` **oder** `approved` (Status bleibt, Stimmen werden gelöscht) |
| `DELETE /api/recipes/:id` | eigenes `pending` | eigenes `pending` **oder** `approved`, aber nicht, solange das Rezept in einem Essensplan liegt |

Liegt ein freigegebenes Rezept in einem Essensplan (`meal_plan_entries.recipe_id` ist `on delete
restrict`), antwortet `DELETE` mit `409 VALIDATION` und `details.in_meal_plans`; das gilt auch,
wenn der Eintrag erst zwischen Prüfen und Löschen dazukommt. Ein `PUT`/`DELETE` auf ein
freigegebenes Rezept ohne Verifizierung bleibt `409 VALIDATION` (ohne `details`), ein
abgelehntes ebenfalls. Entzug (V-5): bereits freigegebene Rezepte bleiben `approved`, nur der
Admin kann sie dann noch ändern.

Rollout Kommentare (Fahrplan 30 B5): Migration `0077` (Tabellen, View, Audit-Aktion
`delete_recipe_comment`) kommt VOR dem Image mit `DELETE /admin/recipe-comments/:id`. Ohne sie lehnt
der Dienst das Löschen sauber mit 502 ab (Audit-Log nicht schreibbar).

Rollout: Die Migrationen `0071` (Spalte, Trigger, RLS-Sperre) und `0072` (Audit-Aktionen) laufen
beim Pod-Start im `migrate`-Container, im selben Release wie dieses Image (auf apps01 deployt
ein Versions-Bump alle Container zusammen). Das Image braucht beide: ohne `0071` scheitert
`GET /admin/users` (die Spalte fehlt), ohne `0072` lehnt das Verifizieren sauber mit 502 ab. Ein
kurzes Fenster mit altem Schema ist also harmlos (nur der Admin-Bereich meldet einen Fehler),
und es entsteht keine halbe Änderung.

### Build-Kontext = Repo-Wurzel

Das Image enthält neben `admin-api/*` gezielt vier Dateien aus `scripts/lib`
(`recipe-nutrition.js`, `validate-recipe.js`, `ingredient-nutrition.json`,
`core/nutrition-taxonomy.js`) — dieselbe Quelle wie das Seed-Skript. Bauen:
`docker build -f admin-api/Dockerfile .` (Wurzel!). `admin-api` bleibt CommonJS und lädt
die ESM-Module per `import()`.

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

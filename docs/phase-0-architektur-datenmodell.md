# Phase 0 — Architekturkonzept: Rollenmatrix & Supabase-Schema

> Status: Entwurf zur Abnahme. Offene Entscheidungen sind mit ⚠️ markiert.
> Grundsatz: Lesedaten bleiben in der GitHub-Pipeline (`data/*.json`), alle Schreibdaten in Supabase. Das Dashboard bleibt öffentlich erreichbar — deshalb gilt für Supabase **Default Deny**: nichts ist erlaubt, was nicht explizit per RLS-Policy freigegeben wurde.

---

## 1. Rollenmodell

Drei Rollen, zwei davon mit Account:

| Rolle | Account? | Beschreibung |
|---|---|---|
| **Athlet** | ja (E-Mail + Passwort) | Besitzer seiner eigenen Daten. Stuhlsen und hc_diZee. |
| **Trainer** | ja (E-Mail + Passwort) | Genau **einem** Athleten zugeordnet. Sieht dessen Daten vollständig, kann direkt ändern oder Vorschläge anlegen. Der "Claude-Trainer" ist technisch ein normaler Trainer-Account — der Mensch dahinter (der Athlet selbst oder wer den Export/Import bedient) loggt sich ein und importiert Claudes Vorschlags-JSON. |
| **Besucher** | nein (anon) | Liest den öffentlichen Teil des Dashboards, darf Feedback hinterlassen. Sonst nichts. |

**Rollen-Speicherung:** Eine `profiles`-Tabelle, 1:1 zu `auth.users`, mit `role`-Spalte (`athlete` / `coach`). Die Trainer-Zuordnung liegt als `coach_id` direkt am Athleten-Profil (1 Athlet ↔ 1 Trainer). Kein separates Zuordnungs-Table nötig, solange die Beziehung 1:1 bleibt — sollte später mal ein Trainer mehrere Athleten betreuen, funktioniert das Modell trotzdem (mehrere Athleten können auf dieselbe `coach_id` zeigen), nur umgekehrt (mehrere Trainer pro Athlet) bräuchte es eine Zwischentabelle.

**Wichtig fürs Sicherheitsdenken:** Die Rolle steht in der Datenbank, niemals im Client-State als Quelle der Wahrheit. Das UI darf Buttons ein-/ausblenden, aber jede Schreiboperation wird serverseitig von RLS geprüft. Ein Besucher mit DevTools und dem (öffentlichen) anon-Key darf trotzdem nichts können.

---

## 2. Rollenmatrix — wer darf was?

Legende: ✅ erlaubt · 🔒 nur eigene/zugeordnete Daten · ❌ verboten

| Aktion | Athlet | Trainer | Besucher (anon) |
|---|---|---|---|
| Dashboard-Lesedaten (GitHub `data/*.json`) ansehen | ✅ | ✅ | ✅ (öffentlich per Design) |
| `goals` lesen | ✅ | 🔒 sein Athlet | ⚠️ E1 |
| `goals` schreiben | 🔒 eigene | 🔒 sein Athlet | ❌ |
| `events` lesen | ✅ | 🔒 sein Athlet | ⚠️ E1 |
| `events` schreiben | 🔒 eigene | 🔒 sein Athlet | ❌ |
| `wellbeing` lesen | 🔒 eigene | 🔒 sein Athlet | ⚠️ E2 |
| `wellbeing` schreiben | 🔒 eigene | ❌ (Befinden gibt nur der Athlet selbst an) | ❌ |
| `plan_cards` lesen | ✅ | 🔒 sein Athlet | ⚠️ E1 |
| `plan_cards` schreiben | 🔒 eigene | 🔒 sein Athlet (Direktänderung erlaubt) | ❌ |
| `proposals` lesen | 🔒 eigene (als Empfänger) | 🔒 selbst erstellte | ❌ |
| `proposals` erstellen | ❌ | 🔒 für seinen Athleten | ❌ |
| `proposals` annehmen/ablehnen | 🔒 eigene | ❌ | ❌ |
| `feedback` lesen | ✅ (freigegebene) | ✅ (freigegebene) | ✅ nur freigegebene |
| `feedback` erstellen | ✅ | ✅ | ✅ (mit Spam-Bremse, s. u.) |
| `feedback` moderieren (freigeben/löschen) | ⚠️ E3 | ❌ | ❌ |
| `profiles` lesen (display_name, Rolle) | ✅ | ✅ | ✅ (nur Anzeige-Felder) |
| `profiles` schreiben | 🔒 eigenes | ❌ | ❌ |

### ✅ Entscheidungen (final, 14.07.2026)

- **E1 — `goals`, `events`, `plan_cards` öffentlich lesbar: JA.** SELECT für anon erlaubt, passt zum Portfolio-Charakter des öffentlichen Dashboards.
- **E2 — `wellbeing`-Sichtbarkeit: pro Athlet einstellbar.** Neue Profil-Einstellung `wellbeing_public` (Default: **aus**). Ist sie aktiv, sind die Slider-Werte öffentlich sichtbar — die Freitext-Notiz bleibt **immer** nur für Athlet + Trainer sichtbar (Umsetzung über eine öffentliche View ohne `note`-Spalte, s. RLS-Migration).
- **E3 — Feedback-Moderation: Admin-Rolle.** Neue Flag `profiles.is_admin` (anfangs nur Stuhlsen). Nur Admins geben Feedback frei, löschen es und werten es aus.

---

## 3. Supabase-Schema

Konvention: alle Tabellen mit `id uuid default gen_random_uuid() primary key`, `created_at timestamptz default now()`. Athleten-Bezug immer über `athlete_id uuid references profiles(id)` — nie über Namen.

### `profiles`
1:1 zu `auth.users` (id = auth.uid). Wird per Trigger bei Account-Anlage erzeugt.

| Spalte | Typ | Anmerkung |
|---|---|---|
| `id` | uuid PK | = `auth.users.id` |
| `display_name` | text | "Stuhlsen", "hc_diZee", Trainer-Namen |
| `role` | text check in ('athlete','coach') | |
| `coach_id` | uuid FK → profiles | nur bei role='athlete' gesetzt; sein Trainer |
| `wellbeing_public` | boolean default false | E2: Athlet schaltet seine Befinden-Slider öffentlich (Notiz nie) |
| `is_admin` | boolean default false | E3: Feedback-Moderation; anfangs nur Stuhlsen |

### `goals`
| Spalte | Typ | Anmerkung |
|---|---|---|
| `athlete_id` | uuid FK | |
| `kind` | text | z. B. 'ftp', 'gewicht', 'wochen_tss' — offen erweiterbar |
| `target_value` | numeric | |
| `target_date` | date | nullable |
| `note` | text | nullable |
| `is_active` | boolean default true | alte Ziele bleiben als Historie erhalten statt gelöscht zu werden |

### `events`
| Spalte | Typ | Anmerkung |
|---|---|---|
| `athlete_id` | uuid FK | |
| `title` | text | |
| `event_date` | date | |
| `priority` | text check in ('A','B','C') | Standard im Radsport, passt zu Countdown/FTP-Ziel-Verknüpfung |
| `note` | text | nullable |

### `wellbeing`
Ein Datensatz pro Athlet und Tag → `unique(athlete_id, date)`. Upsert statt Insert, damit man morgens korrigieren kann.

| Spalte | Typ | Anmerkung |
|---|---|---|
| `athlete_id` | uuid FK | |
| `date` | date | |
| `sleep` | smallint check 1–5 | Slider-Werte bewusst grob (1–5), nicht 1–100 |
| `energy` | smallint check 1–5 | |
| `muscles` | smallint check 1–5 | Muskelgefühl |
| `mood` | smallint check 1–5 | |
| `note` | text | nullable — **nie öffentlich** (E2) |

### `plan_cards`
| Spalte | Typ | Anmerkung |
|---|---|---|
| `athlete_id` | uuid FK | |
| `planned_date` | date | |
| `sort_order` | smallint | Reihenfolge bei mehreren Karten am selben Tag (Drag & Drop, Phase 3) |
| `title` | text | |
| `workout_type` | text | z. B. 'endurance', 'sweetspot', 'vo2', 'rest' — Mapping auf die Zonen-Farbpalette aus Konzept 5 |
| `duration_min` | smallint | |
| `tss_planned` | smallint | nullable; Basis für die Prognose-Neuberechnung in Phase 3 |
| `status` | text check in ('geplant','erledigt','ausgefallen') | |
| `note` | text | nullable |

### `proposals`
Einheitlich für Mensch- und Claude-Vorschläge — der Import-Parser (Phase 4) schreibt in dieselbe Tabelle wie das Trainer-UI.

| Spalte | Typ | Anmerkung |
|---|---|---|
| `athlete_id` | uuid FK | Empfänger |
| `coach_id` | uuid FK | Ersteller (bei Claude-Import: der Account, der importiert) |
| `payload` | jsonb | das Vorschlags-Schema aus Phase 4, z. B. `{typ:'verschiebe_einheit', …}` |
| `source` | text check in ('human','claude') | fürs UI-Label und die Portfolio-Story |
| `status` | text check in ('offen','angenommen','abgelehnt') | |
| `decided_at` | timestamptz | nullable |

Bewusste Entscheidung: `payload` als JSONB statt eigener Spalten pro Vorschlagstyp — die Typen entstehen erst in Phase 4 und werden sich ändern. Validierung passiert im Import-Parser, nicht im Schema. Einzige Schema-Pflicht: `payload` muss ein Objekt mit `typ`-Feld sein (per check constraint prüfbar).

### `feedback`
| Spalte | Typ | Anmerkung |
|---|---|---|
| `athlete_id` | uuid FK, nullable | worauf bezieht sich das Feedback (null = allgemein) |
| `visitor_name` | text, nullable | anonym erlaubt |
| `message` | text check length ≤ 1000 | |
| `is_approved` | boolean default false | **nichts ist sichtbar, bevor es moderiert wurde** — das ist der Spam-Schutz Nr. 1 |

Weitere Spam-Bremsen ohne Kosten: Längen-Limit per Constraint (steht oben), Rate-Limit ist im Free Tier ohne Edge Functions kaum sauber machbar → dafür reicht `is_approved=false` als Default plus ggf. ein Honeypot-Feld im Widget (Phase 6 Detail).

---

## 4. RLS-Grundsätze (Vorschau auf den nächsten Checkpunkt)

Die Policies selbst sind der nächste Punkt im Fahrplan, aber das Muster steht mit der Matrix fest:

1. **RLS auf jeder Tabelle aktiviert, keine Ausnahme.** Tabelle ohne Policy = für niemanden zugreifbar.
2. Drei wiederkehrende Prüfmuster:
   - *Eigentümer:* `athlete_id = auth.uid()`
   - *Zugeordneter Trainer:* `exists (select 1 from profiles p where p.id = athlete_id and p.coach_id = auth.uid())`
   - *Anon-Lesen:* `using (true)` nur dort, wo E1/E2 es explizit erlauben — und bei `feedback` zusätzlich `is_approved = true`
3. **Kein Service-Role-Key im Frontend, niemals.** Nur der anon-Key liegt im Client — der darf genau das, was die Policies erlauben, und nichts sonst.
4. `wellbeing.note` ggf. per View/Spaltentrennung schützen, falls E2 auf "teilweise öffentlich" hinausläuft (RLS wirkt pro Zeile, nicht pro Spalte — das ist ein klassischer Stolperstein).

---

## 5. Abgrenzung Lese- vs. Schreibdaten (festgeschrieben)

| Datenart | Quelle | Weg |
|---|---|---|
| Aktivitäten, PMC, FTP, HRV, RHR, Schlaf (Messwerte), Wetter, RPE/Feel | intervals.icu / Apple Health / Amazfit | GitHub Action → `generate-data.js` → `data/*.json` (read-only) |
| Ziele, Events, Befinden (Check-in), Trainingskarten, Vorschläge, Feedback | Nutzer im Dashboard | Supabase (RLS-geschützt) |

Grauzone bewusst geregelt: **Befinden nach der Fahrt (RPE/Feel)** ist ein Lesedatum (kommt aus intervals.icu über die Pipeline), **Morgen-Check-in** ist ein Schreibdatum (Supabase). Kein Datentyp existiert auf beiden Seiten.

---

## 6. Dev/Prod-Trennung — bauen ohne das laufende Dashboard anzufassen

Das öffentliche Dashboard bleibt während der gesamten 2.0-Entwicklung unberührt. Drei Trennlinien:

### 6.1 Code: Branch statt main

Entwicklung läuft auf einem langlebigen Branch `dashboard-2.0`. `main` bleibt der Stand des Live-Dashboards; GitHub Pages deployt weiterhin nur `main`. Merge nach `main` erst, wenn eine Phase komplett getestet ist — und selbst dann phasenweise (Phase 1 kann live gehen, während Phase 3 noch auf dem Branch lebt), weil jede Phase für sich funktionsfähig ist.

Lokales Testen: einfacher Static-Server (`npx serve` oder `python -m http.server`) im Projektordner. Die Lesedaten (`data/*.json`) liegen ja im Repo — lokal arbeitest du automatisch mit dem letzten committeten Datenstand, ohne die Pipeline anzufassen.

### 6.2 Daten: zwei Supabase-Projekte

Der Free Tier erlaubt **zwei Projekte** — das nutzen wir exakt dafür:

| | `dashboard-dev` | `dashboard-prod` |
|---|---|---|
| Zweck | Entwicklung, Tests, Wegwerf-Daten | echte Daten, öffentliches Dashboard |
| Accounts | Testaccounts (athlet-test, trainer-test) | die echten 4 Accounts |
| Anlegen | jetzt, Phase 0 | erst wenn Phase 1 merged wird |
| Keep-Alive-Ping | nicht nötig (pausiert halt mal) | ja, in den 6h-Cron |

Wichtiger Nebeneffekt: RLS-Policies werden als **SQL-Migrationsskripte im Repo** gepflegt (`supabase/migrations/*.sql`), nicht per Klicken im Supabase-UI. Nur so lässt sich derselbe Stand reproduzierbar in dev **und** prod einspielen — und die Policies sind gleichzeitig im Portfolio sichtbar dokumentiert.

### 6.3 Umschaltung: Config nach Hostname

Eine kleine `supabase/config.js` wählt Projekt-URL + anon-Key anhand des Hostnamens:

- `localhost` / `127.0.0.1` → dev-Projekt
- GitHub-Pages-Domain → prod-Projekt

Kein Build-Schritt, kein manuelles Umstecken, kein Risiko, versehentlich mit Prod-Daten zu entwickeln. Beide anon-Keys dürfen im Repo liegen (sie sind per Design öffentlich — die Sicherheit kommt aus RLS, nie aus dem Key).

### 6.4 Was das für die Tests bedeutet

Unit-Tests (Vitest) mocken den Supabase-Client ohnehin. Für Integrationstests der RLS-Policies gibt es einen eigenen Test-Ablauf gegen das **dev**-Projekt: als anon / Athlet A / Trainer B eingeloggt jeweils versuchen, Verbotenes zu tun — jeder Versuch muss scheitern. Dieses Skript ist gleichzeitig der "Sicherheits-Review"-Prüfpunkt aus Phase 1 in ausführbarer Form.

---

## 7. Nächste Schritte

1. E1–E3 entscheiden
2. RLS-Policies pro Tabelle ausformulieren, als Migrationsskripte ([F5])
3. Schichtenarchitektur-Frage klären: neue `supabase/`-Schicht ([OP])
4. AGENTS.md erweitern — inkl. Branch- und Dev/Prod-Konventionen aus Abschnitt 6 ([HA])
5. Supabase-**dev**-Projekt anlegen, CDN-Einbindung + config.js testen ([SO]); prod-Projekt und Keep-Alive-Ping erst beim Merge von Phase 1

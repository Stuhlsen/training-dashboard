# Phase 6 — Konzept: Besucher-Feedback [F5]

> **Ziel:** Besucher können ohne Account Feedback hinterlassen — anonym oder mit
> frei gewähltem Namen. Moderation über das bestehende `is_admin`-Flag (E3).
> **Sicherheits-Rahmen:** Dies ist der einzige Schreibzugriff der App ohne Login —
> der anonyme INSERT über den öffentlichen anon-Key ist damit die exponierteste
> Stelle des Gesamtsystems und wird entsprechend eng geführt.

---

## 1. `feedback`-Tabelle

Abgleich mit `0001_initial_schema.sql` vor Umsetzung (Tabelle existiert laut
Phase 0); Zielzustand:

| Spalte | Typ | Zweck |
|---|---|---|
| `id` | uuid PK | |
| `name` | text null | frei gewählt, max. 40 Zeichen; null = anonym |
| `message` | text | max. 1000 Zeichen (CHECK-Constraint, nicht nur UI) |
| `context` | text null | optional: Bereich („Charts", „Planung" …) aus fester Liste |
| `status` | text | `pending` \| `approved` \| `hidden` — Default **`pending`** |
| `ip_hash` | text null | SHA-256 der Besucher-IP + Server-Salt, nur für Rate-Limit; nie im UI, nur Admin-SELECT; Aufbewahrung s. §3 |
| `created_at` | timestamptz | |
| `decided_by` / `decided_at` | uuid / timestamptz null | Moderations-Protokoll |

## 2. Rechte (RLS + CHECKs — die eigentliche Verteidigungslinie)

- **INSERT (anon + authenticated):** erlaubt, aber `WITH CHECK status = 'pending'`
  — niemand außer Admin kann approved einfügen; `name`/`message`-Längen als
  CHECK-Constraints auf der Tabelle (Client-Validierung ist Komfort, nicht Schutz).
- **SELECT (öffentlich):** nur `status = 'approved'`, und nur die Spalten
  `name`/`message`/`context`/`created_at` (Spaltensicherheit über eine **View**
  `feedback_public`, damit `ip_hash` strukturell unerreichbar ist — nicht nur
  per Policy).
- **UPDATE/DELETE:** nur `is_admin` (Statuswechsel, Löschen). Besucher können eigene
  Einträge nicht ändern oder löschen — ohne Identität gäbe es dafür keine sichere
  Zuordnung.
- GRANTs für `anon` **und** `authenticated` mitführen (Phase-1-Lehre; hier erstmals
  auch `anon` als Schreibrolle).

## 3. Spam-Schutz ohne Server — drei Schichten

1. **Honeypot:** unsichtbares Formularfeld; ist es gefüllt, bricht der Client ab
   *und* ein Trigger verwirft den INSERT (Feld wird mitgesendet, aber nie
   gespeichert). Fängt naive Bots, kostet nichts.
2. **Rate-Limit in der Datenbank:** `BEFORE INSERT`-Trigger liest die Besucher-IP aus
   den von Supabase durchgereichten Request-Headern
   (`current_setting('request.headers')` → `x-forwarded-for`), hasht sie mit einem
   in der DB hinterlegten Salt und zählt Einträge dieses `ip_hash` im Zeitfenster:
   **max. 3 pro Stunde, max. 10 pro Tag** (Konfig-Werte). Drüber ⇒ Fehler mit
   neutraler Meldung. Kein Server, keine Edge Function nötig.
   *Verifikationspunkt vor Festschreiben:* Header-Durchreichung im Free Tier einmal
   live prüfen (wie beim RPE/Feel-Muster) — Fallback wäre eine Edge Function als
   Insert-Pfad.
3. **Pre-Moderation als letzte Schicht (F1):** Nichts wird öffentlich, bevor der
   Admin es freigibt — Spam, der durch 1–2 rutscht, erreicht nie Besucher.

`ip_hash` wird nach **30 Tagen** genullt (täglicher Cleanup via `pg_cron` bzw.
beim nächsten Admin-Login als Fallback) — er dient nur dem Rate-Limit, nicht der
Wiedererkennung. Kein Captcha in v1 (F2): erst nachrüsten, wenn real Spam ankommt;
ein Turnstile-Einbau bliebe als Edge-Function-Erweiterung jederzeit möglich.

## 4. Widget & Moderations-UI

- **Widget** (öffentlich, eigener Bereich am Seitenende): Liste der freigegebenen
  Einträge (Name oder „Anonym", Nachricht, Datum, optional Bereichs-Tag) +
  schlankes Formular (Name optional, Nachricht, Bereich-Auswahl). Nach dem Absenden:
  „Danke — dein Feedback erscheint nach Freigabe." Kein Zähler offener Einträge
  öffentlich (verrät Moderationslage).
- **Moderation** (nur Admin, im bestehenden Settings-Panel als neuer Abschnitt):
  Pending-Liste mit Freigeben / Verbergen / Löschen; freigegebene und verborgene
  Einträge filterbar. Kein separates Admin-Interface — das Settings-Panel existiert
  schon und ist auth-gated.

## 5. Tests

- RLS: anon kann nur `pending` einfügen; anon sieht nur `approved` (und kein
  `ip_hash` — View-Test); Nicht-Admin kann Status nicht ändern; Admin kann.
- Trigger: 4. Insert derselben IP in der Stunde schlägt fehl; anderer Hash geht
  durch; Honeypot-Feld gefüllt ⇒ verworfen.
- CHECKs: 1001 Zeichen Nachricht ⇒ Fehler; 41 Zeichen Name ⇒ Fehler.
- `tests/supabase-rls.test.js` um die anon-Rolle erweitern (bisher nur
  authenticated-Fälle).

---

## Getroffene Entscheidungen

- Feedback ist der einzige anonyme Schreibpfad; Verteidigung in der DB
  (RLS + CHECK + Trigger), nie nur im Client. ✅
- `ip_hash` statt Roh-IP, strukturell vom öffentlichen SELECT getrennt (View),
  30-Tage-Aufbewahrung. ✅
- Moderation im bestehenden Settings-Panel, `is_admin`-Flag (E3). ✅
- **F1 — Pre-Moderation:** nichts erscheint öffentlich vor Admin-Freigabe; das Widget
  kommuniziert die Freigabe transparent („erscheint nach Freigabe"). ✅
- **F2 — Kein Captcha in v1:** Honeypot + DB-Rate-Limit + Pre-Moderation als Start;
  Turnstile via Edge Function bleibt als Nachrüstpfad dokumentiert, falls real Spam
  ankommt. ✅

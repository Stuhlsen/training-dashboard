> **Archiviert (Fahrplan 2, DOK1, 15.08.2026).** Beschreibt einen überholten Stand. Gilt nicht mehr für den aktuellen Code — nur als historischer Kontext.

Phase 1 — Claude Code Briefing: Auth & Athleten-Menü

KONTEXT
Branch: dashboard-2.0 (main bleibt unangetastet)
Stack: Vanilla JS ES-Module, kein Framework, kein Build-Step
Architektur: core/ → data-access/ → state/ → ui/ (nur nach unten importieren)
Supabase CDN: https://esm.sh/@supabase/supabase-js@2
Design: Konzept 5 — dark (#0b0e13), Glas-Kacheln (rgba), Akzent #e08a3c,
  Sora (Display/Zahlen), IBM Plex Mono (Labels/Meta), Inter (Body)
Bestehende Tokens: alle in assets/css/main.css als CSS-Variablen

BEREITS VORHANDEN (nicht neu erstellen):
- assets/js/data-access/supabase/config.js (Hostname → dev/prod Keys)
- assets/js/ui/header.js (existiert — nur erweitern, nicht neu schreiben)
- assets/js/app.js (existiert — nur erweitern)

SUPABASE DEV-PROJEKT:
4 Accounts: Stuhlsen (athlete, is_admin=true), hc_diZee (athlete),
Trainer-ST (coach), Trainer-DZ (coach)

REIHENFOLGE:
1. client.js → 2. auth.js → 3. profiles.js + goals.js →
4. session.js → 5. auth-modal.js → 6. header.js erweitern →
7. settings-panel.js → 8. app.js erweitern

Nach jeder Datei: node -c [datei] + npm test (74 Tests müssen grün bleiben)
Commit pro Datei auf dashboard-2.0: "feat: [beschreibung] (Phase 1)"

---

AUFGABE 1: assets/js/data-access/supabase/client.js
Singleton. Import createClient von esm.sh/@supabase/supabase-js@2.
Import getConfig aus ./config.js.
Exportiert eine einzige Instanz `supabase`. Kein weiterer Code.

---

AUFGABE 2: assets/js/data-access/supabase/auth.js
Exportiert:
- signIn(email, password) → { user, error } (schlichte Objekte)
- signOut() → { error }
- onAuthChange(callback) → registriert onAuthStateChange, ruft callback(session) auf
- getCurrentSession() → aktuelle Session
Fehler immer als { error: 'Meldung' }, nie rohe Supabase-Objekte.

---

AUFGABE 3: assets/js/data-access/supabase/profiles.js
Exportiert:
- getProfile(userId) → { id, displayName, role, coachId, wellbeingPublic, isAdmin }
- updateDisplayName(userId, name) → { error }
- updateWellbeingPublic(userId, value) → { error }
Adapter-Vertrag: camelCase nach außen, snake_case nur intern beim Supabase-Aufruf.

---

AUFGABE 4: assets/js/data-access/supabase/goals.js
Exportiert:
- getGoals(athleteId) → Array von { id, kind, targetValue, targetDate, note, isActive }
  nur is_active=true, sortiert nach created_at
- saveGoal(athleteId, goal) → { id, error }
- deactivateGoal(goalId) → { error } (setzt is_active=false, kein Delete)

---

AUFGABE 5: assets/js/state/session.js
Hält intern: currentUser (null oder Profil-Objekt), listeners (Set)
Exportiert:
- initSession() → registriert onAuthChange, lädt Profil via getProfile bei Login,
  setzt currentUser, benachrichtigt Listener
- getSession() → currentUser (null wenn nicht eingeloggt)
- isAthlete() → boolean
- isCoach() → boolean
- isAdmin() → boolean
- onSessionChange(fn) → registriert Listener, gibt unsubscribe zurück
Wird in app.js einmalig mit initSession() gestartet.

---

AUFGABE 6: assets/js/ui/auth-modal.js
DOM wird lazy erstellt und an body gehängt.
Exportiert: openModal(), closeModal()
Formular: E-Mail + Passwort + "Anmelden" + "Abbrechen"
Fehler als Text unter Formular (kein Alert). ESC + Overlay-Klick schließen Modal.
Bei Erfolg: closeModal() — session.js übernimmt via onAuthChange.

Design:
- Overlay: rgba(7,9,14,0.75)
- Modal: background #141924, border 1px solid rgba(255,255,255,0.18),
  border-radius 22px, padding 26px 24px
- Titel: Sora 1rem 700, color var(--text)
- Subtitel: IBM Plex Mono 0.64rem uppercase, color var(--dim2)
- Labels: IBM Plex Mono 0.64rem uppercase letter-spacing 0.08em, color var(--dim)
- Inputs: background rgba(255,255,255,0.05), border 1px solid var(--border),
  border-radius 12px, color var(--text), Inter 0.85rem
  focus: border-color var(--accent)
- Primär-Button: .btn-primary aus main.css
- Abbrechen: transparent, border 1px solid var(--border), pill, color var(--dim)
- Fehler: color var(--red), IBM Plex Mono 0.75rem

---

AUFGABE 7: assets/js/ui/header.js (ERWEITERN, nicht neu schreiben)
Erst lesen, dann gezielt ergänzen. Hinzufügen:
- Login-Button (nicht eingeloggt): öffnet openModal(), Stil: border var(--border-light),
  pill, Sora 0.75rem, color var(--dim), ti-user Icon
- "eingeloggt als [Name]"-Anzeige (eingeloggt): IBM Plex Mono 0.68rem dim +
  Name Sora color var(--accent)
- ⚙-Icon (ti-settings): öffnet settings-panel, color var(--dim), hover var(--accent)
- Abmelden-Button: IBM Plex Mono 0.62rem, color var(--dim2), ti-logout Icon,
  Klick → signOut()
Sichtbarkeit via session.onSessionChange steuern.

---

AUFGABE 8: assets/js/ui/settings-panel.js
DOM lazy, an body. position fixed, right 0, top 0, height 100vh, width 260px.
background #141924, border-left 1px solid rgba(255,255,255,0.18).
Slide-in/out via transform translateX. ESC schließt.

Inhalt je nach Rolle:
ATHLET — Profil-Sektion + Ziele-Sektion + Datenquellen-Sektion
TRAINER — nur Profil-Sektion (nur Display-Name)

Profil-Sektion:
- Avatar: Initialen, background var(--accent-dim), border rgba(224,138,60,0.3),
  color var(--accent), 34px Kreis
- Display-Name Input: speichert onBlur via updateDisplayName()
- wellbeing_public Toggle (nur Athlet): speichert onChange via updateWellbeingPublic()
  Toggle: 36x20px, aus=rgba(255,255,255,0.10), an=var(--accent)

Ziele-Sektion (nur Athlet):
- Liste aktiver Ziele via getGoals()
- Ziel-Kind: IBM Plex Mono 0.65rem, color var(--dim)
- Ziel-Wert: Sora 0.8rem 600, color var(--accent)
- "Ziel hinzufügen"-Button: IBM Plex Mono 0.62rem, color var(--accent), kein Border
- Inaktiv-Markieren per Klick auf Ziel (deactivateGoal)

Datenquellen (nur Athlet):
- Aus window.__dashboardData (bestehende JSON), kein Supabase-Aufruf
- Grüner Dot (6px, var(--green)) + Quelle + letztes Sync-Datum

Visuelles Feedback: ✓-Icon neben Feld für 1.5 Sek nach erfolgreichem Speichern.

---

AUFGABE 9: assets/js/app.js (ERWEITERN, nicht neu schreiben)
Erst lesen. Hinzufügen:
- Import initSession aus state/session.js
- Aufruf initSession() beim App-Start (nach JSON-Daten laden)
- Import header.js falls noch nicht vorhanden (registriert sich selbst via onSessionChange)
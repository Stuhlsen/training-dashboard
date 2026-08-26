# `src/api/` — Zugriffsschicht (Etappe 2b)

Ersetzt die `state/*.js`-Module der Vanilla-Version. Bewusst **nicht**
`data/` genannt, um die Verwechslung mit `/data/*.json` (JSON-Pipeline) zu
vermeiden.

```
api/
  types.ts              Domänentypen (Profile, PlanCard, EventItem, Checkin, Proposal)
  keys.ts               Query-Key-Fabrik — die einzige Stelle, an der Keys entstehen
  queryClient.ts        QueryClient-Fabrik (je Test frisch, in main.tsx einmal)
  result.ts             Umschaltstelle Result-Konvention ↔ React Querys Fehlerkanal
  write-guard.ts        Reihenfolgeschutz für nebenläufige Mutationen
  pipeline.ts           JSON-Pipeline (data/*.json), Konzept 5.5
  write-authorization.ts canWriteForAthlete / isSelfAthlete (UI-Gates)
  supabase/             Adapter: eine Datei je Tabelle, Row-Mapping + Result
  intervals/push.ts     intervals.icu-Push (Etappe 6d) — kein Supabase-Bezug,
                         deshalb eigenes Verzeichnis statt supabase/
  intervals/streams.ts  intervals.icu-Sekunden-Rohdaten (Watt/Puls) für den
                         Planungstab-Rausch-Chart, on-demand — Zugangsdaten
                         kommen aus supabase/intervals-credentials.ts (eigene
                         Tabelle, NICHT profiles — das ist öffentlich lesbar)
  plan-cards/patch.ts   Reine Regeln der Karten-Anpassungen (mockfrei getestet)
  hooks/                Die eigentliche Hook-Oberfläche
```

## Schichtenregel

Unverändert gültig (AGENTS.md): `features/` und `components/` importieren
`hooks/`, nie `supabase/` direkt. Die Adapter kennen weder Hooks noch React.

## Was React Query ersetzt — und was nicht

Die alten `state/*.js` trugen zwei verschiedene Schutzmechanismen, die im
Code gleich aussahen. Nur einer davon löst sich mit React Query auf:

| Vanilla | Hier | Warum |
|---|---|---|
| `loadedForAthleteId` | **entfällt** | Der Query-Key trägt die `athleteId`. Eine überholte Ladeantwort kann strukturell nicht mehr im Cache eines anderen Athleten landen. |
| `onSessionChange`-Handler in `state/wellbeing.js` | **entfällt** | Der Check-in-Key trägt die User-ID; ein Kontowechsel ergibt automatisch einen eigenen Eintrag statt eines überschriebenen. |
| `profileIdCache` (`Map`) in `state/plan-cards.js` | **entfällt** | Der Query-Cache übernimmt das, mit `staleTime: Infinity`. |
| `requestGuard` bei **Mutationen** | **bleibt** (`write-guard.ts`) | React Querys Standard-Rollback (`onError` spielt den `onMutate`-Snapshot zurück) macht genau den Fehler, den die Vanilla-Version vermeidet: er setzt auf einen Stand zurück, der eine inzwischen erfolgreiche zweite Mutation nicht kannte. Belegt in `hooks/usePlanCards.test.tsx` — ohne den Guard fallen exakt die drei Race-Tests um. |

## Cache und Sitzung

`AuthProvider` leert den gesamten Query-Cache bei jedem Wechsel der
`auth.uid()` (Login, Logout, Kontowechsel). Das ist nicht nur Hygiene: RLS
liefert einem eingeloggten Trainer mehr Zeilen als einem Ausgeloggten
(Vorschläge und Check-ins seines Athleten), und ohne das Leeren bliebe
dieser Stand nach dem Logout sichtbar, bis die jeweilige Query von selbst
veraltet.

## Abweichungen gegenüber der Vanilla-Spezifikation

Die alten `state/`-Tests waren die Verhaltens-Spezifikation (Konzept 3.2
Fall 2). Abgedeckt sind alle dort abgesicherten *Verhaltensweisen*, nicht
alle Testfunktionen — hier die Stellen, an denen die Zahl bewusst abweicht:

1. **Patch-Regeln getrennt geprüft.** `movedFromDate` nur beim ersten
   Verschieben, week/phase der Zielwoche leihen, Ausfall-Reset, sort_order
   — das sind reine Funktionen (`plan-cards/patch.ts`) und werden ohne
   Mock-Geschirr geprüft. In der Vanilla-Version hingen sie am
   Async-Pfad und brauchten dafür `--experimental-test-module-mocks`.
2. **Athletenwechsel-Fälle umgeschrieben.** Was dort ein Verhalten war
   (`loadedForAthleteId` vergleichen), ist hier eine Struktureigenschaft.
   Geprüft wird jetzt, dass zwei Athleten getrennte Cache-Einträge
   bekommen, nicht dass ein Vergleich stattfindet.
3. **`getState()`-Zusicherungen entfallen.** Es gibt keinen Modul-State
   mehr, den man abfragen könnte; geprüft wird der Query-Cache.
4. **Login-Gate hängt am Auth-User, nicht am Profil.** `state/session.js`
   hielt das Profil als Session-Objekt, ein Schreibversuch während des
   Profil-Ladens wurde dort mit „Nicht eingeloggt" abgewiesen. Hier gated
   `useAuthUserId()` (synchron aus dem AuthContext); das Profil wird nur
   noch für Rollenfragen (Trainer? Admin?) gebraucht.
5. **`payloadToCardData()` ohne `plan_date` bricht jetzt ab.** Die
   Vanilla-Version hätte den Insert versucht und wäre an `planned_date NOT
   NULL` mit einer generischen DB-Meldung gescheitert.

## Bewusst NICHT in Etappe 2b portiert

- `state/chart-view.js`, `export*.js`, `ladder.js`, `block-transition.js`,
  `formats.js`, `goals.js`, `ftp-history.js` — gehören zu den Trainer-/
  Explorer-Etappen (7/8).
- `state/trainer-view.js` nur so weit, wie `canWriteForAthlete()` es
  braucht (Kategorien/`saveMode` folgen in Etappe 7). Der Adapter
  `supabase/trainer-view-prefs.ts` liegt deshalb schon hier.
- ~~`pushPlanCard()` / `data-access/intervals/push.js`~~ — inzwischen als
  `api/intervals/push.ts` + `usePushPlanCard()` in Etappe 6d portiert (der
  Grund für die Zurückstellung galt unverändert: hängt an einem
  localStorage-Token und einer externen API, nicht an Supabase).
- Der `STATIC_RIDES`-Fallback aus `state/data.js`. Er existierte, weil
  `file://` keine Fetches erlaubt; der Vite-Dev-Server liefert `/data/`
  direkt aus. Ein Ladefehler ist jetzt sichtbar, statt hinter
  Beispieldaten zu verschwinden.

## JSON-Pipeline (Konzept 5.5)

In dieser Etappe bestätigt: die per Cron erzeugten `data/*.json` bleiben
unangetastet, die React-App liest dieselben Dateien. Lokal liefert eine
Dev-Middleware (`serveRepoData()` in `vite.config.ts`) sie unter `/data`
aus — der Dev-Server wurzelt in `/app/`, die Dateien liegen daneben. In
Produktion (Etappe 10) liegt `/data/` neben der gebauten App, der URL-Pfad
stimmt dort ohne Zutun.

Pfade werden mit `import.meta.env.BASE_URL` gebildet: ein absoluter
`/data/…`-Pfad wäre auf GitHub Pages falsch (Projektseite unter
`/training-dashboard/`), ein relativer `./data/…` bräche bei tiefen
Client-Routen wie `/planning`.

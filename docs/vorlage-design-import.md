# Vorlage: Design-Übernahme-Workflow

**Entstanden:** Etappe 4 (Hero-Bereich, 06.08.2026) — erster echter Durchlauf.
Gilt ab jetzt für jede Bereichs-Etappe (5–9) in `docs/dashboard-3.0-konzept-
react-umbau.md`, die einen Claude-Design-Export nach `/app/` übernimmt.

## 1. Zugriff auf das Design-Projekt

- Werkzeug: `DesignSync` (eingebaut, kein `.mcp.json`-Eintrag, kein
  OAuth-Setup — Freigabe hängt am claude.ai-Login).
- **`DesignSync.list_projects` NICHT verwenden** — das filtert auf
  beschreibbare *Design-System*-Projekte und liefert für ein reguläres
  Design-Projekt eine leere Liste. Das ist kein Fehler.
- Stattdessen: Projekt-ID aus der vom Design-Tool gelieferten URL/dem
  Import-Prompt entnehmen, dann direkt:
  1. `DesignSync.get_project` (Projekt-ID) — bestätigt Name/Typ.
  2. `DesignSync.list_files` (Projekt-ID) — zeigt alle Dateien im Projekt.
     Ein Projekt kann mehrere Entwürfe für unterschiedliche Bereiche
     enthalten (Beispiel Hero-Projekt: vier Explorer-Entwürfe lagen
     daneben, gehören zu Etappe 8) — nur die zur aktuellen Etappe
     gehörenden Dateien lesen.
  3. `DesignSync.get_file` je Datei (`*.dc.html`, `support.js`).
- Nur Lesemethoden nötig. `finalize_plan`/`write_files` (Schreibrichtung,
  für das `/design-sync`-Skill gedacht) kommen hier nicht zum Einsatz —
  der Fluss ist einseitig: Design lesen → React-Code im Repo schreiben.

## 2. Was ein Export enthält

Beobachtet am Hero-Export (`Hero-Ebenen.dc.html` + `support.js`):
- Kein Tailwind, kein reguläres JSX.
- `*.dc.html`: HTML mit Inline-Styles, `{{ expr }}`-Platzhaltern und einem
  `<script type="text/x-dc" data-dc-script">`-Block, der eine
  `class Component extends DCLogic`-Komponente mit `state`/`renderVals()`
  definiert. `renderVals()` liefert Fake-Daten (hier: zwei fest verdrahtete
  Beispiel-Athleten).
- `support.js`: die `DCLogic`/`h(...)`-Runtime (generiert, "nicht editieren").
  **Wird nicht übernommen** — s. Konvertierungsrezept unten.
- `image-slot.js` (falls vorhanden): der "omelette"-Bildplatzhalter-
  Mechanismus des Design-Tools (`<image-slot>`-Custom-Element). Genau wie
  `support.js` reine Design-Tool-Runtime — **nicht übernehmen**, im React-
  Code wird daraus ein normales `background-image`/`<img>`.
  **Stolperstelle:** ein hochgeladenes Bild liegt als Base64-Data-URI in
  `.image-slots.state.json`, NICHT als eigene Bilddatei unter `uploads/`.
  `DesignSync.get_file` deckelt bei 256 KiB — größere Bilder kommen mit
  `"truncated":true` zurück, ein vollständiges Bild lässt sich daraus nicht
  rekonstruieren (an dieser Stelle keine JSON-Parsing-Trickserei versuchen,
  das Ergebnis ist serverseitig abgeschnitten). Alex liefert das Bild in
  diesem Fall direkt als Datei fürs Repo.

## 3. Konvertierungsrezept

| Export | React |
|---|---|
| `<x-dc>…</x-dc>`-Markup | JSX-Baum in der Feature-Komponente |
| Inline-`style="…"` | `style={{ … }}`-Objekt (Kebab- → camelCase) |
| `{{ expr }}` | `{expr}` |
| `onClick="{{ x }}"` | `onClick={x}` |
| `state = {...}` + `setState()` | `useState()` in der Seiten-Komponente |
| `renderVals()` (Fake-Daten → Ableitungen) | reine View-Model-Funktion (kein React, kein DOM), s. Muster `hero-view-model.ts` — nimmt echte Daten als Parameter, liefert ein fertiges Render-Objekt, mit Vitest testbar wie `core/` |
| `support.js`/`DCLogic`/`h(...)` | **nicht übernehmen** — ersatzlos, React übernimmt Rendering/State nativ |

## 4. Daten: Fake-Generatoren gegen echte Quellen tauschen

Vor jeder neuen Berechnung erst suchen, ob es sie schon gibt:
1. `app/src/core/*.js` (Etappe 2a, unverändert portiert — Berechnungen ohne
   DOM/Supabase-Zugriff)
2. `app/src/api/hooks/*.ts` (Etappe 2b+ — Supabase-/Pipeline-Zugriff via
   React Query)

Nur wenn beides fehlt, neu bauen — und dann in `core/` (reine Berechnung)
bzw. `api/hooks/` (I/O), nicht direkt in der Komponente.

**Typ-Grenze beachten:** `core/*.js` ist JSDoc-typisiert, aber `checkJs`
ist im `app/`-Projekt bewusst aus (s. `tsconfig.app.json`-Kommentar) — die
JSDoc-Rückgabetypen sind teils lose (`Object & {…}`) oder Felder sind
bewusst `unknown` typisiert (z. B. `PlanCard.workout: WorkoutJson =
unknown`, `api/types.ts`). Wo eine echte, aus dem Code bekannte Struktur
dahintersteckt, an der Grenze **explizit casten** (Muster: `NextSession`/
`WorkoutStructure` in `hero-view-model.ts`, dieselbe Konvention wie der
JSON-Grenzcast in `api/pipeline.ts`) — nicht stillschweigend `any` durchs
ganze Modul reichen lassen.

## 5. Tokens

Werte aus dem Export mit `app/src/styles/tokens.css` abgleichen:
- Der Export bringt meist ein eigenes Namensschema mit (oklch-Variablen).
  Trifft es auf bereits reservierte, aber noch ungenutzte Tokens (z. B. die
  `--role-*`/`--surface-*`/`--z*`-Tokens, für die spätere Chart-Portierung
  in Etappe 8 reserviert) → **ergänzen, nicht umbenennen**, solange die
  reservierten Tokens von keiner Komponente gelesen werden.
- Sobald ein Bereich echte Werte für eine bereits reservierte Token-Gruppe
  liefert, diese Gruppe befüllen statt eine zweite parallele anzulegen.
- Bestehende geometrische Tokens (`--radius-lg`/`--radius-xl`) mitnutzen
  statt einer zweiten Radius-Skala aus dem Export.
- Kurz gegenprüfen, ob die knappe Design-Beschreibung im jeweiligen
  Etappen-Abschnitt von `dashboard-3.0-konzept-react-umbau.md` (vor dem
  eigentlichen Lesen des Exports formuliert) noch zutrifft — beim ersten
  Hero-Durchlauf (`Hero-Ebenen.dc.html`) wich sie an einer Stelle ab (kein
  Hintergrundfoto, reiner CSS-Gradient); die Design-Revision
  (`Hero-Weitwinkel.dc.html`) brachte dann tatsächlich ein Foto — solche
  Korrekturen können durch eine spätere Revision selbst wieder
  gegenstandslos werden, s. Abschnitt 7.

## 6. Ablage

- Geteilte Bausteine (Card-Shell, Ring, Badges, alles was mehr als ein
  Bereich braucht) → `app/src/components/`.
- Bereichsgebundenes → `app/src/features/<bereich>/`.
- Ein eigenes View-Model-Modul pro Seite (`<bereich>-view-model.ts`), wenn
  die Zusammensetzung mehrere `core/`+`api/hooks`-Quellen kombiniert — hält
  die JSX-Komponenten dumm/testarm und die eigentliche Logik testbar.

## 7. Design-Revisionen (Re-Sync)

Ein Bereich bekommt oft nicht nur einen Import-Durchlauf — Alex reicht
Design-Updates im selben Projekt nach (neue/geänderte `*.dc.html`-Dateien).
Vorgehen:
- `DesignSync.list_files` erneut aufrufen, nicht auf den ersten Stand
  verlassen — neue Dateien tauchen ohne Ankündigung im selben Projekt auf.
- Eine Revision ist ein **Überschreiben**, kein Parallel-Set: Token-Werte,
  Layout, Komponenten-Maße werden auf den neuen Export aktualisiert, nicht
  als zweite Variante daneben gepflegt (gilt auch für `tokens.css`, s. u.).
- **Re-Sync ist eine gute Gelegenheit für einen Konsistenz-Check gegen den
  Export** — beim zweiten Hero-Durchlauf fiel so ein echter Bug aus dem
  ersten Durchlauf auf (ein `isGoal`-Bool statt eines `kind`-Diskriminanten
  hatte zwei visuell unterschiedliche Pin-Stile vertauscht). Beim Nachziehen
  jedes Elements einmal wirklich mit der Export-Quelle vergleichen, nicht
  nur die eigene vorherige Umsetzung fortschreiben.
- Kurz gegenprüfen, ob frühere Kurzbeschreibungen/Korrekturen im jeweiligen
  Etappen-Abschnitt von `dashboard-3.0-konzept-react-umbau.md` noch
  zutreffen — eine frühere "kein Hintergrundfoto"-Korrektur kann durch eine
  Revision wieder gegenstandslos werden.

## 8. App-weite Layout-Elemente (Hintergrund, geteiltes Chrome)

Manche Design-Elemente sind explizit NICHT auf den aktuellen Bereich
begrenzt (z. B. ein `position:fixed`-Seitenhintergrund für "das ganze
Dashboard"). Zwei Punkte, die dabei leicht übersehen werden:
- **Wo mounten?** Einmal an zentraler Stelle (z. B. `App.tsx`, Geschwister
  von `<Routes>`) statt in jeder betroffenen Seite dupliziert — `position:
  fixed` macht die Stelle im Elementbaum ohnehin irrelevant für die Optik.
- **Stacking-Falle:** ein `position:fixed`/`position:absolute`-Hintergrund
  ist ein *positionierter* Nachfahre. Nach CSS2.1-Stapelreihenfolge malen
  nicht-positionierte In-Flow-Inhalte VOR positionierten Nachfahren —
  selbst bei `z-index:0`/`auto`. Trifft der Hintergrund auf noch unstyled
  Seiten (Login/Platzhalter-Tabs aus früheren Etappen, kein eigenes
  `position` gesetzt), deckt er sie sichtbar zu. Fix: den gesamten
  Routen-Baum in einen `position:relative;z-index:1`-Wrapper stecken, damit
  jede Route unabhängig von ihrer eigenen Positionierung "positioniert"
  ist (Beispiel: `App.tsx`, Etappe-4-Design-Revision).

## 9. Test-/Commit-Pflicht (G7, unverändert)

- View-Model-Funktionen: Vitest-Unit-Tests nach demselben Muster wie
  `core/*.test.js` (Muster: `hero-view-model.test.ts`) — Fokus auf die
  **Verdrahtung** (welcher Input landet wo), nicht auf die Neuprüfung der
  `core/`-Berechnungen selbst (die sind dort schon abgedeckt).
- In `/app/` (PowerShell: `cd app`, dann jeder Befehl auf eigener Zeile, kein `&&`):
  `npx tsc -b` — sauber, keine neuen Fehler.
- `npx eslint .` — keine neuen Errors (Warnungen wie
  `react-refresh/only-export-components` sind im Projekt bereits an
  anderer Stelle toleriert, s. `AuthContext.tsx`).
- `npx vitest run` — alle Tests grün, inkl. Regressionsnachweis
  (Gesamtzahl wächst nur um die neuen Tests).
- `npm run dev`, Browser gegen `dashboard-dev`: visueller Abgleich mit dem
  Export-Screenshot.
- Playwright-MCP nur am Ende, einmalig, nur bei echter Unklarheit (Layout-
  Bruch, Render-Fehler) — s. Playwright-Konvention in `CLAUDE.md`.

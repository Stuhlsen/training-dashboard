# Phase 0 — Schichtenarchitektur: Wo lebt Supabase?

> Frage aus dem Fahrplan: neue `api/`- oder `supabase/`-Schicht neben `core/` → `state/` → `ui/`?
> Status: Vorschlag zur Abnahme.

---

## 1. Das Problem in einem Satz

Die App ist heute **lesend und synchron**: `data/*.json` wird beim Start geladen, `core/` rechnet, `ui/` rendert. Supabase bringt drei Dinge mit, die es bisher nicht gab: **Netzwerk-I/O (async)**, **Auth/Session** und **Schreiben**. Die Kunst ist, diese drei neuen Sorgen so einzubauen, dass die strikte Einbahnstraße `core/` → `state/` → `ui/` erhalten bleibt — sonst holt uns der Circular-Deps-Abzug von Fallow sofort wieder ein.

---

## 2. Empfehlung: eine neue I/O-Randschicht `data-access/`

Nicht `api/` und nicht `supabase/` als Top-Level-Name — sondern eine Schicht, die **beide** Datenquellen kapselt: die bestehende JSON-Pipeline *und* Supabase. Denn architektonisch sind das dieselbe Sorte Ding — "woher kommen die Daten" —, nur mit unterschiedlicher Technik dahinter.

```
core/           reine Logik. Kein I/O, kein DOM, kein async.        ← hängt von NICHTS ab
data-access/    die I/O-Grenze. Weiß WIE man liest/schreibt.        ← darf höchstens core/-Typen kennen
  ├─ pipeline.js        (der heutige JSON-Loader zieht hierher um)
  └─ supabase/
       ├─ config.js     Hostname → dev/prod-Projekt (Phase-0 §6.3)
       ├─ client.js     erzeugt den supabase-js-Client (einmalig, Singleton)
       ├─ auth.js       signIn / signOut / onAuthChange
       ├─ goals.js      CRUD-Wrapper, geben schlichte Objekte zurück
       ├─ events.js
       ├─ wellbeing.js
       ├─ plan-cards.js
       ├─ proposals.js
       └─ feedback.js
state/          orchestriert: ruft data-access, hält Session +      ← hängt von core/ + data-access/
                Domänendaten, benachrichtigt ui/
ui/             rendert + verdrahtet Events → ruft state/-Aktionen  ← hängt von state/ + core/
                                                                       NIE von data-access/
```

**Die eine Regel, die alles zusammenhält** (Abhängigkeiten fließen nur nach unten):

| Schicht | darf importieren aus | darf **nicht** |
|---|---|---|
| `core/` | — | allem anderen |
| `data-access/` | `core/` (nur Typen/Hilfsfunktionen, idealerweise gar nichts) | `state/`, `ui/` |
| `state/` | `core/`, `data-access/` | `ui/` |
| `ui/` | `state/`, `core/` | `data-access/` |

Das ist ein azyklischer Graph. `ui/` redet **nie** direkt mit Supabase — es kennt die Schicht nicht mal. Damit ist die Circular-Deps-Falle strukturell zu.

---

## 3. Warum eine eigene Schicht — und nicht in `state/` mit rein?

Drei Sorgen, die man sauber trennen will:

- **`core/` = was die Daten *bedeuten*** (Zonen, Readiness, Prognosen) — bleibt rein und synchron.
- **`data-access/` = *woher* die Daten kommen** (JSON-Datei? Supabase-Tabelle? mit welchem Fehlerformat?).
- **`state/` = was *gerade geladen* ist + was der Nutzer *will*** (aktueller User, offene Vorschläge, gewählter Athlet).

Würde man Supabase in `state/` einbacken, müsste jeder State-Test das Netzwerk mocken und kennte plötzlich supabase-js-Interna. So aber bleibt `state/` gegen eine schmale, selbstgeschriebene Schnittstelle testbar.

---

## 4. Die vier Entwurfsentscheidungen, die daraus folgen

### 4.1 Alles `await` lebt in `data-access/` — `core/` bleibt 100 % synchron
Kein einziges `await` wandert nach `core/`. Ergebnis: die **74 bestehenden Tests laufen unverändert weiter**, und neue Kernlogik bleibt trivial testbar. `state/`-Aktionen werden zu async-Orchestratoren (`await dataAccess.goals.save(...)` → Ergebnis in den State → `ui/` benachrichtigen).

### 4.2 Adapter geben schlichte Domänenobjekte zurück, nie rohe Supabase-Antworten
`data-access/supabase/goals.js` liefert `{ id, kind, targetValue, … }` — nicht das `{ data, error, count, status }`-Konstrukt von supabase-js. Der Rest der App weiß nichts von Supabase. Vorteile: Mocken wird ein Einzeiler, und ein späterer Backend-Wechsel bliebe auf `data-access/` beschränkt.

### 4.3 Session ist einfach State
`auth.js` meldet Login-Wechsel, `state/` hält `currentUser`, `ui/` reagiert (Buttons ein-/ausblenden). **Wichtig, aus dem Sicherheitskonzept:** das UI-Ausblenden ist reine Kosmetik — die echte Absicherung ist RLS. Ein ausgeblendeter Button ist keine Zugriffskontrolle.

### 4.4 Fehler bekommen erstmals einen echten Weg nach oben
Bisher konnte "Daten laden" nicht fehlschlagen — eine lokale JSON-Datei ist entweder da oder nicht. Jetzt kann das Netzwerk wegbrechen. `data-access/` übersetzt Supabase-Fehler in schlichte App-Fehler, `state/` fängt sie und setzt einen Fehlerzustand, `ui/` rendert ihn. Diese Grenze einmal sauber ziehen, dann ist es überall gleich.

---

## 5. Die JSON-Pipeline zieht mit um

Der heutige Loader für `data/*.json` wird zu `data-access/pipeline.js` — Geschwister der Supabase-Adapter. Danach fragt `state/` nur noch abstrakt: "gib mir die Metriken des Athleten" (kommt aus JSON) und "gib mir seine Plankarten" (kommt aus Supabase). `state/` muss die Herkunft nicht kennen. Das vereinheitlicht das mentale Modell und ist genau die Lese-/Schreib-Abgrenzung aus dem Datenmodell-Konzept, nur in Code gegossen.

---

## 6. No-Build-Philosophie bleibt

supabase-js kommt als **ESM-Import über CDN** (Version gepinnt), analog zu allem anderen im Projekt — kein npm-Install, kein Bundler. Es ist die einzige neue Laufzeit-Abhängigkeit; sie lebt gekapselt in `data-access/supabase/client.js`, sodass der Import an genau einer Stelle steht.

---

## 7. Was das für die AGENTS.md heißt (nächster Fahrplan-Punkt)

Zwei neue Konventionen sind zu ergänzen:
1. Die Abhängigkeitstabelle aus Abschnitt 2 als harte Regel (`ui/` importiert nie `data-access/`).
2. Adapter-Vertrag: `data-access/`-Module geben schlichte Objekte zurück, kapseln alles supabase-Spezifische, und sind die einzige Stelle mit `await` gegen externe Dienste.

---

## 8. Kurz-Zusammenfassung

- Neue Schicht **`data-access/`** als I/O-Grenze, unter `state/`, kapselt JSON-Pipeline **und** Supabase.
- Abhängigkeiten strikt einbahnig: `ui/` → `state/` → `data-access/` → (nichts). `core/` steht daneben und hängt von nichts ab.
- `core/` bleibt rein und synchron → 74 Tests unangetastet, kein Circular-Deps-Risiko.
- Adapter liefern Domänenobjekte, Session ist State, Fehler haben einen definierten Weg nach oben.

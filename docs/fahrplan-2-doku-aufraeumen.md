# Fahrplan 2: Dokumentation und Repo aufräumen

**Stand:** 13.08.2026
**Zielablage:** `docs/fahrplan-2-doku-aufraeumen.md`
**Herkunft:** entspricht B-1 und B-2 des Gesamtfahrplans

---

## Ziel

Im Repo steht nur noch, was gilt. Arbeitsaufträge, generierte Artefakte und überholte Konzepte verschwinden. Am Ende existiert ein Runbook, mit dem sich der Betrieb ohne Vorwissen bedienen lässt.

## Warum das kein reines Aufräumen ist

Zwei Dinge in diesem Fahrplan sind mehr als Kosmetik:

- **`.env.example`** ist die Voraussetzung dafür, dass der Docker-Umbau überhaupt weiß, welche Variablen er braucht.
- **Das Runbook** schließt eine Lücke, die es heute nur deshalb nicht gibt, weil die Cloud den Betrieb abnimmt. Mit eigenem Stack wird sie real.

## Abhängigkeiten zu den anderen Fahrplänen

| Beziehung | |
|---|---|
| Braucht vorher | Fahrplan 1 vollständig — erst danach steht fest, welches Dokument noch etwas Existierendes beschreibt |
| Blockiert | Fahrplan 3 (Docker) braucht `.env.example` aus DOK2 |
| Läuft danach | DOK3 (Runbook) erst nach dem Cutover aus Fahrplan 3 |

## Fensterübersicht

```
DOK1   Dokumentation einordnen        (nach Fahrplan 1)
DOK2   .gitignore und .env.example    (nach Fahrplan 1)
DOK3   Runbook                        (nach Fahrplan 3, Fenster DKR6)
```

---

## Fenster DOK1 — Dokumentation einordnen

**Ziel:** Jedes Dokument in `docs/` ist entweder gültig, archiviert oder gelöscht.
**Vorbedingung:** Fahrplan 1 abgeschlossen.
**Modell:** `[SO]` für die Einordnung, `[HA]` für die Ausführung

1. **Arbeitsaufträge entfernen — Bestand prüfen, bevor gelöscht wird.** Der ursprüngliche Plan war, alle `claude-code-prompt-*.md` und `claude-code-freigabe-*.md` zu löschen. Laut letzter Prüfung existiert davon aktuell keine einzige Datei im Repo, weder im Arbeitsverzeichnis noch in der Git-Historie als aktueller Stand — der Schritt ist also möglicherweise bereits gegenstandslos. Trotzdem einmal aktiv nachsehen (`git ls-files` mit den beiden Mustern), bevor der Schritt als erledigt gilt: Falls seither neue Aufträge entstanden sind, greift die ursprüngliche Löschung wie vorgesehen.
   > **Falle:** `docs/phase-0-schichtenarchitektur .md` trägt ein Leerzeichen vor der Dateiendung. Ein Muster oder `mv`-Befehl auf den Namen ohne Leerzeichen trifft diese Datei nicht — bei der Einordnung in Punkt 2 gesondert beachten.
2. **Jedes verbleibende Dokument in einen von drei Töpfen einordnen:**

   **Lebend** — bleibt in `docs/`:
   - `AGENTS.md` (Architekturkonventionen)
   - `offene-punkte.md` (zentrale Sammelstelle)
   - `dashboard-3.0-konzept-react-umbau.md`
   - `konzept-progressionssteuerung.md`
   - `phase-4-prompt-vorlage-claude-trainer.md` — **Achtung: hängt an einem Konsistenztest gegen `PROMPT_TEMPLATE` in `core/export-briefing.js`. Nicht verschieben, ohne den Test anzupassen.**
   - `phase-6-konzept-besucher-feedback.md`, `phase-6-konzept-sichtbarkeit.md`
   - die vier Fahrpläne dieser Runde

   **Historisch** — nach `docs/archiv/`:
   - Phasen-Fahrpläne 0 bis 4
   - Vanilla-Architekturbeschreibungen
   - abgeschlossene Konzeptdokumente, deren Ergebnis im Code steht
   - `chart-grundlagen.md` und `phase-5-konzept-explorer.md`, sofern die React-Fassung eigene Grundlagen hat

   **Tot** — löschen:
   - Dokumente, die ausschließlich Vanilla-Verhalten beschreiben
   - Zwischenstände, die durch eine spätere Fassung desselben Dokuments ersetzt wurden
   - Notizen ohne erkennbaren Adressaten

3. **Vor jeder Verschiebung prüfen, ob ein Test oder Code auf den Pfad zeigt.** Der Fall aus Punkt 2 ist nicht der einzige — eine Volltextsuche über `tests/`, `core/` und `app/` nach dem Dateinamen kostet Sekunden.
4. **`docs/README.md` anlegen:** ein Absatz je lebendem Dokument — was drinsteht und wann man es liest. Ein Satz zum Archiv und dazu, dass Archiviertes nicht mehr gilt.
5. **`docs/offene-punkte.md` durchgehen** und alles streichen, was durch Fahrplan 1 erledigt ist. Punkte, die nur verschoben wurden, mit dem neuen Ort versehen statt löschen.
6. **Bewusst nicht anfassen:** `scripts/backtest-ladder.js` bleibt versioniert. Der Punkt hatte über mehrere Sitzungen fälschlich als „unbezogen" gegolten und ist tatsächlich fertige Arbeit am Progressionsthema.

### Abnahme

- [ ] Kein Dokument in `docs/` beschreibt gelöschten Code
- [ ] Kein Test bricht durch eine Verschiebung
- [ ] `docs/README.md` deckt jedes lebende Dokument ab
- [ ] Archiv ist als „gilt nicht mehr" gekennzeichnet

---

## Fenster DOK2 — .gitignore und .env.example

**Ziel:** Was nicht ins Repo gehört, landet nicht mehr darin.
**Vorbedingung:** Fahrplan 1 abgeschlossen.
**Modell:** `[HA]`

1. **Bestand zuerst prüfen, dann ergänzen — nicht blind die volle Liste eintragen.** Laut letzter Prüfung stehen `node_modules/`, `.env` und `app/dist/` bereits in der `.gitignore`. Erst die vorhandene Datei ansehen, dann nur das ergänzen, was wirklich fehlt:
   ```
   node_modules/
   dist/
   app/dist/
   .env
   .env.*
   !.env.example
   test-results/
   playwright-report/
   claude-code-prompt-*.md
   claude-code-freigabe-*.md
   .DS_Store
   *.log
   ```
2. **Prüfen, ob bereits versionierte Dateien betroffen sind.** `.gitignore` wirkt nicht rückwirkend — was schon im Index liegt, bleibt dort. Für jeden neuen Eintrag gegenprüfen und gegebenenfalls per `git rm --cached` entfernen.
3. **`.env.example` anlegen oder vervollständigen:** alle Variablen, die Frontend, `generate-data.js` und die GitHub Actions brauchen. Mit erklärendem Kommentar je Zeile, **ohne Werte**.
   > Vorsicht bei der Ermittlung: Ein `grep` auf Schlüsselnamen im Repo-Verzeichnis kann Zeilen samt Werten aus einer vorhandenen `.env` sichtbar machen — genau so entstand der Vorfall vom 30.07. Die Variablennamen aus dem Code ableiten, nicht aus der `.env`.
4. **`data/*.json` bleibt vorerst versioniert** — siehe Kasten unten.
5. **`README.md` in der Wurzel** überarbeiten: was das Projekt ist, wie man es lokal startet. Keine Hostnamen, keine Koordinaten, keine Klarnamen. Der frühere Privacy-Vorfall bleibt Maßstab.

> ### `data/*.json` gehört nicht in dieses Fenster
>
> Solange die GitHub-Pages-Seite die öffentliche Auslieferung übernimmt, lädt sie diese Dateien aus dem Repo. Werden sie hier ignoriert, geht die öffentliche Seite mit dem nächsten Deploy kaputt.
>
> Der Schritt gehört in **Fahrplan 3, Fenster DKR2** — dort, wo die Daten gleichzeitig in ein Container-Volume umziehen. Beides passiert im selben Commit oder gar nicht.

### Abnahme

- [ ] `git status` nach vollem Build und Testlauf ist sauber
- [ ] Kein Eintrag der `.gitignore` liegt noch im Index
- [ ] `.env.example` deckt alle im Code verwendeten Variablen ab
- [ ] Keine echten Werte in `.env.example`

---

## Fenster DOK3 — Runbook

**Ziel:** Der Betrieb ist ohne Gedächtnis bedienbar.
**Vorbedingung:** Fahrplan 3 bis einschließlich DKR6 abgeschlossen.
**Modell:** `[SO]`
**Warum erst hier:** Ein Runbook beschreibt echten Betrieb, keinen geplanten. Vorher geschrieben wäre es eine Absichtserklärung, die beim ersten Zwischenfall nicht trägt.

1. **`docs/runbook.md`** — jeweils mit dem konkreten Befehl, nicht mit einer Beschreibung des Befehls:
   - Erstinbetriebnahme auf einem leeren Host
   - Neue Version ausrollen
   - Migration einspielen und Anwendungsstatus prüfen
   - Backup manuell auslösen
   - **Restore** — der wichtigste Abschnitt, mit dem tatsächlich in DKR5 durchgeführten Ablauf
   - Logs lesen, einzelnen Dienst neu starten
   - Rollback auf das vorherige Image-Tag
   - Tabelle: Dienst, Port, Volume, Zweck
   - Häufige Fehlerbilder mit erster Maßnahme
2. **`docs/architektur-betrieb.md`:** Diagramm des Container-Verbunds, Datenflüsse, welcher Dienst welche Umgebungsvariablen braucht, wo die Grenze zwischen eigenem Stack und vorhandener Infrastruktur verläuft.
3. **Datenschutz-Abschnitt:** Auf dem Stack liegen Trainings- und Befindensdaten mehrerer Personen. Festhalten, wer Zugriff hat, wie lange Backups aufbewahrt werden, wie ein Löschwunsch umgesetzt wird. Die betroffenen Athleten einmal darüber informieren, wo ihre Daten liegen.
4. **`docs/offene-punkte.md`** um die bewusst offen gelassenen Betriebspunkte ergänzen: kein Mailversand, „Passwort vergessen" fehlt, kein Monitoring.
5. **`README.md` nachziehen** um einen Absatz zum Betrieb mit Verweis auf das Runbook.

### Abnahme

- [ ] Jeder Abschnitt enthält ausführbare Befehle
- [ ] Der Restore-Abschnitt beschreibt einen tatsächlich durchgeführten Vorgang
- [ ] Keine Hostnamen oder personenbezogenen Angaben im Repo
- [ ] Ein Außenstehender könnte den Stack allein aus dem Runbook neu aufbauen

---

## Anhang — Annahmen

1. `docs/archiv/` ist ein normaler Ordner im Repo, kein separater Branch.
2. Die vier Fahrpläne dieser Runde werden selbst nach `docs/` committet und gelten als lebende Dokumente, bis sie abgearbeitet sind.
3. Der Gesamtfahrplan behält seine Rolle als Überblick — inhaltliche Details werden nur in den vier Einzelfahrplänen gepflegt, damit keine zwei Fassungen derselben Aussage auseinanderlaufen.

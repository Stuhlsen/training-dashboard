# Fahrplan 1: Vanilla-Version entfernen

**Stand:** 13.08.2026
**Zielablage:** `docs/fahrplan-1-vanilla-entfernen.md`
**Herkunft:** entspricht F0 Teil 1 und Fenster A des Gesamtfahrplans

---

## Ziel

Der Vanilla-JS-Zweig verschwindet vollständig aus dem Repo. Übrig bleibt eine React-Anwendung unter `/app/`, eine Testsuite, ein Deployment-Pfad.

**Korrektur (Stand Prüfung 13.08.2026):** `core/` ist **keine** geteilte Schicht, wie ursprünglich angenommen. Es existieren zwei getrennte Ordner ohne Verbindung — `assets/js/core/` (nur von Vanilla importiert) und `app/src/core/` (nur von React importiert). Mindestens fünf Dateien sind bereits inhaltlich auseinandergelaufen (`plan-config.js`, `periodization.js`, `efficiency.js`, `export-briefing.js`, `proposal-payload.js`) — `app/src/core/` hat eigene Ergänzungen wie `addProposalArgs()`, die in der Vanilla-Kopie nie existierten. Diese Divergenz ist in `docs/offene-punkte.md` bereits dokumentiert. Für dieses Fenster heißt das: `assets/js/core/` **kann vollständig gelöscht werden**, sobald der Rest von `assets/js/` weg ist — `app/src/core/` lebt unabhängig weiter und ist von der Löschung nicht betroffen.

## Warum dieser Fahrplan zuerst kommt

Alle anderen Vorhaben werden dadurch kleiner. Die Doku-Aufräumrunde kann erst danach entscheiden, welches Dokument noch etwas Existierendes beschreibt. Der Docker-Umbau würde sonst Altlasten mit ins Image packen. Der Multi-Sport-Umbau müsste jede Änderung zweimal bauen.

## Abhängigkeiten zu den anderen Fahrplänen

| Beziehung | |
|---|---|
| Braucht vorher | nichts |
| Blockiert | Fahrplan 2 (Doku), Fahrplan 3 (Docker) |
| Läuft unabhängig neben | Fenster ATH1 aus Fahrplan 4 — das berührt nur `scripts/` |

## Fensterübersicht

```
V0   Funktionsgleichheits-Abgleich (read-only)   ◆ Entscheidungspunkt
V1   Lücken schließen                            (nur falls V0 welche findet)
V2   Vanilla-Code entfernen
V3   Datenbestand kennzeichnen
```

---

## Fenster V0 — Funktionsgleichheits-Abgleich

**Ziel:** Belastbar feststellen, ob 3.0 alles kann, was Vanilla konnte.
**Modell:** `[F5]`
**Wichtig:** Dieses Fenster ändert keine einzige Datei. Es liefert einen Bericht.

1. Alle Bereiche der Vanilla-Oberfläche unter `assets/js/ui/` auflisten: Hero, Übersicht, Planungstab, Charts/Explorer, Events, Export-Panel, Import-Dialog, Settings, Check-in, Feedback.
2. Für jeden Bereich prüfen, ob eine Entsprechung unter `app/` existiert und ob sie funktional vollständig ist.
3. Besonders prüfen — das sind die Portierungsposten, die zeitlich **nach** dem 3.0-Konzept entstanden sind und daher am ehesten fehlen:
   - Intervalltabelle inkl. `derived`-Badge
   - Compliance-Ampel
   - Wirkungsanzeige ΔFitness/ΔErmüdung/ΔForm auf den Karten
   - Ruhetag-/Recovery-Karten (Dreiteilung `rest`/`recovery`/keine Karte)
   - Leiterstand-Anzeige und Blockstart-Dialog
   - Stufenvorschlag inkl. „kein Vorschlag ableitbar" und „eingefroren (Taper)"
   - Leitplanken-Sektion mit K-RAMPE/K-HARTFOLGE/K-WOCHENTSS/K-TID
   - Fortschrittsindikatoren im Briefing
   - Hinweis-Chip mit Tooltip auf den Plankarten
4. **Testabdeckung ist Teil der Funktionsgleichheit.** Auflisten, welche Vanilla-Tests keine Entsprechung in der React-Testsuite haben. Ein Bereich, dessen Tests nur an Vanilla hingen, ist nach der Löschung ungetestet.
5. Prüfen, welche Dateien außerhalb von `assets/js/` noch auf Vanilla verweisen: Deployment-Workflow, `index.html` in der Wurzel, ESLint-Konfiguration, `package.json`-Skripte.
6. Ergebnis als Tabelle: **Bereich | in 3.0 vorhanden | vollständig | Lücke | Testabdeckung**.
   > Hinweis für dieses Fenster: Nach Stand der letzten Prüfung ist der React-Analyse-Tab (`app/src/features/analysis/`) weiter fortgeschritten als `docs/offene-punkte.md` allein vermuten lässt — dort steht ein veralteter Punkt „11a ✅ umgesetzt … offen wie 11b–11f", obwohl 11b–11g laut Konzeptdokument bereits umgesetzt sind. V0 sollte den tatsächlichen Code-Stand prüfen, nicht nur den offene-punkte.md-Eintrag übernehmen.
7. **Pfadangabe vereindeutigen.** Wo im weiteren Verlauf (auch in anderen Fahrplänen) von `core/plan-config.js`, `core/projection.js` o. ä. die Rede ist, ist das ein Kurzname — die tatsächlichen Pfade sind `assets/js/core/…` (Vanilla, wird in diesem Fenster gelöscht) oder `app/src/core/…` (React, bleibt). Im Abschlussbericht von V0 beide Pfade einmal explizit gegenüberstellen, damit spätere Fenster nicht raten müssen, welche Kopie gemeint ist.

### Abnahme

- [ ] Lückentabelle liegt vor
- [ ] Verweisliste aus Punkt 5 vollständig
- [ ] Keine Datei wurde verändert

### ◆ Entscheidungspunkt

Bericht abwarten.

- **Keine Lücken** → V1 entfällt, direkt zu V2.
- **Lücken vorhanden** → V1 einschieben. Vanilla wird nicht entfernt, solange etwas nur dort funktioniert.

---

## Fenster V1 — Lücken schließen

**Ziel:** Die in V0 gefundenen Funktionslücken in der React-Anwendung schließen.
**Vorbedingung:** V0 abgeschlossen.
**Modell:** je nach Lücke `[SO]`, bei Karten-/Briefing-Logik `[OP]`
**Nur ausführen, wenn V0 Lücken meldet.**

1. Lücken nach Aufwand sortieren und **einzeln** abarbeiten. Ein Bereich pro Durchgang, nicht alle gleichzeitig.
2. Für jede geschlossene Lücke: fehlende Tests gleich mitziehen, statt sie in die offenen Punkte zu schieben.
3. Nach jeder Lücke die Vanilla-Fassung als Referenz gegenprüfen — sie ist noch da, das ist der einzige Zeitpunkt, an dem ein direkter Vergleich möglich ist.
4. Erst wenn die Lückentabelle aus V0 vollständig abgehakt ist, geht es zu V2.

### Abnahme

- [ ] Jede Zeile der V0-Tabelle steht auf „vollständig"
- [ ] Testsuite grün

---

## Fenster V2 — Vanilla-Code entfernen

**Ziel:** Der Vanilla-Zweig ist weg, die Anwendung läuft weiter.
**Vorbedingung:** V0 ohne Lücken oder V1 abgeschlossen.
**Modell:** `[OP]`

1. **Sicherungstag setzen.** `git tag vanilla-final` auf den letzten Stand mit Vanilla-Code, gepusht. Die Historie bleibt ohnehin erhalten, aber ein benannter Punkt erspart späteres Suchen.
2. **Entfernen:** `assets/js/**` vollständig — **einschließlich `assets/js/core/`**, da das keine geteilte Schicht ist, sondern die Vanilla-eigene Kopie (siehe Korrektur oben). Dazu die Vanilla-`index.html`, Vanilla-spezifische CSS-Dateien, Vanilla-Tests unter `tests/`, zugehörige ESLint-Ausnahmen, tote `package.json`-Skripte.
3. **`app/src/core/` bleibt unangetastet.** Das ist die einzige Kopie, die danach noch existiert — sie wird durch dieses Fenster nicht verändert, nur die parallele Vanilla-Kopie verschwindet. `scripts/` bleibt ebenfalls vollständig erhalten (wird von der React-App über die Datenpipeline weiterhin gebraucht).
   > Vor der Löschung von `assets/js/core/` trotzdem einmal gegenprüfen: Importiert `scripts/` (insbesondere `generate-data.js` und die `lib/`-Module) irgendetwas aus `assets/js/core/`? Nach bisherigem Stand nein, aber das ist der einzige Pfad, über den eine versehentliche Kopplung bestehen könnte.
4. **Deployment-Status prüfen, nicht „umhängen".** Der GitHub-Pages-Workflow ist laut Stand vom 08.08.2026 bereits auf den React-Build umgestellt (Commits 913a84c, 09b2269) — dieser Schritt ist **kein offener, riskanter Umschalt-Schritt mehr**, sondern eine Bestätigungsprüfung: Im Browser nachsehen, dass die öffentliche Seite den React-Build zeigt und dass nach der Löschung von `assets/js/**` kein Workflow-Schritt mehr auf den jetzt fehlenden Pfad verweist.
5. **Testlauf:** `npm test` mit `--experimental-test-module-mocks` unter Node ≥22.3. Kein Test darf übersprungen sein.
6. **`docs/offene-punkte.md`** um alle Punkte bereinigen, die sich auf gelöschte Dateien beziehen — etwa `CONFIG.powerScaleMax` (toter Code in `assets/js/state/config.js`), die unerreichbare `Subjective.save()` in `ui/planned.js`, die core/-Divergenz-Notiz selbst (erledigt sich, sobald nur noch ein `core/`-Baum existiert) sowie die vier ESLint-Warnungen und weitere Vanilla-spezifische Zurückstellungen.

### Abnahme

- [ ] Keine Datei unter `assets/js/` mehr vorhanden, auch `assets/js/core/` nicht
- [ ] Testsuite grün, keine übersprungenen Tests
- [ ] Öffentliche Seite lädt im Browser und zeigt den React-Build
- [ ] `app/src/core/` unverändert (Diff gegengeprüft)
- [ ] Kein verbliebener Workflow-Schritt verweist auf `assets/js/`
- [ ] Tag `vanilla-final` existiert auf dem Remote

---

## Fenster V3 — Datenbestand kennzeichnen

**Ziel:** Die Plan-1-Altdaten stören keine Berechnung mehr, bleiben aber im Verlauf sichtbar.
**Vorbedingung:** V2 abgeschlossen.
**Modell:** `[SO]`
**Eigenes Fenster, weil es andere Dateien anfasst als V2** — dort Löschungen im UI-Zweig, hier Datenmodell und Filterlogik.

### Empfohlene Umsetzung: markieren statt löschen

Fahrten ohne `activityId` stammen aus der Notion-Ära (Plan 1) und sind strukturell nie mit Segmenten verknüpfbar. Sie bekommen ein Feld `era: "legacy"`.

**Wirkung:**

| | |
|---|---|
| **ausgeschlossen** | Kalibrierung, Typerkennung, Compliance, Leiterlogik, Klassifikator-Vergleichstabellen |
| **enthalten** | Langzeit-Verlaufscharts, FTP-Historie, Gesamtstatistiken |

**Begründung:** An diesen Fahrten hängt die FTP-Progression 166→193 W. Vollständiges Löschen wäre ein hoher Preis für Sauberkeit an einer Stelle, an der ein Flag denselben Zweck erfüllt. Die Alternative bleibt jederzeit offen; der umgekehrte Weg nicht.

1. Feld `era` in `scripts/lib/map-activity.js` setzen, abgeleitet aus dem Vorhandensein von `activityId`.
2. **Mit der bestehenden Kennzeichnung zusammenführen, keine zweite parallele einführen.** Es gibt bereits `dataSource: "notion"|"intervals"`. Prüfen, ob das dasselbe ausdrückt — wenn ja, `dataSource` weiterverwenden und `era` verwerfen. Zwei Felder für denselben Sachverhalt sind schlechter als eines.
3. Ausschlussfilter an den Eintrittspunkten setzen, nicht verstreut in jeder Auswertung.
4. **Vorher/Nachher-Nachweis:** Für beide Athleten ausgeben, welche Kennzahlen sich durch die Filterung ändern und welche nicht. Erwartung: Kalibrierungszahlen ändern sich, PMC und FTP-Verlauf nicht.
5. HRV-Methodenwechsel RMSSD→SDNN bleibt als eigenes Metadaten-Flag bestehen und wird **nicht** mit `era` vermischt.

### Abnahme

- [ ] Genau ein Feld kennzeichnet die Altdaten
- [ ] Vorher/Nachher-Vergleich dokumentiert
- [ ] Langzeit-Charts zeigen die Altfahrten weiterhin
- [ ] Testsuite grün

---

## Anhang — Annahmen

1. Die React-Anwendung ist bereits live und wird produktiv genutzt.
2. Die GitHub-Pages-Seite bleibt bestehen, bis der Docker-Cutover abgeschlossen ist.
3. `app/src/core/` und `scripts/` werden in keinem Fenster dieses Fahrplans verändert. `assets/js/core/` gehört zur Vanilla-Löschung (siehe Korrektur im Zielabschnitt) und ist keine geteilte Schicht.
4. Falls V0 sehr viele Lücken meldet, wird V1 selbst zu einem eigenen Vorhaben — dann wird dieser Fahrplan neu geschnitten statt V1 aufzublähen.

# Fahrplan 4: Dritter Athlet und Multi-Sport

**Stand:** 13.08.2026
**Zielablage:** `docs/fahrplan-4-athlet-3.md`
**Herkunft:** entspricht den Fenstern D-a, D-3a und D-3b des Gesamtfahrplans

---

## Ziel

Der dritte Athlet — ein Triathlet — ist vollständig angebunden. Lauf- und Schwimmeinheiten fließen in eine gemeinsame Belastungsrechnung ein, erscheinen in den Auswertungen und lassen sich planen. Für die Athleten 1 und 2 ändert sich dabei kein einziger Wert.

## Warum das der fachlich heikelste der vier Fahrpläne ist

Bei einem Triathleten ist Radfahren nicht die Gesamtbelastung. Würde man nur Rad-TSS ziehen, zeigten CTL, ATL und TSB für ihn systematisch zu niedrige Werte — die Belastungsempfehlung wäre für ihn schlicht falsch. Deshalb reicht „Athlet anlegen und syncen" nicht aus; die Kernschicht muss mit.

Und genau daraus folgt das Hauptrisiko: **Die Lastschicht ist gemeinsam.** Jede Änderung an `estimateTss()`, `core/projection.js` oder dem Governor trifft auch die beiden bestehenden Athleten und damit ihre gesamte Historie. Der Fahrplan ist so gebaut, dass diese Historie an jedem Schritt beweisbar unverändert bleibt.

> **Pfadhinweis:** `core/…` steht hier als Kurzname. Da dieser Fahrplan erst nach Fahrplan 1 startet (ab ATH2), ist damit ausschließlich `app/src/core/…` gemeint — die Vanilla-Kopie unter `assets/js/core/` existiert zu diesem Zeitpunkt nicht mehr. In ATH1, das vorgezogen und unabhängig läuft, kommt keiner dieser Pfade vor.

## Abhängigkeiten zu den anderen Fahrplänen

| Beziehung | |
|---|---|
| Braucht vorher | ATH1 nichts — läuft sofort. ATH2 bis ATH4 brauchen Fahrplan 1 und Fahrplan 3 |
| Blockiert | nichts |
| Läuft unabhängig neben | ATH1 kann parallel zu Fahrplan 1 und 2 laufen, es berührt nur `scripts/` |

**ATH1 wird bewusst vorgezogen**, obwohl es logisch später gehört. Datensammeln braucht Kalenderzeit: Die Kalibrierungsschwelle für D4a/D4b liegt bei rund 30 bewertbaren Karten, zuletzt waren es 12. Je früher der Zufluss steht, desto eher ist sie erreicht. Der Schritt ist klein und kollidiert mit nichts.

**ATH2 wird bewusst nach hinten gelegt.** Kernschicht-Umbau und Datenbankmigration dürfen nicht gleichzeitig laufen — sonst ist bei einem Fehler die Ursache nicht mehr zuzuordnen.

## Fensterübersicht

```
ATH1   Anbindung und Datenzufluss              (sofort, parallel möglich)
ATH2   Lastmodell und sports/-Modul            ◆◆ Kernschicht
ATH3   Anzeige und Auswertungen
ATH4   Planung und Trainer-Export
```

**Modell-Kürzel:** `[F5]` Architektur/Security/Debugging · `[OP]` Refactoring/State-Sync · `[SO]` Arbeitspferd · `[HA]` Kleinkram

---

## Fenster ATH1 — Anbindung und Datenzufluss

**Ziel:** Der Triathlet syncht. Radeinheiten laufen vollständig durch, Lauf und Schwimmen werden gespeichert, aber noch nicht ausgewertet.
**Vorbedingung:** keine. Läuft noch gegen die bestehende Cloud-Umgebung.
**Modell:** `[SO]`

### Schritte

1. **Profil anlegen.** Account in `dashboard-dev` und `prod`, Eintrag in `profiles` mit Rolle `athlete`. `is_admin` false, `ladder_progression_enabled` false, `wellbeing_public` false, `trainer_id` zunächst null.
2. **Secrets ergänzen.** `INTERVALS_API_KEY_3` und `INTERVALS_ATHLETE_ID_3` lokal in `.env`, als GitHub-Actions-Secret und später in der Server-`.env`.
   > **Kein `grep` auf Schlüsselnamen im Repo-Verzeichnis.** Der Secret-Vorfall vom 30.07. entstand genau so: Die Suche nach dem Variablennamen matchte die vollständige Zeile inklusive Wert und machte ihn im Transkript sichtbar.
3. **Athletenliste generalisieren.** Prüfen, ob `scripts/generate-data.js` die beiden Athleten fest verdrahtet oder über eine Liste iteriert. Falls fest verdrahtet: auf eine konfigurationsgetriebene Liste umstellen. **Ein vierter Athlet muss später reine Konfiguration sein, keine Codeänderung.**
4. **Sportart mitschreiben.** In `scripts/lib/map-activity.js` das `type`-Feld von intervals.icu in ein neues Feld `sport` normalisieren: `cycling` / `running` / `swimming` / `other`. Der gesamte Bestand bekommt `cycling`. **Nur schreiben, noch nicht auswerten.**
5. **Nicht-Rad-Aktivitäten durchreichen, aber neutralisieren.** Lauf- und Schwimmaktivitäten landen in `rides.json`, werden aber an den Eintrittspunkten aller bestehenden Auswertungen ausgefiltert (`sport === 'cycling'`). Ziel dieses Fensters ist **null Verhaltensänderung** für die Athleten 1 und 2.
6. **Bestehende Sonderlogik prüfen, nicht anfassen.** Die Typerkennung (`core/session-classify.js`), die Formatfamilien und die Compliance-Kette bleiben unverändert. Der neue Athlet läuft zunächst wie Athlet 2 — ohne Leiterfreigabe.
7. **Erster Sync-Lauf mit Bericht.** Ausgeben: Anzahl Aktivitäten je Sportart, abgedeckter Zeitraum, wie viele Aktivitäten `icu_training_load` tragen, wie viele Leistungsdaten haben, wie viele nur Herzfrequenz.

### Vorprüfung für ATH2 — der wichtigste Teil dieses Fensters

8. **An zehn echten Lauf- und Schwimmaktivitäten dokumentieren**, welche Lastmetrik intervals.icu liefert und worauf sie beruht: Leistung, Herzfrequenz, Pace oder Pauschalwert. Ausgeben als Tabelle mit Rohwerten.

   > **Diese Auswertung entscheidet, wie groß ATH2 wird.** Liefert die Quelle brauchbare, sportartübergreifend vergleichbare Werte, entfällt der Eigenbau von rTSS und sTSS vollständig — und ATH2 schrumpft von einem Modellierungsvorhaben auf eine Anbindung.

### Abnahme

- [ ] Sync läuft für drei Athleten durch
- [ ] Testsuite unverändert grün
- [ ] **Nachweis, dass CTL/ATL/TSB der Athleten 1 und 2 sich um exakt 0 verändert haben**
- [ ] Ein vierter Athlet wäre ein Konfigurationseintrag
- [ ] Bericht zu Schritt 8 liegt vor

### ◆ STOPP

Bericht abwarten. Aus Schritt 8 folgt die Lastquelle in ATH2 — das ist eine fachliche Entscheidung, keine technische.

---

## Fenster ATH2 — Lastmodell und `sports/`-Modul

**Ziel:** Lauf und Schwimmen fließen in eine gemeinsame CTL/ATL/TSB-Rechnung ein.
**Vorbedingung:** Fahrplan 1 abgeschlossen (nur noch eine Codebasis), Fahrplan 3 im Produktivbetrieb, ATH1-Bericht liegt vor.
**Modell:** `[F5]` für das Lastmodell, `[OP]` für die Portierung

### Absicherung zuerst

1. **Golden-Master-Test vor der ersten inhaltlichen Änderung.** Ein Test friert die heutigen CTL-, ATL- und TSB-Werte der Athleten 1 und 2 über den gesamten Verlauf ein — nicht nur den aktuellen Tageswert, sondern die Reihe.
   > **Bricht dieser Test später, wurde unbemerkt die eigene Historie verbogen.** Das ist die einzige Absicherung gegen einen Fehler, der sonst erst Wochen später auffällt, wenn niemand mehr weiß, welcher Schritt ihn verursacht hat.

### Lastquelle

2. **Entscheiden anhand des ATH1-Berichts:**
   - **Bevorzugt:** die von intervals.icu je Aktivität gelieferte Trainingslast übernehmen. Die Quelle rechnet sportartübergreifend und fällt bei fehlenden Leistungsdaten auf Herzfrequenz zurück.
   - **Nur falls die Werte unbrauchbar sind:** herzfrequenzbasierte Ersatzlast im eigenen Code, mit ausdrücklich gekennzeichneter Unsicherheit.
   - **Nicht bauen:** eigene rTSS-/sTSS-Modelle mit Schwellenpace, GAP und kritischer Schwimmgeschwindigkeit. Das ist ein eigenes Vorhaben, kein Schritt hier.
3. **Skalenherkunft sichtbar halten.** Die bekannte Vermischung in `core/projection.js` — echter TSS für die Vergangenheit, TRIMP-Näherung mit Faktor 0.58 für die Zukunft, sichtbar über das `scale`-Feld aus `estimateTss()` — darf sich durch Multi-Sport nicht verschlimmern. Das `scale`-Feld wird um die Sportart-Herkunft erweitert, damit jederzeit ablesbar bleibt, aus welchen Bestandteilen sich ein CTL-Wert speist.

### Struktur

4. **`sports/`-Modul befüllen.** Bisher existiert nur `cycling/` — die Struktur wurde im 3.0-Umbau bewusst vorbereitet, aber nicht gebaut. Neu: `running/` und `swimming/`. Jedes Modul liefert dieselbe Schnittstelle: Lastermittlung, Anzeigename, Symbol, welche Metriken sinnvoll sind, welche Zonenlogik gilt.
5. **`estimateTss()` erweitern:** Typ-Vorgabewerte je Sportart statt eines gemeinsamen Satzes. Eine geplante Laufeinheit ohne Lastangabe darf nicht mit Rad-Vorgabewerten geschätzt werden.
6. **Governor gegenrechnen.** Die Belastungsempfehlung arbeitet mit Fitness, Ermüdung und Form. Diese Werte werden bei einem Triathleten durch die Zusatzsportarten größer.
   > **Mit den auf Radbelastung kalibrierten Schwellen aus `core/plan-config.js` würde das System ihm dauerhaft Ruhe empfehlen.** Entweder die Schwellen werden relativ zur individuellen Belastungshöhe gerechnet, oder sie werden je Athlet konfigurierbar. Entscheiden und begründen — nicht stillschweigend übernehmen.

### Abgrenzung

7. **Die Progressionsleiter bleibt radspezifisch.** Formatfamilien, `ladder_history`, Compliance über `workout_structure`, `session_formats` und `athlete_formats` sind vollständig auf Rad-Intervalle gebaut. Lauf und Schwimmen bekommen **keine** Leiter. Diese Grenze wird im Code als bewusste Grenze kenntlich gemacht, damit sie später absichtlich verschoben werden kann statt versehentlich zu bröckeln.

### Abnahme

- [ ] Golden-Master-Test grün: Athleten 1 und 2 unverändert
- [ ] Athlet 3 zeigt eine PMC, die alle drei Sportarten enthält
- [ ] Herkunft der Lastwerte je Sportart im Code dokumentiert, nicht nur im Kopf
- [ ] Governor-Entscheidung aus Schritt 6 schriftlich begründet
- [ ] Volle Testsuite grün

### ◆◆ STOPP

Bericht abwarten. Ohne grünen Golden-Master geht es nicht weiter.

---

## Fenster ATH3 — Anzeige und Auswertungen

**Ziel:** Die Oberfläche zeigt drei Sportarten, ohne für den Radfahrer unübersichtlicher zu werden.
**Vorbedingung:** ATH2 abgeschlossen und im Betrieb bestätigt.
**Modell:** `[SO]`

1. **Sportart-Kennzeichnung** auf Karten, im Fahrtenbuch und in Listen. Zurückhaltend — ein Symbol, keine zusätzliche Zeile.
2. **PMC standardmäßig als Gesamtlast**, mit optionaler Aufschlüsselung je Sportart. Der Standardfall bleibt der einfache: eine Kurve.
3. **Filter je Sportart** in den Charts. Für die Athleten 1 und 2 darf der Filter nicht sichtbar sein, solange sie nur eine Sportart haben — sonst wird die Oberfläche für zwei von drei Nutzern schlechter.
4. **Zonenlogik prüfen.** Die Zonenzeiten der Rohdaten hängen an der FTP, die intervals.icu zum Fahrtzeitpunkt zugrunde gelegt hat. Für Lauf und Schwimmen gelten andere Bezugsgrößen. Alle Zonenauswertungen bekommen einen Sportart-Vorbehalt, damit keine Rad-Zonen auf Laufdaten angewendet werden.
5. **Wochenrückblick und Konsistenzkalender** auf Multi-Sport erweitern: Wochensummen als Gesamtlast plus Aufteilung.
6. **Athletenumschalter prüfen.** Der Wechsel zwischen drei statt zwei Athleten darf keine Zustandsreste hinterlassen — der frühere Athletenwechsel-Leak in der Event-Timeline ist das Muster, auf das hier zu achten ist.

### Abnahme

- [ ] Ansichten der Athleten 1 und 2 sind optisch unverändert
- [ ] Athlet 3 zeigt alle drei Sportarten sinnvoll
- [ ] Kein Zustandsrest beim Wechsel zwischen allen drei Athleten (Playwright)

---

## Fenster ATH4 — Planung und Trainer-Export

**Ziel:** Planungstab und Export funktionieren für alle drei Sportarten.
**Vorbedingung:** ATH3 abgeschlossen.
**Modell:** `[SO]`

1. **Migration:** `plan_cards` bekommt eine Sportart, Vorgabe `cycling` für den Bestand. Über den Migrations-Runner aus Fahrplan 3 eingespielt, damit der Anwendungsstatus abfragbar bleibt.
2. **Typenkatalog je Sportart erweitern.** Bei dieser Gelegenheit die seit längerem dokumentierte Vokabular-Inkonsistenz bereinigen: Eine Plankarte bei Athlet 2 trägt den Typ `Race` statt `Rennen` und fällt dadurch in `INTENSITY_CLASS` auf den Default „moderat".
3. **Kartenformular:** Sportartauswahl, davon abhängige Typenliste und Zielgrößen. Für Lauf sind Distanz und Pace relevant, für Schwimmen Distanz und Zeit — nicht Watt.
4. **Konfliktregeln entscheiden.** K-HARTFOLGE, K-WOCHENTSS und K-TID sind auf Radbelastung kalibriert. Zwei Wege: sportartübergreifend neu kalibrieren oder je Sportart getrennt bewerten. **Entscheiden und begründen, nicht stillschweigend übernehmen** — bei einem Triathleten ist eine harte Laufeinheit nach einer harten Radeinheit genau der Fall, den K-HARTFOLGE abfangen soll.
5. **Ruhetagslogik prüfen.** Die Dreiteilung `rest` / `recovery` / keine Karte gilt sportartübergreifend und muss es auch bleiben — ein Ruhetag ist kein Radruhetag.
6. **Export-Briefing und Prompt-Vorlage** um die Sportart erweitern. Der Konsistenztest zwischen `PROMPT_TEMPLATE` und `docs/phase-4-prompt-vorlage-claude-trainer.md` muss mitwachsen; er prüft die Vorlagenbeispiele gegen den echten Validator.
7. **Validator und Import-Parser** um das Sportartfeld ergänzen, mit Regressionstest für Vorschläge ohne Sportartangabe — die müssen weiterhin akzeptiert und als `cycling` gewertet werden.
8. **Trainer-Zuordnung entscheiden:** eigener Trainer für Athlet 3, Zuordnung zu einem bestehenden, oder Claude als Trainer. Bis dahin bleibt `trainer_id` null.

### Abnahme

- [ ] Karten aller drei Sportarten anlegbar, verschiebbar, löschbar
- [ ] Export erzeugt ein gültiges Briefing für einen Multi-Sport-Athleten
- [ ] Import akzeptiert Vorschläge mit und ohne Sportartangabe
- [ ] Konfliktregel-Entscheidung aus Schritt 4 dokumentiert
- [ ] RLS-Suite grün — drei Athleten, unveränderte Sichtbarkeitsregeln

---

## Anhang — Annahmen

1. Athlet 3 bekommt einen eigenen Login, zunächst ohne Trainer-Zuordnung
2. Leiterfreigabe (`ladder_progression_enabled`) bleibt für ihn dauerhaft aus, solange die Leiter radspezifisch ist
3. `wellbeing_public` bleibt aus, Sichtbarkeit wie bei Athlet 2
4. Der Morgen-Check-in gilt unverändert sportartübergreifend
5. Die FTP-Historie bleibt eine Rad-Größe; Lauf- und Schwimmschwellen werden in dieser Ausbaustufe nicht gepflegt
6. Ein späterer vierter Athlet ist nach ATH1 reine Konfiguration

## Anhang — Bewusst nicht enthalten

- Eigene rTSS-/sTSS-Modelle mit Schwellenpace, GAP und kritischer Schwimmgeschwindigkeit
- Progressionsleiter für Lauf und Schwimmen
- Sportartspezifische Zonenmodelle mit eigener Schwellenpflege
- Wettkampfspezifische Triathlon-Logik (Disziplinwechsel, Bricks, Rennverpflegung)
- `alternating`-Parser für Over-Under — betrifft weiterhin nur Athlet 2 und hängt an einem anderen Strang

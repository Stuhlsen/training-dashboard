> **Archiviert (Fahrplan 2, DOK1, 15.08.2026).** Beschreibt einen überholten Stand. Gilt nicht mehr für den aktuellen Code — nur als historischer Kontext.

# Phase 4 — Konzept: Export/Import-Workflow-Mechanismus [OP]

> **Ziel:** Nicht *was* exportiert wird (steht in `docs/phase-4-konzept-vorschlags-schema.md`
> §6) und nicht *was* Claude antworten soll (steht in
> `docs/phase-4-prompt-vorlage-claude-trainer.md`), sondern *wie* der Athlet den Export
> auslöst, das Ergebnis nach Claude trägt, Claudes Antwort zurückbringt und wie daraus
> `proposals`-Zeilen werden. Reiner Mechanismus, dateibasiert/Copy-Paste — kein
> Claude-API-Aufruf aus der App (Fahrplan-Entscheidung).
>
> **Abhängigkeiten:** `docs/phase-4-konzept-trainer-sicht.md` (Claude hat keinen
> Account, `created_by` = der Athlet selbst), `docs/phase-4-konzept-vorschlags-schema.md`
> (Schema v1, `core/proposal-validator.js`, Vergleichsansicht §5), Prompt-Vorlage
> (fix, `{{BRIEFING}}`-Platzhalter). `proposals`-Tabelle und
> `data-access/supabase/proposals.js` existieren noch nicht — beide entstehen im
> Umsetzungsschritt, dieses Konzept legt nur ihre Nutzung durch den Import fest.

---

## 1. Einstiegspunkt im UI

Kein neuer Tab. Zwei Buttons **„Export für Claude"** und **„Vorschläge importieren"**
in einer schmalen Leiste oben im Planungstab — analog zur Trainer-Leiste
(Trainer-Sicht-Konzept §5), aber mit eigenem Sichtbarkeits-Gate: Die Trainer-Leiste
erscheint, wenn der eingeloggte Nutzer *der Trainer* des angezeigten Athleten ist;
diese Leiste erscheint, wenn der Athlet *seinen eigenen* Plan ansieht — unabhängig
davon, ob `profiles.trainer_id` gesetzt ist. Claude ist ein Trainer ohne Account, der
Athlet betätigt den Workflow also immer selbst.

Gate identisch zum bestehenden `_canEdit()`-Muster in `ui/planned.js`
(`Data.activeAthleteId === CONFIG.primaryAthleteId`-artiger Vergleich mit der
Session-Athleten-Zuordnung). Athlet 2 (read-only-Planungstab) ist dadurch automatisch
ausgeschlossen, ohne eine neue Sonderregel — dieselbe Logik, die heute schon
Verschieben/Ausfallen/Push für Athlet 2 verbirgt.

## 2. Export: Auslösung, Inhalt, Format

**Auslösung:** Klick auf „Export für Claude" öffnet einen Dialog im bestehenden
Overlay+Modal-Stil (`checkin-dialog.js`/`plan-card-dialog.js`: dunkles Overlay,
`.planned-card`-verwandte Glas-Optik, Escape schließt).

**Inhalt (fest, kein Zeitraum-Regler in v1):**

| Bestandteil | Umfang |
|---|---|
| Profil, Events, Zonen | vollständig (klein, kein Grund zu kürzen) |
| Plan-Fenster | alle `plan_cards` mit `plan_date >= heute`, kein Enddatum-Cutoff (Planhorizont ist ohnehin auf ~12 Wochen begrenzt) — inkl. `id` + `updated_at` je Karte (Pflicht laut Schema-Konzept §6) |
| Ist-Fahrten | letzte 4 Wochen (TSS, Typ, RPE/Feel) |
| Wellbeing-Verlauf | letzte 4 Wochen (Slider + eigene Notiz — der Athlet exportiert seine eigenen Daten, T1-Trainer-Toggle betrifft nur menschliche Trainer, nicht den Selbstexport) |
| CTL/ATL/TSB + Projektion + Konfliktliste | aktueller Stand aus `core/projection.js`/`core/conflicts.js` — derselbe Zustand, den der Planungstab gerade anzeigt |

4 Wochen Ist-Daten ist ein fester Startwert, kein austariertes Optimum — falls sich in
der Praxis zeigt, dass Claude mehr/weniger Historie braucht, ist das eine spätere
Konstanten-Anpassung, kein Konzeptbruch.

**Format (fest, kein Zeitraum-Regler, aber zwei Ausgabewege):** Der Export-Generator
erzeugt **eine** Zeichenkette — die feste Prompt-Vorlage mit dem gerenderten Briefing
an Stelle von `{{BRIEFING}}` bereits eingesetzt. Der Athlet bekommt also einen
fertigen, direkt einfügbaren Text, keine zwei Teile, die er selbst zusammensetzen
müsste. Dieselbe Zeichenkette wird auf zwei Wegen angeboten:

- **Textfeld** (`<textarea readonly>`, vorbefüllt) + „In Zwischenablage kopieren"
  (`navigator.clipboard.writeText`) — der direkte Weg für „einfügen in Claude Pro".
- **„Als Datei herunterladen"** (`Blob` + `<a download>`, Dateiname
  `claude-briefing-<athleteId>-<YYYY-MM-DD>.md`) — für Athleten, die lieber eine
  Datei hochladen oder das Briefing aufheben.

Beide Wege lesen aus derselben generierten Zeichenkette, keine zweite
Formatierungslogik. Datenschutz: Enthält ausschließlich Daten des Athleten selbst
(kein `athlete2`/Fremdzugriff möglich, da über die Session-Athleten-Zuordnung erzeugt)
und keine Standortkoordinaten (die liegen ohnehin nie im Frontend-State).

**Layer:** Formatierung als reine Funktion in `core/` (z. B.
`core/export-briefing.js`, nimmt fertig geladene Domänenobjekte entgegen, kein
`fetch`/`document`) — testbar wie jedes andere `core/`-Modul. Die feste
Prompt-Vorlage (Text aus `docs/phase-4-prompt-vorlage-claude-trainer.md`) wird als
Konstante mit `{{BRIEFING}}`-Platzhalter in `core/` gepflegt, damit Vorlage und
Validator laut eigener Aussage der Vorlage „im selben Commit" ändern können. Die
Datensammlung (Events/Plan/Wellbeing/Projektion aus den jeweiligen `state/`-Modulen
zusammenziehen) sitzt in `state/`, der Dialog in `ui/` ruft nur `state/` auf.

## 3. Import: Eingabe, Extraktion, Parser

**Eingabe (zwei Wege, ein interner Pfad):** Der Import-Dialog hat ein
`<textarea>` zum Einfügen der **kompletten Claude-Antwort** (Text + JSON-Block, nicht
nur den JSON-Teil — der Athlet muss nichts selbst heraustrennen) und einen
Datei-Upload daneben. Datei-Upload liest den Dateiinhalt per `FileReader` und schreibt
ihn **in dasselbe Textfeld** — es gibt intern nur einen Eingabepfad, Upload ist nur
eine bequeme Art, das Textfeld zu befüllen. Das vermeidet jede
Vorrang-Frage („was gilt, wenn beides ausgefüllt ist") von vornherein.

**Extraktion:** `core/proposal-import-parser.js` (rein, testbar) sucht im Text den
**letzten** ```` ```json ````-Codeblock per Regex (die Prompt-Vorlage garantiert laut
ihren eigenen Anmerkungen genau „ein Block am Ende" — der Parser ist trotzdem
tolerant und nimmt bei mehreren Blöcken deterministisch den letzten, statt bei
Abweichung einfach zu scheitern). Kein Codeblock gefunden → eigener Fehlerzweig
„Kein JSON-Block gefunden" (siehe §6), unabhängig von der eigentlichen
Feldvalidierung.

**Parser → Validator:** Der extrahierte Block wird `JSON.parse`t (Fehler dabei →
eigener Fehlerzweig, §6) und danach unverändert an `core/proposal-validator.js`
(Schema-Konzept §4) übergeben. Der Import-Parser kennt keine Feldregeln — die bleiben
vollständig im Validator, damit App-Pfad (menschlicher Trainer) und Import-Pfad
garantiert dieselbe Prüfung durchlaufen.

## 4. Validierung & Vorschau vor dem Insert

Import-Dialog folgt demselben Aufbau wie `plan-card-dialog.js`/`checkin-dialog.js`
(Overlay+Modal, `openToken`-Race-Guard, Inline-Fehlerbereich in `--red`).

**Ablauf nach „Prüfen":**

1. `athlete`-Feld aus dem JSON gegen die eigene Profil-ID des eingeloggten Athleten
   prüfen — **vor** allem anderen (s. §6, harter Abbruch, keine Teilprüfung).
2. `schema_version` prüfen — unbekannt/fehlend ⇒ harter Abbruch der gesamten Datei
   (strukturelle Prüfung, Schema-Konzept §4).
3. Jeden Eintrag in `proposals[]` einzeln durch `core/proposal-validator.js` — Ergebnis
   ist eine Liste mit Status pro Eintrag, nicht nur ein globales Ja/Nein.
4. Der Dialog rendert eine **Vorschau-Liste**: pro Vorschlag eine Zeile mit `op`,
   betroffener Karte (Titel/Datum bei `replace`/`move`/`cancel`, „neue Karte" bei
   `add`), `reason`, und Status — ✅ valide oder ❌ mit der/den gesammelten
   Fehlermeldungen (Schema-Konzept §4: „alle Fehler gesammelt, nicht nur der erste").

**Teilerfolg (z. B. 4 von 5 valide):** Der „Importieren"-Button bleibt aktiv, solange
mindestens ein Eintrag valide ist, und importiert **nur die validen** — fehlerhafte
Einträge werden übersprungen und bleiben in der Vorschau als „nicht importiert:
Grund" stehen (kein automatisches Neuformulieren, kein Teil-Fix durch die App). Das ist
dieselbe Vorschau, die als Bestätigung vor dem eigentlichen Speichern dient — kein
zusätzlicher zweiter „Sicher?"-Schritt danach.

## 5. Von validiertem JSON zu `proposals`-Zeilen

Kein separater Zwischenspeicher: Die Vorschau in §4 **ist** die Vorab-Ansicht: Klick auf
„Importieren" übergibt die validen Einträge direkt an denselben Insert-Pfad, den auch
der menschliche Trainer nutzt (Schema-Konzept §3) — `data-access/supabase/proposals.js`
(entsteht im Umsetzungsschritt zusammen mit der `proposals`-Tabelle), pro Eintrag
`created_by` = die eigene Profil-ID des Athleten, `source: "claude"`. Alle validen
Einträge eines Imports teilen sich eine `group_id`, damit sie im Review als
zusammengehörige Runde erscheinen und über „Alle übernehmen" (Schema-Konzept §5, V1)
gemeinsam angenommen werden können.

Nach dem Insert schließt der Dialog und die bestehende Review-Oberfläche (Banner,
Zähler, Vergleichsansicht aus Schema-Konzept §5) übernimmt vollständig — der
Import-Dialog selbst zeigt keine zweite, eigene Annehmen/Ablehnen-Logik. Das deckt
sich mit der bereits getroffenen Entscheidung V1: „Claude-Importe landen immer als
offene Vorschläge im Review-Flow, keine Review-Umgehung beim Import."

**Layer:** Insert-Aufruf sitzt in `state/` (z. B. eine neue `importClaudeProposals()`
in einem noch zu benennenden `state/proposals.js`, analog zu `state/plan-cards.js`),
ruft `data-access/` auf. Parser+Validator bleiben in `core/`, der Dialog in `ui/`
kennt nur `state/`.

## 6. Fehlerfälle jenseits der Feldvalidierung

| Fall | Reaktion |
|---|---|
| `athlete`-Feld ≠ eigene Profil-ID | Harter Abbruch der **gesamten** Datei, eigene Fehlermeldung („Dieser Export gehört zu einem anderen Account") — keine Vorschau, kein Teilimport. Strukturelle Prüfung vor allem anderen (§4, Schritt 1). |
| Kein ```` ```json ````-Block im Text gefunden | Eigener Fehlerzweig vor der Validierung: „Kein JSON-Block in der eingefügten Antwort gefunden" — unterscheidet sich sichtbar von einem Validierungsfehler, damit der Athlet weiß: das ist ein Copy-Paste-Problem, keine inhaltliche Ablehnung. |
| Extrahierter Block ist kein gültiges JSON | Eigener Fehlerzweig „JSON-Block ist beschädigt/unvollständig" (z. B. Antwort mitten im Kopieren abgeschnitten). |
| `schema_version` fehlt/unbekannt | Harter Abbruch der gesamten Datei (§4, Schritt 2) — kein Versuch, ein altes Schema tolerant zu lesen. |
| Doppelter Import derselben Datei | **Keine Dedup-Erkennung in v1.** Jeder Import erzeugt neue offene `proposals`-Zeilen, unabhängig von vorherigen Importen. Der Athlet sieht doppelte Vorschläge im Review wie jeden anderen offenen Vorschlag und lehnt sie dort ab — Erkennung „das hatte ich schon" würde einen Content-Hash oder Zeitfenster-Vergleich brauchen, der nirgends sonst im Schema vorgesehen ist. Als bewusste v1-Einschränkung in `docs/offene-punkte.md` vermerkt (s. u.). |

## 7. Abgrenzung zu Bestehendem

Explizit festgehalten, damit es später nicht versehentlich anders gebaut wird: **Kein
Claude-API-Aufruf aus der App**, an keiner Stelle dieses Workflows. Export und Import
sind reine Text-Transformationen (Formatierung, Regex-Extraktion, JSON-Validierung) —
keine Netzwerkanfrage an Anthropic, kein Service-Account, keine Live-Verbindung. Der
Athlet ist in jedem Schritt selbst der Bote zwischen App und Claude (Copy-Paste oder
Dateitransfer), wie in der Trainer-Sicht bereits festgelegt.

---

## Getroffene Entscheidungen

- Einstiegspunkt: eigene Leiste im Planungstab, Gate = „eigener Plan" (wie
  `_canEdit()`), unabhängig von `trainer_id`. ✅
- Export erzeugt die **fertige** Prompt-Vorlage inkl. eingesetztem Briefing als eine
  Zeichenkette — der Athlet setzt nichts selbst zusammen. ✅
- Export-Ausgabe: **Textfeld mit Kopieren-Button UND Datei-Download**, beide aus
  derselben generierten Zeichenkette. ✅ *(Nutzerentscheidung)*
- Export-Default-Zeitraum: **fest, kein Regler** — Plan-Fenster ohne Enddatum-Cutoff,
  Ist-Daten/Wellbeing letzte 4 Wochen. ✅ *(Nutzerentscheidung)*
- Import-Eingabe: **Textfeld (komplette Antwort) UND Datei-Upload**, Upload befüllt
  intern nur dasselbe Textfeld — ein Eingabepfad, keine Vorrang-Frage. ✅
  *(Nutzerentscheidung)*
- Extraktion: letzter ```` ```json ````-Block per Regex in `core/proposal-import-parser.js`,
  getrennt vom Feld-Validator. ✅
- Vorschau vor dem Insert = zugleich die Bestätigung; kein zweiter Sicherheits-Dialog. ✅
- Teilerfolg: valide Einträge werden importiert, fehlerhafte übersprungen und in der
  Vorschau sichtbar gehalten. ✅
- Falsche `athlete_id`/unbekannte `schema_version`: harter Abbruch der gesamten Datei,
  keine Teilprüfung. ✅
- Keine Dedup-Erkennung für doppelte Importe in v1 — zurückgestellt, siehe
  `docs/offene-punkte.md`. ✅

# Fahrplan 0: Übersicht

**Stand:** 13.08.2026
**Zielablage:** `docs/fahrplan-0-uebersicht.md`
**Rolle:** Einstiegsdokument. Enthält Zielbild, Entscheidungen, Abhängigkeiten und Reihenfolge — **keine Schrittdetails.** Die stehen ausschließlich in den Fahrplänen 1 bis 4.

---

## 1. Zielbild

Nach Abschluss aller vier Fahrpläne gilt:

- Der Vanilla-JS-Code ist entfernt, inklusive der Vanilla-eigenen `assets/js/core/`-Kopie. Das Projekt besteht ausschließlich aus der React-/Vite-Anwendung unter `/app/` mit `app/src/core/`. Es gibt nur noch eine `core/`-Kopie, nicht zwei getrennte wie vor der Prüfung vom 13.08.2026 angenommen.
- Das Repo enthält keine generierten Artefakte, keine Arbeitsaufträge und keine überholte Dokumentation.
- Anwendung, Datenbank, Authentifizierung und Datensynchronisierung laufen als Container-Verbund über eine `docker compose`-Datei auf einem eigenen Server. Die Supabase-Cloud entfällt.
- Der Betrieb ist portabel: Ein Umzug auf einen beliebigen anderen Host besteht aus `docker compose up`, einer `.env` und einem Datenbank-Dump.
- Ein dritter Athlet (Triathlet) ist angebunden. Lauf- und Schwimmeinheiten fließen in eine gemeinsame Belastungsrechnung ein.

---

## 2. Getroffene Grundsatzentscheidungen

| Thema | Entscheidung | Begründung |
|---|---|---|
| Frontend | Ausschließlich React. Vanilla wird entfernt, nicht archiviert | Git behält die Historie; ein Legacy-Ordner sammelt nur Verwirrung |
| Doku | Kanon aus lebenden Dokumenten, Historisches nach `docs/archiv/`, Totes gelöscht | |
| Container-Umfang | Schlanker Self-Host-Stack: Postgres, GoTrue, PostgREST, Reverse Proxy | Vier Dienste statt zehn. Was die Anwendung nachweislich nicht nutzt, wird nicht betrieben |
| Hosting | Eigener Server, Einbindung in vorhandenen Reverse Proxy | |
| Datenbestand | Alt-Fahrten markieren statt löschen (`era`-Flag) | An ihnen hängt die FTP-Progression 166→193 W |
| Dritter Athlet | Voller Multi-Sport mit gemeinsamer Belastungsrechnung | Rad-only-CTL wäre bei einem Triathleten schlicht falsch |
| Progressionsleiter | Bleibt radspezifisch | Formatfamilien und Compliance sind auf Rad-Intervalle gebaut |

---

## 3. Konstruktionsziele

Stichworte — der Volltext mit Begründung steht in `fahrplan-3-docker-umbau.md` (Punkte 1–5, dort führend) und `fahrplan-4-athlet-3.md` (Punkt 6, dort als Golden-Master-Prinzip):

1. Portabilität vor Bequemlichkeit
2. Ein Image, mehrere Umgebungen
3. Nichts Unversioniertes auf dem Server
4. Jede Migration hat einen abfragbaren Anwendungsstatus
5. Ein Backup ohne durchgeführten Restore zählt nicht als Backup
6. Bestehende Athleten bleiben beweisbar unverändert

---

## 4. Die vier Fahrpläne

| Dokument | Fenster | Inhalt in einem Satz |
|---|---|---|
| `fahrplan-1-vanilla-entfernen.md` | V0–V3 | Funktionsgleichheit prüfen, Lücken schließen, Vanilla löschen, Altdaten kennzeichnen |
| `fahrplan-2-doku-aufraeumen.md` | DOK1–DOK3 | Doku-Kanon, `.gitignore`, Runbook nach dem Docker-Umbau |
| `fahrplan-3-docker-umbau.md` | DKR0–DKR6 | Nutzungsinventar, Images, Sync-Container, Self-Host-Stack, Server, Datenmigration, Cutover |
| `fahrplan-4-athlet-3.md` | ATH1–ATH4 | Anbindung, Lastmodell, Anzeige, Planung und Export |

**18 Fenster insgesamt.** Jedes hat Ziel, Vorbedingung, nummerierte Schritte, Abnahmekriterien und Modellempfehlung.

---

## 5. Abhängigkeiten

```
V0 ─→ V1 ─→ V2 ─→ V3 ─┬─→ DOK1 ─→ DOK2 ─┬─→ DKR0 ─→ DKR1 ─→ DKR2
                       │                  │
                       │                  └─→ DKR3 ─→ DKR4 ─→ DKR5 ─→ DKR6
                       │                                                │
                       │                                    ┌───────────┴──→ DOK3 (Runbook)
                       │                                    │
ATH1 ──────────────────┴────────────────────────────────────┴──→ ATH2 ─→ ATH3 ─→ ATH4
```

| Fahrplan | Braucht vorher | Blockiert |
|---|---|---|
| 1 Vanilla | nichts | 2, 3 |
| 2 Doku | 1 (DOK3 zusätzlich: DKR6) | 3 ab DKR0 |
| 3 Docker | 1, 2 bis DOK2 | 2/DOK3, 4 ab ATH2 |
| 4 Athlet 3 | ATH1 nichts, ab ATH2: 1 und 3 | nichts |

**Begründung der Reihenfolge:**

- **V0 zuerst und read-only.** Ohne Lückenbericht wäre jede Löschung geraten.
- **ATH1 vorgezogen**, obwohl es logisch später gehört: Datensammeln braucht Kalenderzeit, die Kalibrierungsschwelle liegt bei rund 30 bewertbaren Karten (zuletzt 12). Berührt nur `scripts/`, kollidiert mit nichts.
- **Vanilla vor Docker**, sonst wandern Altlasten ins Image und das Dockerfile wird zweimal geschrieben.
- **Doku nach Vanilla**, weil erst danach feststeht, welches Dokument noch etwas Existierendes beschreibt.
- **Runbook (DOK3) nach dem Cutover**, weil es echten Betrieb beschreibt, keinen geplanten.
- **Multi-Sport ganz nach hinten:** Kernschicht-Umbau und Datenbankmigration dürfen nicht gleichzeitig laufen, sonst ist bei einem Fehler die Ursache nicht zuzuordnen.

**Sofort parallel startbar:** V0 und ATH1. Sie teilen sich keine Datei.

---

## 6. Kontrollpunkte

Fenster, nach denen zwingend ein Bericht abgewartet wird:

| Fenster | Warum |
|---|---|
| **V0** | Entscheidet, ob Vanilla überhaupt gelöscht werden darf |
| **DKR0** | Das Nutzungsinventar bestimmt den Umfang des Self-Host-Stacks |
| **DKR1** | Nachweis: ein Image, zwei Konfigurationen, kein Neubau |
| **DKR3** | Härtester Punkt. Ohne grüne RLS-Suite 28/28 geht es nicht weiter |
| **DKR5** | Restore-Probe durchgeführt — vor dem Cutover, nicht danach |
| **ATH1** | Die Lastquellen-Analyse entscheidet, wie groß ATH2 wird |
| **ATH2** | Golden-Master grün: bestehende Athleten unverändert |

---

## 7. Arbeitsweise

- **Pro Fenster ein frischer Claude-Code-Chat.** Nur der Auftrag rein, nur der Abschlussbericht raus.
- **Planungschat wechseln** nach DKR2 und nach DKR6, um den Kontext klein zu halten.
- **Modell-Kürzel:** `[F5]` Architektur/Security/Debugging · `[OP]` Refactoring/State-Sync · `[SO]` Arbeitspferd · `[HA]` Kleinkram
- **Umgebung:** PowerShell, keine `&&`-Verkettung. Node ≥22.3, `npm test` mit `--experimental-test-module-mocks`. Deutsche Commit-Prefixes.

---

## Anhang A — Annahmen

Vollständige Liste je Fahrplan in dessen eigenem Anhang. Fahrplanübergreifend gelten zusätzlich:

- Eigene Subdomain, TLS über den auf dem Zielserver vorhandenen Reverse Proxy (Details: Fahrplan 3)
- Die GitHub-Pages-Seite bleibt bis zum Cutover bestehen; danach wird entschieden (Details: Fahrplan 3)
- Athlet 3 bekommt einen eigenen Login, zunächst ohne Trainer-Zuordnung (Details: Fahrplan 4)

## Anhang B — Bewusst nicht Teil dieser Fahrpläne

Vollständige Liste je Fahrplan in dessen eigenem Anhang. Fahrplanübergreifend gelten zusätzlich:

- Öffentliche Registrierung — bleibt dauerhaft ausgeschlossen
- MCP-Trainerzugang statt Copy-Paste-Export
- Krafttraining als eigener Trainingsteil

## Anhang C — Offene Punkte außerhalb dieser Fahrpläne

Diese stehen in `docs/offene-punkte.md` oder in älteren Konzeptdokumenten und werden von den vier Fahrplänen **nicht** erledigt. Sie bleiben bestehen und brauchen später eigene Aufträge:

**Fachlich offen:**
- `profiles.ladder_progression_enabled` für Athlet 1 noch nicht auf `true` gesetzt — bewusst manueller Schritt
- Athlet 2 praktisch ohne Leiterwirkung, solange kein `alternating`-Parser für Over-Under existiert
- D4a/D4b warten auf ausreichend bewertbare Karten (Richtwert 30, zuletzt 12)
- Ist-Typerkennung v2, Schritte 3 und 4 (Trennung Intensitäts- von Formattypen, Abschlussvergleich)
- „Ausrollen" nach Rennen wird nicht als Cool-down klassifiziert
- `eventTaperDays: 7` und `highIntensityShareInfo: 0.2` sind unbelegte Annahmen
- `vo2-short`/`vo2-long`-Tie-Break läuft über Label-Regex statt strukturiertem Feld
- Sweet-Spot-Schwellen sind zwischen `scripts/lib/interval-blocks.js` und dem Core dupliziert — verschiebt sich nach Fahrplan 1 nur auf `app/src/sports/cycling/*` vs. `scripts/lib/`, bleibt aber offen

**Produktseitig offen:**
- Phase 6: Besucher-Feedback (Konzept fertig, Umsetzung offen)
- Finaler Security-Review am Ende von Phase 6
- „Passwort vergessen" und E-Mail-Änderung
- Design-Überarbeitung mit Claude Design (Hero-Bereich, zwei FTP-Ringe)

**Verifikation offen:**
- K3-Typ-Defaults-Review nach Plan 2

> Diese Liste ist der Stand nach Prüfung vom 13.08.2026 (per Claude Code gegen den echten Repo-Zustand abgeglichen). Sie ersetzt `docs/offene-punkte.md` nicht — sie zeigt nur, was bewusst außerhalb bleibt, damit später niemand annimmt, die Fahrpläne hätten es miterledigt.
>
> **Aus dieser Liste entfernt, weil bereits erledigt:** „CTL/ATL-Sparkline-Check und GoTrueClient-Login-Check im echten Browser" — laut `docs/offene-punkte.md` am 31.07.2026 per Playwright verifiziert und abgeschlossen.
>
> **Nicht abschließend geprüft:** weitere Punkte aus `docs/offene-punkte.md` wie Schlafscore im Governor, die M3-intervals.icu-Verifikation, Einschränkungen von Drag&Drop v1 und offene Explorer-Scope-Entscheidungen fehlen hier bewusst — diese Liste war nie als vollständige Kopie von `offene-punkte.md` gedacht, sondern nur als Warnschild für das, was neben den vier Fahrplänen offen bleibt.

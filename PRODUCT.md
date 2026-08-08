# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React + Vite (Entscheidung G1, `docs/dashboard-3.0-konzept-react-umbau.md`, Stand 04.08.2026) —
kompletter Umstieg von der bisherigen Vanilla-JS-Version. Grund: Design-Iterationen aus Claude
Design (React-Klassenkomponenten-Export) sollen mit festem, weitgehend mechanischem
Konvertierungsrezept übernommen werden (s. 5.7 im Konzeptdokument). Kein Tailwind — Design-Tokens
zentral in `styles/tokens.css`. TypeScript ja/nein ist noch offen (Etappe 1, s. 5.1).

## Users

Zwei gleichrangige Kernrollen, RLS-durchgesetzt:

- **Athlet** — Nutzer mit eigenem Trainingsplan (aktuell Radsport, Architektur bewusst
  multi-sport-fähig vorbereitet), sieht Trainingsdaten, PMC/Belastungskennzahlen, Planungstab,
  trägt tägliches Befinden ein, nimmt Trainer-Vorschläge an oder lehnt sie ab.
- **Trainer** — genau ein Trainer pro Athlet (ein Trainer kann mehrere Athleten betreuen), sieht
  "seinen" Athleten vollständig (inkl. Befinden, unabhängig vom öffentlichen Sichtbarkeits-Toggle),
  kann Planänderungen direkt übernehmen oder als Vorschlag einreichen. Trainer kann auch "Claude
  ohne Account" sein — Vorschläge laufen dann athletenvermittelt über einen Export/Import-Workflow,
  kein Service-Account in Supabase.
- Öffentliche Besucher (kein Login) sehen ausgewählte Daten je nach Sichtbarkeits-Matrix
  (Portfolio-Charakter, freier Athleten-Toggle) — sekundäre, aber bewusst gepflegte Zielgruppe.

## Product Purpose

Persönliches, datengetriebenes Trainingssteuerungs-Dashboard für Radsport. Verdichtet Rohdaten aus
intervals.icu/Notion/Wahoo zu einer täglichen Handlungsempfehlung (Coaching-Schicht) und bildet die
Trainer-Athlet-Zusammenarbeit (Direktänderung vs. Vorschlag) ab.

## Positioning

Die abgeleitete Coaching-Schicht ist der Kernmechanismus: PMC (CTL/ATL/TSB)-Fortschreibung,
Tagesform/Readiness (7-Tage- vs. 42-Tage-HRV-Baseline), Belastungswächter (Foster-Monotonie/
Strain, CTL-Ramp), Periodisierungs-Erfüllung (Reizsignatur je Block, Quality-Dichte) und ein
Briefing, das diese Signale zu einer täglichen Empfehlung fusioniert. Das unterscheidet das
Produkt von reinem intervals.icu-Ansehen, wo diese Verdichtung fehlt.

## Operating Context

- Datenherkunft: JSON-Pipeline (Cron alle 6h) aus intervals.icu (Aktivitäten, Wellness,
  Power-Curves), Notion (Plan 1), Open-Meteo (Wetter) — bleibt beim React-Umbau unverändert (G3).
- Schreibpfad (Ziele, Events, Befinden, Trainingskarten, Vorschläge, Feedback) läuft über
  Supabase mit RLS, session-basiert.
- Aktuell produktiv als Vanilla-JS-Version auf GitHub Pages (`main`); Neuaufbau läuft parallel
  auf Branch `dashboard-3.0` / Ordner `/app/`, alte Version bleibt bis zur Umschaltung live (G2).
- Genutzte Geräte (Athlet 1): Wahoo ELEMNT Roam v3, Favero Assioma PRO MX-1, Cube Nuroad Race
  Gravel.

## Capabilities and Constraints

- RLS erzwingt alle Rechte serverseitig, nie nur im UI ("UI blendet aus, Datenbank verbietet").
- Genau ein Trainer pro Athlet; ein Trainer kann mehrere Athleten betreuen.
- Trainer ohne Account möglich ("Claude als Trainer") — Vorschläge laufen dann athletenvermittelt,
  kein Service-Account.
- Multi-Sport ist strukturell vorbereitet, aber nicht gebaut — nur Radsport ist aktuell befüllt.
- Backend/Datenmodell (Supabase-Migrationen, RLS-Policies) bleiben beim React-Umbau inhaltlich
  unangetastet — rein additive Ergänzungen (z.B. eine `sport`-Spalte) werden einzeln vorgelegt,
  nicht pauschal vorab beschlossen.
- Terminologie: intern `athlete1`/`athlete2`, öffentlich selbstgewählte Pseudonyme
  ("Stuhlsen"/"hc_diZee") — nie echte Namen.

## Brand Commitments

- Keine echten Namen oder Standortdaten von Athleten in Code, UI, Kommentaren oder
  Commit-Messages — ausschließlich interne IDs plus selbstgewählte Pseudonyme;
  Standortkoordinaten ausschließlich über GitHub Secrets, nie im Code/JSON.
- UI-Sprache durchgehend Deutsch.

## Evidence on Hand

- Bestehendes Repo (Vanilla-JS, Branch `main`): geschichtete Architektur (core/data-access/
  state/ui), umfangreiche `node:test`-Suite, 12-Wochen-Periodisierungsplan (Plan 2), GFNY-Bremen-
  2026-Plan (Athlet 2) — funktionale Spezifikation für die Portierung; `core/`-Rechenlogik wird
  inhaltlich unverändert übernommen.
- Kein DESIGN.md vorhanden — die visuelle Sprache wird im Zuge des React-Umbaus über
  Claude-Design-Importe neu verhandelt.
- Konzeptdokumente unter `docs/` (Progressionssteuerung, Event-Verwaltung, Morgen-Check-in,
  Konfliktlogik/Prognose, Planungstab, Export/Import, Trainer-Sicht, Vorschlags-Schema, Explorer,
  Besucher-Feedback, Sichtbarkeit) dokumentieren bereichsweise Produktentscheidungen — künftige
  Etappen greifen darauf zurück statt neu zu erfinden.

## Product Principles

- `core/`-Rechenlogik ist reine, ungebundene Berechnung (kein DOM/Framework) und bleibt bei jedem
  Frontend-Wechsel unverändert — Coaching-Logik ist strikt von Darstellung getrennt.
- Sicherheit läuft immer über die Datenbank (RLS), nie nur über UI-Sichtbarkeit.
- Die Trainer-Athlet-Beziehung ist 1:1 pro Athlet und asymmetrisch (Trainer kann direkt schreiben
  oder vorschlagen; der Athlet entscheidet über Vorschläge).
- Multi-Sport-Fähigkeit wird strukturell offengehalten, nicht vorab gebaut ("Tür offen lassen
  statt Zimmer einrichten").
- Bestehende Konzeptdokumente sind bindende Spezifikation für ihren Bereich, bis der Nutzer sie
  ändert — nicht bei jedem Umbau neu verhandeln.

## Accessibility & Inclusion

Kein projektspezifisches Accessibility-Ziel dokumentiert (offen).

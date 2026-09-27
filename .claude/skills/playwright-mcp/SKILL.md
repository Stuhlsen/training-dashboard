---
name: playwright-mcp
description: Wann Playwright MCP (echter Browser) statt Unit-Test einsetzen — Grundsatz, gerechtfertigte/nicht gerechtfertigte Fälle, Snapshot- vs. Screenshot-Wahl, Session-Disziplin. Nutzen bei jeder Überlegung, eine Code-Änderung im echten Browser zu verifizieren, bevor Playwright MCP aufgerufen wird.
---

> **Hintergrund:** Playwright-MCP wurde in Phase 3 projektlokal eingerichtet
> (`.mcp.json`) für echte Browser-Verifikationen, die sich nicht durch
> Unit-Tests abdecken lassen (Pointer-Gesten, Timing-Races, CSS-Rendering).
> Dieses Skill schreibt fest, was seitdem nur als Absicht existierte.

# Grundsatz: Unit-Test vor Browser

Playwright ist das **letzte Mittel**, nicht der Standard-Reflex beim Prüfen
einer Änderung. Vor jedem Playwright-Einsatz gilt die Frage: *Lässt sich das
auch als reine Funktion in Vitest (`app/src/**/*.test.ts(x)`) oder
`tests/*.test.js` (Repo-Root) prüfen?* Fast immer lautet die Antwort ja —
dieses Projekt hat für genau diesen Zweck eine große, schnelle Testsuite in
`app/src/core/` und `app/src/api/`.

**Playwright ist gerechtfertigt für:**
- echte mehrstufige Pointer-Gesten (Drag & Drop, Brush-Ziehen) — nicht als
  Ein-Schritt-Kurzschluss simulierbar
- Race Conditions, die nur im echten Browser-Timing auftreten
- CSS-/Layout-Rendering, das sich nicht durch eine reine Funktion abbilden lässt
- End-zu-Ende-Verifikation eines abgeschlossenen Features gegen `dashboard-dev`,
  **einmalig am Ende**, nicht iterativ währenddessen

**Playwright ist NICHT gerechtfertigt für:**
- "mal schauen ob es geklappt hat" nach jeder kleinen Code-Änderung
- Dinge, die ein Unit-Test genauso beweist (Berechnungen, Zustandsübergänge,
  Datenformate)
- wiederholtes Nachprüfen während des Bauens — ein Playwright-Lauf am Ende
  eines abgeschlossenen Schritts ersetzt zehn während des Schritts

# Fähigkeiten / Grenzen

- **Kann:** echten Browser steuern (Navigation, Klicks, Formulare,
  Drag-Gesten über Pointer-Events), Konsole und Netzwerk-Requests einsehen,
  Laufzeit-Zustand direkt inspizieren via `browser_evaluate` mit dynamischem
  `import()` der laufenden App-Module (liefert echten In-Memory-State aus
  `app/src/api/`/React-Query-Caches, nicht nur den DOM-Ausschnitt).
- **Bleibt manuell bei Alex:** die finale Bestätigung im echten Browser vor
  jedem `git sync`; echte Multi-Step-Zeigergesten, falls synthetische
  Pointer-Events einen Unterschied machen könnten — beim Drag-Freeze-Bug
  (Juli 2026) ließ sich das Symptom mit einer einfachen Zwei-Schritt-
  Pointer-Simulation nicht reproduzieren, blieb aber ein offener Punkt bis
  zur manuellen Bestätigung.
- `.playwright-mcp/` (Snapshot-/Konsolen-Dumps aus Diagnose-Sessions) ist
  gitignored — kein Quellcode, nicht committen.

# Snapshot statt Screenshot

**`browser_snapshot` verwenden, nicht `browser_screenshot`**, wo immer die
Aufgabe es zulässt. Der Accessibility-Snapshot ist ein Text-/Baum-Artefakt und
typischerweise eine Größenordnung kleiner im Kontext als ein gerendertes Bild.
Screenshot nur, wenn es tatsächlich um visuelles Aussehen geht (Farben,
Layout-Politur), das der Snapshot nicht abbilden kann — nicht standardmäßig
für Funktionsprüfungen.

# Session-Disziplin

Eine Playwright-Session pro Verifikationsschritt, danach schließen. Nicht über
viele Chat-Turns hinweg offen halten und wiederholt abfragen — jeder
zusätzliche Turn in einer offenen Session trägt den bisherigen Seitenzustand
im Kontext mit.

# Bei Unklarheit: fragen

Wenn nicht klar ist, ob eine Prüfung Playwright braucht oder ein Unit-Test
reicht: fragen, nicht vorsichtshalber beides machen.

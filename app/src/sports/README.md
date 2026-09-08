# sports/

Multi-Sport-Grundstruktur (Etappe 3, Konzept G5; ausgebaut Fahrplan 10 E5).
Hier liegen die Werte, die an einer **Sportart** hängen — Zonengrenzen,
Metriknamen, Typvokabular, Einstufungsschwellen. Die Berechnung selbst bleibt
in `core/`.

```
types.ts    → SportProfile: der Vertrag, den eine Sportart erfüllen muss
index.ts    → Registry: SPORTS, getSport(id), defaultSport(), sportProfileFor()
cycling/    → Radsport (Etappe 3) — die einzige Sportart mit core-Konsumenten
running/    → Laufen (Fahrplan 10 E5) — Werte nach Daniels/Friel
swimming/   → Schwimmen (Fahrplan 10 E5) — UNKALIBRIERTES Wertegerüst (Swim-Smooth CSS)
```

## Von einer Sportart auf drei

Bis Fahrplan 10 E5 gab es genau eine Implementierung (`cycling/`). Der Vertrag
`types.ts` existierte, damit ein zweites Profil prinzipiell danebenstehen
**könnte** — bewiesen durch ein Lauf-**Fixture** in `registry.test.ts`, nicht
durch ausgelieferten Code.

E5 macht aus dem Beweis Produkt: `running/` und `swimming/` sind echte Profile,
über `getSport()` erreichbar und im Feldgleichheits-Test (jetzt über alle
drei). Das Fixture ist weg. **Noch von niemandem konsumiert** — `core/` rechnet
weiter mit `cycling/` (`DEFAULT_SPORT_ID`); E6 zieht die Default-Lasten,
E7 die Pace-Zonen/Metriken.

Das frühere Fixture hatte zwei Dinge gezeigt, die jetzt fest im Vertrag stehen:
`overlayBandPct` (Sweet-Spot-Band) muss nullable sein, weil Lauf/Schwimm kein
solches Band kennen, und `hrMax`/`scaleMax` hängen gar nicht an der Sportart.

## Feldnamen bleiben radsport-geprägt (Fahrplan 10 Q1)

`normalizedPowerMetric`, `ftpTestMaxMin`, `ifSweetSpotMax`, `longRideMin` … im
Vertrag sind radsport-benannt. E5 hat sie **nicht** umbenannt — die Umdeutung
für Lauf/Schwimm steht im Kommentar der jeweiligen Konstante (`running/`:
`normalizedPowerMetric` → `"GAP"`; `swimming/`: → `"—"`; „ftpTest" = Schwellen-
bzw. CSS-Test; `whatIfScaleHeadroom` = `0`). Hält den Feldgleichheits-Test und
künftige `core/`-Konsumenten stabil. Ein echtes Rename wäre eine eigene Etappe.

## Was NICHT hierher gehört

**Athletenwerte.** `hrMax` (201 in `state/config.js`) ist eine Eigenschaft der
Person, nicht der Sportart — die HF-Zonen unten sind reine Anteile davon. Das
Feld steht im Vertrag als `number | null` und ist beim Radsport `null`; sein
Platz ist `AthleteConfig` (`src/config.ts`), sobald ein Konsument ihn braucht.
`ui/planned.js` in der Vanilla-Version zeigt, warum das kein Detail ist: die
dortigen bpm-Zielbänder sind Athlet-1-Werte und werden für Athlet 2 bewusst
ausgeblendet.

**Das Trainingslast-Modell.** CTL/ATL-Zeitkonstanten (`core/pmc.js`),
Foster-Monotonie und CTL-Rampe (`core/loadguard.js`), die TSB-Schwellen des
Governors (`core/briefing.js`), `CONFLICT_THRESHOLDS` und `LADDER_PROGRESSION`
(`core/plan-config.js`), `RECOVERY_MAX_SHARE`/`QUALITY_PER_WEEK`
(`core/periodization.js`) und die Standarddauern der Power-Curve
(`core/powercurve.js`) gelten ausdauersportübergreifend. Sie bleiben in `core/`.

## Grenzfälle, bewusst nicht angefasst

- **`COGGAN_ZONE_META.farbe`** trägt CSS-Variablennamen (`var(--z1)`) — ein
  UI-Token in der Wertschicht. Vorbestand aus der Vanilla-Version, gehört
  perspektivisch zu `styles/tokens.css` (Etappe 4).
- **`CONFLICT_THRESHOLDS.highIntensityShareInfo`** (K-TID) hängt inhaltlich an
  `PHASE_SIGNATURES.ifMax`, ist aber selbst eine Anteilsschwelle und bleibt
  deshalb in `core/plan-config.js`.
- **`core/export-briefing.js::PROMPT_RUMPF`** beginnt mit „Du bist mein
  Radsport-Trainer" — sportspezifischer Text, aber der Export gehört zu
  Etappe 7 und wird dort neu geschnitten.
- **`CONFIG.powerScaleMax`** (300 W) ist nicht mitgezogen worden: der Wert
  steht in `assets/js/state/config.js`, wird dort aber von keiner einzigen
  Stelle gelesen (nachgeprüft über `assets/`, `scripts/`, `tests/`). Die
  Hero-Skala wächst stattdessen dynamisch aus der FTP
  (`core/zones.js::scaleMaxWatts`). Toten Wert nicht mit umziehen.

## `sport`-Spalte in der Datenbank

Nicht angelegt, bewusst — siehe `docs/offene-punkte.md`. Das Sportprofil ist
reine Client-Konfiguration; solange es genau eins gibt, trüge eine Spalte in
jeder Zeile denselben Wert.

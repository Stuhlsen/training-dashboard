# sports/

Multi-Sport-Grundstruktur (Etappe 3, Konzept G5). Hier liegen die Werte, die
an einer **Sportart** hängen — Zonengrenzen, Metriknamen, Typvokabular,
Einstufungsschwellen. Die Berechnung selbst bleibt in `core/`.

```
types.ts    → SportProfile: der Vertrag, den eine Sportart erfüllen muss
index.ts    → Registry: SPORTS, getSport(id), defaultSport()
cycling/    → die einzige Implementierung
```

## Warum es die Registry gibt, obwohl es nur eine Sportart gibt

Das Konzept sagt für diese Etappe ausdrücklich: **kein zweites Sport-Modul
bauen** — nur sicherstellen, dass eins prinzipiell danebenstehen könnte. Ein
zweites, halbfertiges Profil auszuliefern wäre toter Code; die Behauptung
ungeprüft zu lassen wäre wertlos. Deshalb steht das zweite Profil als
**Test-Fixture** in `registry.test.ts`: ein minimales Laufsport-Profil, das
den Vertrag vollständig erfüllt und mit dem Radsport-Profil auf Feldgleichheit
geprüft wird. Es wird nicht ausgeliefert und ist über `getSport()` nicht
erreichbar.

Genau dieses Fixture hat beim Schreiben zwei Dinge gezeigt, die vorher nur
Annahme waren: dass `overlayBandPct` (Sweet-Spot-Band) nullable sein muss, weil
Laufen kein solches Band kennt, und dass `hrMax`/`scaleMax` gar nicht an der
Sportart hängen.

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

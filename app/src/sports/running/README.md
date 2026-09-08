# sports/running/

Das Lauf-Profil (Fahrplan 10 E5). Aufbau 1:1 wie `sports/cycling/` — dieselbe
Dateiaufteilung, dieselbe `SportProfile`-Vertragserfüllung. **Anders als beim
Rad sind die Werte hier neu hergeleitet, nicht umgezogen** — die Herleitung
steht als Kommentar bei jeder Konstante und ist der wertvollere Teil davon.

| Datei | Inhalt | Quelle der Werte |
|---|---|---|
| `zones.ts` | 5 Pace-Zonen (E/M/T/I/R) als Anteil der Schwellengeschwindigkeit, IF-Bänder, Low-Intensity-Richtwert | Jack Daniels, *Daniels' Running Formula* (VDOT) |
| `metrics.ts` | Metriknamen (Schwellenpace/TRIMP/IF/GAP), Schrittfrequenz-Ziel, HF-Zonen | Daniels (Kadenz), klassisches 5-Zonen-%HFmax-Raster (HF) |
| `session-types.ts` | Typenliste, TRIMP-Defaults, Intensitätsklassen, erwartete Bänder, Reizsignaturen, EF-Vergleichbarkeit | Fahrplan 10 V4 (Vokabular), Banister-TRIMP-Schätzung (Lasten) |
| `classify.ts` | IF-/Dauer-/Block-Schwellen der Ist-Typerkennung, Rückfall-Last | Form aus `sports/cycling/`, auf die Daniels-Zonen abgestimmt |
| `index.ts` | fügt die vier zu `runningProfile` zusammen | — |

## Anker der Pace-Zonen

`zones.upperPct` ist der Anteil der geschätzten Schwellen-**Geschwindigkeit**
(nicht der Pace) — aufsteigend, exakt dieselbe Denkweise wie % FTP beim Rad
(Fahrplan 10 Q2). 1,0 = Schwellentempo, < 1,0 langsamer, > 1,0 schneller. Die
Umrechnung auf konkrete min/km-Werte macht E7 aus der dort geschätzten
Schwellenpace.

## Vertrags-Feldnamen bleiben radsport-geprägt

`normalizedPowerMetric`, `ftpTestMaxMin`, `ifSweetSpotMax`, `longRideMin` … sind
im Vertrag `sports/types.ts` radsport-benannt. Fahrplan 10 Q1: **kein Rename in
E5** — die Umdeutung fürs Laufen steht im Kommentar (`normalizedPowerMetric` →
`"GAP"`, `whatIfScaleHeadroom` → `0`, „ftpTest" = Schwellen-/Zeitfahrt-Test).
Das hält den Feldgleichheits-Test (`registry.test.ts`) und künftige
`core/`-Konsumenten stabil.

## UNKALIBRIERT

Athlet 3 hat zum E0-Bericht (2026-09-07) **2 Läufe** im Account. Zonengrenzen,
`defaultLoad` und `classify`-Schwellen sind literatur-plausibel, aber nicht an
echten Daten geprüft — jede Konstante ist entsprechend kommentiert, und **alle**
Typen stehen in `defaultLoadApprox`. Gegenprüfen, sobald echte Lauf-Daten
vorliegen (Risiko-Punkt „Sportwissenschaftliche Kalibrierung" im Fahrplan).

## Noch kein Konsument

`core/` liest diese Werte in E5 noch nicht. E6 nutzt
`sessionTypes.defaultLoad`, E7 `zones` + `metrics` für die Pace-Analyse. Der
Zonen-Vorbehalt (Guardrail 4 — Sport-Gate an jeder Zonen-Eintrittstelle) wird
in E7 gebaut.

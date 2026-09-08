# sports/swimming/

Das Schwimm-Profil (Fahrplan 10 E5). Aufbau 1:1 wie `sports/cycling/` und
`sports/running/`.

## ⚠️ Gesamtes Profil UNKALIBRIERT

Der E0-Bericht (2026-09-07) fand in Athlet 3s intervals.icu-Account **null
Schwimm-Aktivitäten**. Jeder Wert hier — Zonengrenzen, `defaultLoad`,
`classify`-Schwellen, HF-Zonen, Zugfrequenz — ist ein reines Wertegerüst nach
Lehrbuch (Swim-Smooth CSS / Maglischo, *Swimming Fastest*). Nichts davon ist an
echten Daten geprüft.

Entscheidung Alex 2026-09-07: das Gerüst wird trotzdem gebaut. Es ist billig,
und dann steht alles, sobald Athlet 3 die erste Schwimmeinheit loggt — ab da
gegen die echten Daten prüfen (Risiko-Punkt „Schwimm-Datenqualität" +
„Sportwissenschaftliche Kalibrierung" im Fahrplan).

| Datei | Inhalt | Quelle |
|---|---|---|
| `zones.ts` | 5 Zonen (Rekom/Grundlage/CSS/VO2max/Sprint) als Anteil der CSS-Geschwindigkeit | Swim-Smooth CSS, Zonen nach Maglischo (2003) |
| `metrics.ts` | Metriknamen (CSS/TRIMP/IF), Zugfrequenz-Ziel, HF-Zonen | Distanzschwimmer-Zugfrequenz, klassisches 5-Zonen-%HFmax-Raster |
| `session-types.ts` | Typenliste, TRIMP-Defaults, Intensitätsklassen, erwartete Bänder, Reizsignaturen, EF-Vergleichbarkeit | Fahrplan 10 V4 (Vokabular), Schätzung (Lasten) |
| `classify.ts` | IF-/Dauer-/Block-Schwellen der Ist-Typerkennung | Form aus `sports/cycling/`, auf die CSS-Zonen abgestimmt |
| `index.ts` | fügt die vier zu `swimmingProfile` zusammen | — |

## Anker der Zonen

`zones.upperPct` ist der Anteil der geschätzten CSS-**Geschwindigkeit** (nicht
der Pace) — aufsteigend, 1,0 = CSS-Tempo (Fahrplan 10 Q2). Die verbreiteten
CSS-Zonen sind als % der CSS-Pace angegeben (Rekom = 115–130 % der Pace =
langsamer); hier auf die Geschwindigkeit umgerechnet, damit die Kette wie beim
Rad aufsteigt.

## Vertrags-Feldnamen bleiben radsport-geprägt

Fahrplan 10 Q1: kein Rename in E5. `normalizedPowerMetric` ist `"—"` (kein
Schwimm-Analogon zur geglätteten Leistung), `whatIfScaleHeadroom` ist `0`,
„ftpTest" meint einen CSS-Test (400 m + 200 m Zeitfahrt).

## HF im Wasser

Die HF liegt im Wasser typisch ~10 bpm unter dem Landäquivalent. Das
5-Zonen-Raster ist trotzdem 1:1 vom Laufen übernommen — eine schwimmspezifische
Korrektur ist nachzuziehen, sobald echte Schwimm-HF-Daten vorliegen. Wo
Schwimmen ganz ohne HF geloggt wird, greift in E6 der RPE-Ersatzpfad
(Pflichtpfad, OF-3).

## Noch kein Konsument

`core/` liest diese Werte in E5 nicht. E6 nutzt `sessionTypes.defaultLoad` +
den RPE-Pfad, E7 `zones` + `metrics` für die Pace-Analyse.

# sports/cycling/

Die einzige befüllte Sportart-Implementierung (Etappe 3). Alle Werte sind
**unverändert** aus ihren bisherigen Orten umgezogen — die Herleitungen stehen
als Kommentare bei den Konstanten und sind der wertvollere Teil davon.

| Datei | Inhalt | kam aus |
|---|---|---|
| `zones.ts` | Coggan-Prozentgrenzen, Zonen-Metadaten, Sweet-Spot-Band, IF-Bänder, Low-Intensity-Richtwert | `core/zones.js` |
| `metrics.ts` | Metriknamen (FTP/TSS/IF/NP), Kadenzziel, HF-Zonen, What-if-Puffer | `core/zones.js`, `assets/js/state/config.js` |
| `session-types.ts` | Typenliste, TSS-Defaults, Intensitätsklassen, erwartete Bänder, Reizsignaturen, EF-Vergleichbarkeit | `core/plan-config.js`, `core/periodization.js`, `core/efficiency.js` |
| `classify.ts` | IF-/Dauer-/Block-Schwellen der Ist-Typerkennung, Rückfall-TSS | `core/plan-config.js` |
| `index.ts` | fügt die vier zu `cyclingProfile` zusammen | — |

## Wie core daran kommt

`core/zones.js`, `core/plan-config.js`, `core/periodization.js` und
`core/efficiency.js` importieren die Werte von hier und **re-exportieren sie
unter unverändertem Namen**. Keine Aufrufstelle hat sich geändert; die 742
bestehenden Tests liefen nach dem Umzug unverändert durch, und genau das ist
der Regressionsbeweis dieser Etappe.

Wer eine dieser Konstanten ändern will, ändert sie hier — nicht in `core/`.

`profile.test.ts` schreibt sämtliche Werte ein zweites Mal aus, unabhängig von
den Quelldateien. Grund: die bestehenden Tests decken die selteneren Einträge
(etwa `NLS: 44` oder `Z2 Erholung: 58`) gar nicht ab, ein Zahlendreher beim
Kopieren wäre dort unbemerkt durchgelaufen. Zusätzlich wird geprüft, dass die
core-Re-Exports auf dieselben Objekte zeigen — eine versehentlich zweite
Definition in `core/` fiele sonst nicht auf.

## Was hier bewusst fehlt

`hrMax`, `scaleMax`, tote Werte wie `powerScaleMax`, und alles aus dem
sportartübergreifenden Trainingslast-Modell — Begründungen stehen in
`../README.md`.

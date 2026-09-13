/* Golden-Master: core/plan-generator.js::generatePlan() — Fahrplan 14 E0.

   Friert die HEUTIGE Rad-Ausgabe ein (kein `sport`-Feld im Input — der
   Zustand vor Fahrplan 14 E1). Jede Etappe von Fahrplan 14 (Multi-Sport-
   Erweiterung des Generators) muss diesen Test 0-Diff grün halten, solange
   sie `sport === "ride"` betrifft. Bricht er: Etappe stoppen, Diff gegen
   `plan-generator-golden-master.expected.json` prüfen — nur eine bewusste,
   für Rad tatsächlich beabsichtigte Verhaltensänderung darf ihn anfassen
   (dann `expected.json` neu erzeugen, s. Kopfkommentar im Fixture-Ordner).

   Muster: Fahrplan 10 E2 (PMC-Golden-Master für Athlet 1/2/4). Hier ohne
   eigenen "compute-series"-Baustein — `generatePlan()` ist bereits die volle
   reine Rechenkette, Test und (einmalige) Erzeugung des Erwartungswerts rufen
   dieselbe Funktion auf. */

import { test, expect } from "vitest";
import { generatePlan } from "./plan-generator.js";
import inputs from "./__fixtures__/golden-master/plan-generator-inputs.json";
import expected from "./__fixtures__/golden-master/plan-generator-golden-master.expected.json";

for (const [name, input] of Object.entries(inputs)) {
  test(`golden-master: ${name}`, () => {
    expect(generatePlan(input)).toEqual(expected[name]);
  });
}

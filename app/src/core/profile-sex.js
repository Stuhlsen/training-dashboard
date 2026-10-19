/* ============================================================
   CORE/PROFILE-SEX.JS — welches biologische Geschlecht die Ernährungs-
   Formeln verwenden (m / f / null)

   `gender` (Basisdaten: männlich / weiblich / divers) ist die einzige
   Frage, die Athleten beantworten. Daraus wird für die Formeln abgeleitet:
   männlich → "m", weiblich → "f". Nur bei divers / keine Angabe fragt die
   Ernährung zusätzlich nach einem biologischen Wert (`profiles.sex`) — nur
   dann zählt der gespeicherte Wert. Ein altes `sex`, das zu `gender`
   widerspricht, bleibt in der Datenbank stehen und wird ignoriert.

   Reine Berechnung, kein I/O.
   ============================================================ */

/**
 * @param {string|null|undefined} gender  "maennlich" | "weiblich" | "divers" | null
 * @returns {boolean}  true → die Ernährung muss nach dem biologischen Wert fragen
 */
export function needsBiologicalSexQuestion(gender) {
  return gender !== "maennlich" && gender !== "weiblich";
}

/**
 * @param {string|null|undefined} gender
 * @param {string|null|undefined} sex  gespeichertes `profiles.sex` ("m" | "f" | null)
 * @returns {"m"|"f"|null}
 */
export function effectiveSex(gender, sex) {
  if (gender === "maennlich") return "m";
  if (gender === "weiblich") return "f";
  return sex === "m" || sex === "f" ? sex : null;
}

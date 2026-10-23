/* ============================================================
   CORE/SESSION-GUIDE-TEXTS.JS — Erklärtexte je Trainingskarten-Familie
   (reine Daten, kein I/O)
   (Fahrplan 34, Etappe E1: nur Rad; Lauf/Schwimmen kommt in E6)

   Schlüssel = `${sport}:${familie|typ}` aus core/session-guide-key.js.
   Je Eintrag:
   - `ziel`     warum man die Einheit fährt (1–2 Sätze)
   - `rpe`      Ziel-Anstrengung {min,max} auf der Skala 1–10
   - `gefuehl`  wie sich dieses Band anfühlt
   - `cue`      { template, fallback }: Vorlage mit den Lücken {reps},
                {workMin}, {wattRange} (E2 füllt sie) und eine Fassung
                OHNE Lücken für den Fall, dass ein Wert fehlt
   - `abbruch`  neutrale Abbruchregel, ohne Druck
   - `quelleKeys` Schlüssel aus core/session-guide-sources.js

   RPE-Bänder und Gefühls-Sätze sind EIGENE SETZUNG (Beleg §2c, privat:
   planning/recherche/trainingskarten-erklaeren-belege.md): Es gibt keine
   validierte Kopplung RPE↔Leistungszone. RPE steht darum immer neben dem
   Wattbereich der Karte, nie allein. Cues und Abbruchregeln sind eigene
   Formulierungen ohne Zahl; Watt- und Prozentwerte kommen nur über die
   Lücken aus der Karte. Der Ton ist ruhig, ohne Druck.
   ============================================================ */

import { GUIDE_SOURCE_KEYS as S } from "./session-guide-sources.js";

/** Erlaubte Lücken in `cue.template`. */
export const GUIDE_CUE_PLACEHOLDERS = Object.freeze(["{reps}", "{workMin}", "{wattRange}"]);

/**
 * @typedef {Object} SessionGuideText
 * @property {string} ziel
 * @property {{min:number, max:number}} rpe
 * @property {string} gefuehl
 * @property {{template:string, fallback:string}} cue
 * @property {string} abbruch
 * @property {ReadonlyArray<string>} quelleKeys
 */

const ABBRUCH_HART =
  "Steigt die Leistung über den Zielbereich oder wird es deutlich härter als gedacht: nimm etwas Druck raus.";
const ABBRUCH_LOCKER = "Fühlt es sich schwerer an als locker: nimm etwas Druck raus.";

/** @param {string} ziel @param {[number,number]} rpe @param {string} gefuehl
 *  @param {string} template @param {string} fallback @param {string} abbruch
 *  @param {string[]} quelleKeys
 *  @returns {Readonly<SessionGuideText>} */
const entry = (ziel, rpe, gefuehl, template, fallback, abbruch, quelleKeys) =>
  Object.freeze({
    ziel,
    rpe: Object.freeze({ min: rpe[0], max: rpe[1] }),
    gefuehl,
    cue: Object.freeze({ template, fallback }),
    abbruch,
    quelleKeys: Object.freeze(quelleKeys),
  });

/** Ohne Lücken: Vorlage und Fallback sind derselbe Satz. */
const plainEntry = (ziel, rpe, gefuehl, cue, abbruch, quelleKeys) =>
  entry(ziel, rpe, gefuehl, cue, cue, abbruch, quelleKeys);

const EIGENE = S.EIGENE_SETZUNG;
const SCHWELLE_BELEG = [S.EIGENE_SETZUNG, S.NUUTTILA_2025];

/** @type {Readonly<Record<string, Readonly<SessionGuideText>>>} */
export const SESSION_GUIDE_TEXTS = Object.freeze({
  "ride:z1-recovery": plainEntry(
    "Du lockerst die Beine und unterstützt die Erholung. Die Einheit soll dich frischer machen, nicht müder.",
    [1, 2],
    "Ganz locker, du könntest ewig weiterfahren.",
    "Rolle ganz locker und lass Anstiege einfach kommen, ohne zu drücken. Früher aufhören ist in Ordnung.",
    ABBRUCH_LOCKER,
    [EIGENE]
  ),

  "ride:z2-dauer": plainEntry(
    "Du hältst deine Ausdauer mit einer lockeren Einheit in Schwung, ohne dich stark zu belasten.",
    [2, 3],
    "Locker, du kannst ganze Sätze sprechen.",
    "Fahre gleichmäßig im lockeren Bereich. Ein ruhiger, runder Tritt ist wichtiger als Tempo.",
    ABBRUCH_LOCKER,
    [EIGENE]
  ),

  "ride:z2-lang": plainEntry(
    "Du baust über viele Stunden eine breite Ausdauerbasis auf. Locker gefahren belastet das wenig und lässt sich oft wiederholen.",
    [2, 3],
    "Locker, du kannst ganze Sätze sprechen.",
    "Fahre gleichmäßig im lockeren Bereich und bleib auch an Anstiegen dort. Es geht um die Zeit im Sattel, nicht um das Tempo.",
    ABBRUCH_LOCKER,
    [EIGENE]
  ),

  "ride:sweetspot-long": entry(
    "Du trainierst lange, gleichmäßige Abschnitte knapp unter der Schwelle. Das stärkt deine Ausdauer unter Last und lässt sich gut wiederholen.",
    [5, 6],
    "Fordernd, aber mit Reserve. Am Ende geht noch eine Wiederholung.",
    "Fahre {reps} Intervalle von je {workMin} Minuten im Bereich {wattRange}. Starte ruhig und halte die Leistung bis zum Ende gleichmäßig.",
    "Fahre die Intervalle im Zielbereich der Karte. Starte ruhig und halte die Leistung bis zum Ende gleichmäßig.",
    ABBRUCH_HART,
    [EIGENE]
  ),

  "ride:threshold-long": entry(
    "Du gewöhnst dich an Leistung direkt an deiner Schwelle. So kannst du später ein hohes Tempo länger halten.",
    [6, 7],
    "Hart, aber gleichmäßig haltbar. Sprechen nur in kurzen Sätzen.",
    "Fahre {reps} Intervalle von je {workMin} Minuten im Bereich {wattRange}. Teile dir die Kraft ein: Die letzten Minuten sollen genauso rund laufen wie die ersten.",
    "Fahre die Intervalle im Zielbereich der Karte. Teile dir die Kraft ein: Die letzten Minuten sollen genauso rund laufen wie die ersten.",
    ABBRUCH_HART,
    SCHWELLE_BELEG
  ),

  "ride:over-under": entry(
    "Du lernst, kurz über der Schwelle zu fahren und dich knapp darunter zu erholen. Das hilft dir, harte Phasen in Rennen oder Gruppe wegzustecken.",
    [7, 8],
    "Die Über-Teile brennen, in den Unter-Teilen erholst du dich kaum.",
    "Fahre {reps} Blöcke, die zwischen Über- und Unter-Teil wechseln, je {workMin} Minuten lang (Bereich {wattRange}). Bleib in den Unter-Teilen wirklich im unteren Bereich, damit der nächste Über-Teil klappt.",
    "Wechsle zwischen Über- und Unter-Teil, wie es die Karte vorgibt. Bleib in den Unter-Teilen wirklich im unteren Bereich, damit der nächste Über-Teil klappt.",
    ABBRUCH_HART,
    SCHWELLE_BELEG
  ),

  "ride:vo2-long": entry(
    "Du reizt deine maximale Sauerstoffaufnahme mit längeren, sehr harten Intervallen. Das hebt die Obergrenze, auf der alles andere aufbaut.",
    [8, 9],
    "Sehr hart. Die letzte Minute jedes Intervalls ist schwer.",
    "Fahre {reps} Intervalle von je {workMin} Minuten im Bereich {wattRange}. Fang nicht zu schnell an, sonst fehlt dir im letzten Intervall die Kraft. In den Pausen fährst du ganz locker.",
    "Fahre die Intervalle im Zielbereich der Karte. Fang nicht zu schnell an, sonst fehlt dir im letzten Intervall die Kraft. In den Pausen fährst du ganz locker.",
    ABBRUCH_HART,
    [EIGENE]
  ),

  "ride:vo2-short": entry(
    "Du reizt deine maximale Sauerstoffaufnahme in vielen kurzen, harten Stücken. Die kurzen Pausen halten die Belastung hoch, ohne dass ein einzelnes Stück lange dauert.",
    [8, 9],
    "Sehr hart in Summe, auch wenn jedes Stück kurz ist.",
    "Fahre {reps} Durchgänge aus kurzen, harten Stücken und kurzen Pausen (Bereich {wattRange}). Verteile die Kraft über alle Durchgänge: Der letzte soll so sauber sein wie der erste.",
    "Fahre die kurzen, harten Stücke und die kurzen Pausen, wie es die Karte vorgibt. Verteile die Kraft über alle Durchgänge: Der letzte soll so sauber sein wie der erste.",
    ABBRUCH_HART,
    [EIGENE]
  ),

  /* Zusatz-Zeile, wenn die Karte einen Sprint-Schritt hat (target "max"):
     nur der Sprint selbst liegt im Band 9–10. */
  "ride:sprint-accessory": entry(
    "Du trainierst kurze Antritte mit voller Kraft. Das hält deine Schnellkraft wach.",
    [9, 10],
    "Kurz alles geben, dann ganz locker.",
    "Fahre {reps} kurze Sprints mit voller Kraft. Nach jedem Sprint rollst du locker aus, bis du dich wieder erholt fühlst.",
    "Fahre die kurzen Sprints mit voller Kraft. Nach jedem Sprint rollst du locker aus, bis du dich wieder erholt fühlst.",
    "Fühlst du dich vor einem Sprint nicht erholt: verlängere die Pause oder lass den Sprint aus.",
    [EIGENE]
  ),

  "ride:ftp-test": plainEntry(
    "Du prüfst deine aktuelle Schwellenleistung (FTP). Mit dem Ergebnis stimmen deine Zonen und Pläne wieder.",
    [9, 10],
    "Am Ende ganz leer, aber gleichmäßig dorthin.",
    "Teile dir den Test ein: Starte etwas unter dem Wert, den du dir zutraust, und werde zum Ende hin stärker. So bekommst du ein ehrliches Ergebnis.",
    "Fühlst du dich krank oder sehr müde: verschiebe den Test auf einen anderen Tag. Ein Test mit müden Beinen sagt wenig aus.",
    [EIGENE]
  ),
});

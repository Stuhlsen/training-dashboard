/* ============================================================
   CORE/SESSION-GUIDE-TEXTS.JS — Erklärtexte je Trainingskarten-Familie
   (reine Daten, kein I/O)
   (Fahrplan 34, Etappe E1: Rad · E6: Lauf und Schwimmen)

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
   - `rpeByPhase` (nur swim:intervalle, Q15): Ziel-RPE + Gefühls-Satz je
                Plan-Phase; `rpe`/`gefuehl` des Eintrags gelten als Default
                (Phase Schwelle), wenn die Karte keine bekannte Phase trägt

   RPE-Bänder und Gefühls-Sätze sind EIGENE SETZUNG (Beleg §2c, privat:
   planning/recherche/trainingskarten-erklaeren-belege.md): Es gibt keine
   validierte Kopplung RPE↔Leistungszone. RPE steht darum immer neben dem
   Wattbereich der Karte, nie allein. Cues und Abbruchregeln sind eigene
   Formulierungen ohne Zahl; Watt- und Prozentwerte kommen nur über die
   Lücken aus der Karte. Der Ton ist ruhig, ohne Druck.

   Lauf und Schwimmen (E6): Die Karten tragen keine Struktur im Rad-Format,
   darum gibt es dort keine Lücken — Vorlage und Fallback sind derselbe Satz.
   Die Bänder stehen im Beleg §2c; die Läufer-/Schwimm-Bänder sind wie beim
   Rad EIGENE SETZUNG (keine validierte Kopplung RPE↔Tempo). Der Tempolauf
   verweist zusätzlich auf Nuuttila 2025 (Läufer, Anstrengung an der
   Schwelle um „schwer", große Streuung). Schwimmen: Longswim/Technik
   bekommen statt des Sprechtests nur „Ruhig, Fokus auf saubere Züge."
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

/** RPE-Variante je Plan-Phase (nur swim:intervalle).
 *  @param {[number,number]} rpe @param {string} gefuehl */
const phaseRpe = (rpe, gefuehl) => Object.freeze({ min: rpe[0], max: rpe[1], gefuehl });

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

const ABBRUCH_LAUF_HART =
  "Wird es deutlich härter als gedacht oder läuft das Tempo davon: werde langsamer oder geh ein Stück.";
const ABBRUCH_LAUF_LOCKER = "Fühlt es sich schwerer an als locker: werde langsamer oder geh ein Stück.";
const ABBRUCH_SCHWIMM_HART =
  "Wird die Technik deutlich schlechter oder fühlt es sich härter an als geplant: verlängere die Pause oder schwimm eine Wiederholung locker.";
const ABBRUCH_SCHWIMM_LOCKER = "Wird die Technik schlechter oder du wirst müde: mach eine kurze Pause oder höre früher auf.";

const GEFUEHL_LOCKER = "Locker, du kannst ganze Sätze sprechen.";
const GEFUEHL_SCHWELLE = "Hart, aber gleichmäßig haltbar. Sprechen nur in kurzen Sätzen.";
const GEFUEHL_VO2 = "Sehr hart. Die letzte Minute jedes Intervalls ist schwer.";

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

  /* ---- Lauf (E6) ---- */
  "run:dauerlauf": plainEntry(
    "Du baust mit ruhigem Laufen deine Ausdauer auf und gewöhnst Muskeln, Sehnen und Gelenke Schritt für Schritt an die Belastung.",
    [2, 3],
    GEFUEHL_LOCKER,
    "Laufe gleichmäßig in einem Tempo, bei dem du ganze Sätze sprechen kannst. Gehpausen sind in Ordnung.",
    ABBRUCH_LAUF_LOCKER,
    [EIGENE]
  ),

  "run:longrun": plainEntry(
    "Du übst, lange locker auf den Beinen zu bleiben. Das stärkt deine Ausdauer und gewöhnt dich an viele Minuten Belastung.",
    [2, 3],
    GEFUEHL_LOCKER,
    "Starte bewusst ruhig und halte das lockere Tempo bis zum Schluss. Die letzten Kilometer sollen sich so entspannt anfühlen wie die ersten.",
    ABBRUCH_LAUF_LOCKER,
    [EIGENE]
  ),

  "run:tempolauf": plainEntry(
    "Du läufst gleichmäßig an deiner Schwelle. So lernst du, ein flottes Tempo länger zu halten.",
    [6, 7],
    GEFUEHL_SCHWELLE,
    "Laufe den Hauptteil im Zielbereich der Karte und halte das Tempo gleichmäßig. Starte eher einen Hauch zu ruhig: Die letzten Minuten sollen so rund laufen wie die ersten.",
    ABBRUCH_LAUF_HART,
    SCHWELLE_BELEG
  ),

  "run:intervalle": plainEntry(
    "Du reizt deine maximale Sauerstoffaufnahme mit harten Abschnitten und Pausen dazwischen. Das hebt die Obergrenze, auf der dein Ausdauertempo aufbaut.",
    [8, 9],
    GEFUEHL_VO2,
    "Laufe die harten Abschnitte im Zielbereich der Karte und fang nicht zu schnell an, sonst fehlt dir am Ende die Kraft. In den Pausen trabst du ganz locker oder gehst.",
    ABBRUCH_LAUF_HART,
    [EIGENE]
  ),

  /* ---- Schwimmen (E6) ---- */
  "swim:longswim": plainEntry(
    "Du schwimmst lange am Stück in ruhigem Tempo. Das baut Ausdauer auf und festigt deine Technik, auch wenn du müder wirst.",
    [2, 4],
    "Ruhig, Fokus auf saubere Züge.",
    "Schwimm gleichmäßig und ruhig. Lässt die Technik nach, mach eine kurze Pause und schwimm dann wieder sauber weiter.",
    ABBRUCH_SCHWIMM_LOCKER,
    [EIGENE]
  ),

  "swim:technik": plainEntry(
    "Du übst einzelne Teile deiner Technik bei niedriger Belastung. Saubere Bewegungen zahlen sich später bei jedem Tempo aus.",
    [2, 4],
    "Ruhig, Fokus auf saubere Züge.",
    "Wähle pro Bahn einen Punkt, auf den du achtest, und schwimm dabei bewusst langsam. Lange Pausen sind erlaubt.",
    ABBRUCH_SCHWIMM_LOCKER,
    [EIGENE]
  ),

  /* Q15: ein Text, das RPE-Band hängt an der Plan-Phase (Karte.phase).
     `rpe`/`gefuehl` = Default (Schwelle) für Karten ohne bekannte Phase. */
  "swim:intervalle": Object.freeze({
    ...plainEntry(
      "Du schwimmst Wiederholungen in hohem Tempo mit Pausen dazwischen. So hältst du später schnelleres Tempo länger durch.",
      [6, 7],
      GEFUEHL_SCHWELLE,
      "Schwimm die Wiederholungen im Zielbereich der Karte und teile dir die Kraft ein: Die letzte soll so sauber sein wie die erste. In den Pausen atmest du ruhig durch.",
      ABBRUCH_SCHWIMM_HART,
      [EIGENE]
    ),
    rpeByPhase: Object.freeze({
      Schwelle: phaseRpe([6, 7], GEFUEHL_SCHWELLE),
      VO2max: phaseRpe([8, 9], GEFUEHL_VO2),
    }),
  }),
});

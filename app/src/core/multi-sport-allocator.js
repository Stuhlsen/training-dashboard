/* core/multi-sport-allocator.js — Fahrplan 44 E3 (V2): Wochenverteilung über
   mehrere Sportarten. Reine Berechnung: gleiche Eingabe → gleiche Ausgabe,
   kein Date.now, kein DOM, kein I/O.

   Die Ausgabe (`plans`) ist der Teil, der je Sportart in einen
   PlanGeneratorInput fließt (weeklyHours, trainingWeekdays, fixedDays). Der
   Rest des Inputs bleibt beim Aufrufer. `generatePlan()` bleibt unangefasst —
   es wählt seine Qualitätstage selbst aus `trainingWeekdays`. Gesteuert wird
   es nur über FIXED_INTERVAL_TYP-Pins in `fixedDays`.

   Grenze dieser Steuerung: Ein Pin ersetzt einen automatischen Qualitätsslot.
   Gibt es für eine Sportart gar keinen gültigen harten Tag, bleibt kein Pin
   übrig und `generatePlan()` legt seine harten Einheiten selbst — das meldet
   der Hinweis HARD_DAY_MISSING, es wird nicht still verändert. */

import { qualityWeekdays, FIXED_INTERVAL_TYP } from "./plan-generator.js";
import { intensityClass, INTENSITY_CLASS } from "./plan-config.js";
import { RUNNING_INTENSITY_CLASS } from "../sports/running/session-types.js";
import { SWIMMING_INTENSITY_CLASS } from "../sports/swimming/session-types.js";

/** Vorrang der Sportarten: Rad zuerst, danach Laufen, Schwimmen. */
const SPORT_PRIORITY = ["ride", "run", "swim"];

const SPORT_LABEL = { ride: "Rad", run: "Laufen", swim: "Schwimmen" };
const DAY_LABEL = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const INTENSITY_TABLES = {
  ride: INTENSITY_CLASS,
  run: RUNNING_INTENSITY_CLASS,
  swim: SWIMMING_INTENSITY_CLASS,
};

/** Feste Typen, die der Allocator als hart behandelt, obwohl `intensityClass`
 *  sie als „moderat" führt: Gruppenfahrten sind im Alltag oft das härteste
 *  Stück der Woche. eigene Festlegung */
const HARD_FIXED_EXTRA = new Set(["Gruppenfahrt"]);

/** Mehr als so viele Stunden je Trainingstag im Schnitt → Hinweis. eigene Festlegung */
const MAX_HOURS_PER_DAY = 3;

/** Mindestabstand zwischen harten Tagen verschiedener Sportarten (zyklisch,
 *  So → Mo zählt als Folgetag). Gilt auch zwischen zwei harten Tagen einer
 *  Sportart. eigene Festlegung — spiegelt die Regel aus qualityWeekdays() */
const MIN_HARD_GAP_DAYS = 2;

const isWeekday = (d) => Number.isInteger(d) && d >= 1 && d <= 7;
const cycDist = (a, b) => Math.min(Math.abs(a - b), 7 - Math.abs(a - b));
const uniqueSorted = (days) => [...new Set(days)].sort((a, b) => a - b);

const fail = (message) => ({ ok: false, error: { code: "VALIDATION", message } });

/** @returns {string|null} Fehlertext oder null */
function validate(input) {
  if (!input || typeof input !== "object") return "Eingabe fehlt.";
  const { sports, blockedDays = [] } = input;
  if (!Array.isArray(sports) || sports.length === 0) return "Mindestens eine Sportart nötig.";
  if (!Array.isArray(blockedDays) || !blockedDays.every(isWeekday)) return "Gesperrte Tage müssen Wochentage von 1 bis 7 sein.";
  const seen = new Set();
  for (const s of sports) {
    if (!s || typeof s !== "object") return "Sportart-Eintrag ungültig.";
    if (!SPORT_PRIORITY.includes(s.sport)) return `Unbekannte Sportart: ${String(s.sport)}.`;
    if (seen.has(s.sport)) return `Sportart doppelt angegeben: ${s.sport}.`;
    seen.add(s.sport);
    if (typeof s.hours !== "number" || !Number.isFinite(s.hours) || s.hours <= 0) {
      return `Stunden müssen größer als 0 sein (${s.sport}).`;
    }
    if (!Array.isArray(s.weekdays) || !s.weekdays.every(isWeekday)) {
      return `Wochentage müssen von 1 bis 7 reichen (${s.sport}).`;
    }
    const fixed = s.fixedDays ?? [];
    if (!Array.isArray(fixed) || !fixed.every((f) => f && isWeekday(f.weekday) && typeof f.typ === "string")) {
      return `Feste Tage ungültig (${s.sport}).`;
    }
  }
  return null;
}

/** Ist ein fester Tag dieser Sportart hart? */
function isHardFixed(sport, typ) {
  if (typ === FIXED_INTERVAL_TYP || HARD_FIXED_EXTRA.has(typ)) return true;
  return intensityClass(typ, INTENSITY_TABLES[sport]) === "hart";
}

/** Tage, die ein harter Tag in `hardDays` für andere harte Einheiten sperrt:
 *  derselbe Tag und beide Nachbarn, zyklisch (So ↔ Mo). */
function forbiddenDays(hardDays) {
  const out = new Set();
  for (const d of hardDays) {
    out.add(d);
    out.add((d % 7) + 1);
    out.add(((d + 5) % 7) + 1);
  }
  return out;
}

/** Bis zu `count` (≤ 2) harte Tage aus `candidates`, deterministisch: frühester
 *  Tag plus spätester mit Abstand; passt kein Paar, der früheste Einzeltag.
 *  @param {number[]} candidates aufsteigend @param {number} count @param {number[]} base bereits harte Tage der Sportart */
function pickHardDays(candidates, count, base) {
  const ok = (d) => base.every((b) => cycDist(b, d) >= MIN_HARD_GAP_DAYS);
  const valid = candidates.filter(ok);
  if (count >= 2) {
    for (let i = 0; i < valid.length; i++) {
      for (let j = valid.length - 1; j > i; j--) {
        if (cycDist(valid[i], valid[j]) >= MIN_HARD_GAP_DAYS) return [valid[i], valid[j]];
      }
    }
  }
  return valid.length ? [valid[0]] : [];
}

const hint = (code, text, sport) => ({ code, text, sport });
const dayName = (d) => DAY_LABEL[d - 1];

/** Vorrang-Sportart: unverändert durchreichen, nur die Tage vormerken. */
function takeUntouched(s, blocked, occupancy, hints) {
  const fixedDays = (s.fixedDays ?? []).map((f) => ({ ...f }));
  const days = uniqueSorted([...s.weekdays, ...fixedDays.map((f) => f.weekday)]);
  const hardFixed = fixedDays.filter((f) => isHardFixed(s.sport, f.typ)).map((f) => f.weekday);
  const hard = new Set([...hardFixed, ...qualityWeekdays(days)]);
  for (const d of days) {
    occupancy.set(d, [...(occupancy.get(d) ?? []), { sport: s.sport, hard: hard.has(d) }]);
    if (blocked.has(d)) {
      hints.push(
        hint(
          "KEPT_ON_BLOCKED_DAY",
          `${SPORT_LABEL[s.sport]} liegt am ${dayName(d)}, der blockiert ist. Der ${SPORT_LABEL[s.sport]}-Plan bleibt, wie er ist.`,
          s.sport
        )
      );
    }
  }
  return { sport: s.sport, weeklyHours: s.hours, trainingWeekdays: [...s.weekdays], fixedDays };
}

/** Weitere Sportart oben drauf: eigene Tage zuerst, Teilen nur als Ausnahme,
 *  harte Tage per Pins mit Abstand zu den harten Tagen der anderen. */
function allocateAdditional(s, blocked, occupancy, hints) {
  const label = SPORT_LABEL[s.sport];
  const isOccupied = (d) => (occupancy.get(d) ?? []).length > 0;
  const isHardOccupied = (d) => (occupancy.get(d) ?? []).some((o) => o.hard);
  const wanted = uniqueSorted([...s.weekdays, ...(s.fixedDays ?? []).map((f) => f.weekday)]);

  const mine = new Set();
  const shared = new Set();
  const keptFixed = [];
  const share = (d) => {
    shared.add(d);
    hints.push(
      isHardOccupied(d)
        ? hint("SHARED_HARD_DAY", `${label} teilt sich den ${dayName(d)} mit einer harten Einheit. Dort passt nur etwas Lockeres.`, s.sport)
        : hint("SHARED_DAY", `${label} teilt sich den ${dayName(d)} mit einer anderen Sportart. Die Einheit bleibt locker.`, s.sport)
    );
  };
  const blockedHint = (d) =>
    hints.push(hint("BLOCKED_DAY", `Der ${dayName(d)} ist blockiert. ${label} bekommt dort keine Einheit.`, s.sport));

  // 1) Feste Tage bleiben (nur ein blockierter Tag gewinnt).
  const seenFixed = new Set();
  for (const f of [...(s.fixedDays ?? [])].sort((a, b) => a.weekday - b.weekday)) {
    if (seenFixed.has(f.weekday)) continue;
    seenFixed.add(f.weekday);
    if (blocked.has(f.weekday)) {
      blockedHint(f.weekday);
      continue;
    }
    keptFixed.push({ ...f });
    if (isOccupied(f.weekday)) share(f.weekday);
    else mine.add(f.weekday);
  }

  // 2) Eigene Tage zuerst (M7): freie Tage aus der Auswahl.
  const pendingLoose = [];
  const pendingHard = [];
  for (const d of wanted) {
    if (seenFixed.has(d)) continue;
    if (blocked.has(d)) blockedHint(d);
    else if (!isOccupied(d)) mine.add(d);
    else (isHardOccupied(d) ? pendingHard : pendingLoose).push(d);
  }

  // 3) Teilen nur als Ausnahme: lockere Tage zuerst, harte nur ohne jede Lücke.
  pendingLoose.forEach(share);
  const gapLeft = [1, 2, 3, 4, 5, 6, 7].some((d) => !blocked.has(d) && !isOccupied(d) && !mine.has(d));
  if (!gapLeft) pendingHard.forEach(share);

  const days = uniqueSorted([...mine, ...shared]);
  if (days.length < wanted.length) {
    hints.push(
      hint(
        "DAYS_SHORT",
        `${label} bekommt ${days.length} statt ${wanted.length} Tage. Die Stunden bleiben, die Einheiten werden länger.`,
        s.sport
      )
    );
  }
  if (days.length > 0 && s.hours / days.length > MAX_HOURS_PER_DAY) {
    hints.push(
      hint("HOURS_DENSE", `${s.hours} h auf ${days.length} Tage sind viele Stunden pro Tag. Mehr Tage würden entlasten.`, s.sport)
    );
  }

  // 4) Harte Tage über Pins steuern (generatePlan wählt sie sonst selbst).
  const otherHard = [...occupancy.entries()].filter(([, o]) => o.some((x) => x.hard)).map(([d]) => d);
  const forbidden = forbiddenDays(otherHard);
  const hardFixed = keptFixed.filter((f) => isHardFixed(s.sport, f.typ)).map((f) => f.weekday);
  for (const d of hardFixed) {
    if (forbidden.has(d)) {
      hints.push(hint("HARD_CONFLICT", `Dein fester harter Tag am ${dayName(d)} liegt nah an einer harten Einheit einer anderen Sportart.`, s.sport));
    }
  }
  const natural = qualityWeekdays(days);
  const toPick = Math.max(0, natural.length - hardFixed.length);
  const needsPins = hardFixed.length === 0 ? natural.some((d) => forbidden.has(d)) : toPick > 0;
  let pins = [];
  if (needsPins) {
    const fixedDaysSet = new Set(keptFixed.map((f) => f.weekday));
    const candidates = [...mine].filter((d) => !fixedDaysSet.has(d) && !forbidden.has(d)).sort((a, b) => a - b);
    pins = pickHardDays(candidates, toPick, hardFixed);
    if (pins.length === 0) {
      hints.push(
        hint(
          "HARD_DAY_MISSING",
          `Für harte ${label}-Einheiten ist kein Tag mit Abstand zu harten Einheiten anderer Sportarten frei. Zur Orientierung: andere Tage wählen oder ${label} locker halten.`,
          s.sport
        )
      );
    } else if (pins.length < toPick) {
      hints.push(
        hint(
          "HARD_DAY_REDUCED",
          `Nur ${pins.length} von ${toPick} harten ${label}-Tagen passen mit Abstand zu den harten Einheiten anderer Sportarten.`,
          s.sport
        )
      );
    }
  }
  const pinsComplete = needsPins && pins.length === toPick;
  const hardSet = new Set([...hardFixed, ...pins, ...(pinsComplete ? [] : natural)]);
  for (const d of days) occupancy.set(d, [...(occupancy.get(d) ?? []), { sport: s.sport, hard: hardSet.has(d) }]);

  const fixedDays = [...keptFixed, ...pins.map((weekday) => ({ weekday, typ: FIXED_INTERVAL_TYP, keepInRecoveryWeek: false }))].sort(
    (a, b) => a.weekday - b.weekday
  );
  return { sport: s.sport, weeklyHours: s.hours, trainingWeekdays: days, fixedDays };
}

/**
 * Verteilt Trainingstage, feste Tage und harte Tage auf mehrere Sportarten.
 * Rad steht zuerst und bleibt unberührt (M3); jede weitere Sportart kommt oben
 * drauf (M7: eigene Tage zuerst, Teilen nur als Ausnahme). Stunden bleiben je
 * Sportart erhalten (M2). Keine Sperre (M4): Probleme werden als Hinweis
 * gemeldet, nur Eingabefehler ergeben `ok: false`. Eine einzelne Sportart
 * kommt unverändert und ohne Hinweise zurück.
 * @param {{ sports: Array<{ sport: "ride"|"run"|"swim", hours: number, weekdays: number[], fixedDays?: Array<{weekday:number, typ:string, keepInRecoveryWeek?:boolean, durationMin?:number, environment?:"indoor"}> }>, blockedDays?: number[] }} input
 * @returns {{ ok: true, plans: Array<{ sport: string, weeklyHours: number, trainingWeekdays: number[], fixedDays: object[] }>, hints: Array<{ code: string, text: string, sport: string }> } | { ok: false, error: { code: "VALIDATION", message: string } }}
 */
export function allocateWeek(input) {
  const problem = validate(input);
  if (problem) return fail(problem);

  const blocked = new Set(input.blockedDays ?? []);
  const ordered = [...input.sports].sort((a, b) => SPORT_PRIORITY.indexOf(a.sport) - SPORT_PRIORITY.indexOf(b.sport));
  const occupancy = new Map();
  const hints = [];
  const plans = ordered.map((s, i) =>
    i === 0 ? takeUntouched(s, blocked, occupancy, hints) : allocateAdditional(s, blocked, occupancy, hints)
  );
  return { ok: true, plans, hints };
}

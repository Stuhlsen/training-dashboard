/* Tests: features/settings/goals-view-model.ts — Fahrplan 43 E4.
 * Die Komponente rendert nur; Auswahl, Rollen, Validierung, Konflikthinweis
 * und Ziel-Check-Texte stehen hier. */

import { describe, expect, it } from "vitest";
import { GOAL_CATALOG } from "../../core/goals.js";
import type { Goal, GoalKey } from "../../api/types";
import {
  buildFtpCheck,
  buildGoalInput,
  canEditGoals,
  catalogChoices,
  conflictHint,
  defaultRole,
  describeGoal,
  fieldsFor,
  groupGoals,
  mergedEftpHistory,
  pickCheckGoal,
  replaceNotice,
  replacementFor,
  saveErrorMessage,
  type GoalFormState,
} from "./goals-view-model";

const TODAY = "2026-11-05";

function goal(over: Partial<Goal> & { id: string }): Goal {
  return {
    kind: "x",
    targetValue: null,
    targetDate: null,
    note: null,
    isActive: true,
    goalKey: null,
    role: null,
    ...over,
  };
}

function form(over: Partial<GoalFormState> = {}): GoalFormState {
  return { goalKey: "ftp", role: "main", targetValue: "280", targetDate: "", freeText: "", ...over };
}

describe("canEditGoals (Z8: nur der Athlet selbst schreibt)", () => {
  it("Athlet: ja", () => expect(canEditGoals({ role: "athlete" })).toBe(true));
  it("Trainer: nein", () => expect(canEditGoals({ role: "coach" })).toBe(false));
  it("ohne Profil: nein", () => expect(canEditGoals(null)).toBe(false));
});

describe("groupGoals", () => {
  it("trennt Hauptziel, Nebenziel und alte Freitext-Ziele", () => {
    const g = groupGoals([
      goal({ id: "old", kind: "Freitext" }),
      goal({ id: "m", role: "main", goalKey: "ftp" }),
      goal({ id: "s", role: "side", goalKey: "bergauf" }),
    ]);
    expect(g.main?.id).toBe("m");
    expect(g.side?.id).toBe("s");
    expect(g.legacy.map((x) => x.id)).toEqual(["old"]);
  });

  it("zählt Ziele ohne Rolle nie als Haupt- oder Nebenziel (auch nicht mit goalKey)", () => {
    const g = groupGoals([goal({ id: "a", role: null, goalKey: "ftp" })]);
    expect(g.main).toBeNull();
    expect(g.side).toBeNull();
    expect(g.legacy).toHaveLength(1);
  });

  it("leere Liste", () => {
    expect(groupGoals([])).toEqual({ main: null, side: null, legacy: [] });
  });
});

describe("catalogChoices (Sportart)", () => {
  const keys = (sports: Parameters<typeof catalogChoices>[0], keep?: GoalKey | null) =>
    catalogChoices(sports, keep).map((e) => e.key);

  it("nur Rad: kein 'Laufen starten'", () => {
    expect(keys(["ride"])).not.toContain("laufen_starten");
    expect(keys(["ride"])).toContain("ftp");
  });

  it("nur Laufen: kein FTP", () => {
    expect(keys(["run"])).not.toContain("ftp");
    expect(keys(["run"])).toContain("laufen_starten");
  });

  it("ohne bekannte Sportarten: alle Ziele", () => {
    expect(keys([])).toHaveLength(GOAL_CATALOG.length);
  });

  it("ein schon gesetztes Ziel bleibt wählbar, auch wenn die Sportart nicht mehr passt", () => {
    expect(keys(["run"], "ftp")).toContain("ftp");
  });

  it("muskeln_kraft bleibt wählbar", () => {
    expect(keys(["ride"])).toContain("muskeln_kraft");
  });
});

describe("fieldsFor", () => {
  it("FTP: Zielwert in Watt, Pflicht", () => {
    expect(fieldsFor("ftp")).toMatchObject({ showValue: true, valueUnit: "W", valueRequired: true, showFreeText: false });
  });

  it("Fett verlieren: hier nie ein Gewichtswert (der liegt in nutrition_goals)", () => {
    expect(fieldsFor("fett_verlieren").showValue).toBe(false);
  });

  it("Ziele ohne Zielwert zeigen kein Wertfeld", () => {
    for (const k of ["ausdauer", "bergauf", "event", "fit_bleiben"] as const) {
      expect(fieldsFor(k).showValue).toBe(false);
    }
  });

  it("Sonstiges: Freitextfeld und sichtbarer Hinweis auf 'nur Notiz'", () => {
    const f = fieldsFor("sonstiges");
    expect(f.showFreeText).toBe(true);
    expect(f.notice).toMatch(/Notiz/);
    expect(f.notice).toMatch(/keine Wirkung/i);
  });

  it("Muskeln/Kraft: offener Hinweis, dass es bis zum Kraftbereich nur die Ernährung betrifft", () => {
    const f = fieldsFor("muskeln_kraft");
    expect(f.notice).toMatch(/Kraftbereich/);
    expect(f.notice).toMatch(/Ernährung/);
  });

  it("Ziele ohne Besonderheit haben keinen Hinweis", () => {
    expect(fieldsFor("ausdauer").notice).toBeNull();
  });

  it("noch nichts gewählt: neutral", () => {
    expect(fieldsFor("")).toMatchObject({ showValue: false, showFreeText: false, notice: null });
  });
});

describe("buildGoalInput", () => {
  it("Falle B: ein FTP-Ziel speichert kind = 'FTP' (pickFtpGoal liest kind)", () => {
    const r = buildGoalInput(form(), TODAY);
    expect(r).toEqual({
      ok: true,
      input: { kind: "FTP", goalKey: "ftp", role: "main", targetValue: 280, targetDate: null, note: null },
    });
  });

  it("alle anderen Katalogziele speichern das Label als kind – und keines enthält 'ftp'", () => {
    for (const entry of GOAL_CATALOG) {
      if (entry.key === "ftp" || entry.key === "sonstiges") continue;
      const r = buildGoalInput(form({ goalKey: entry.key, targetValue: "" }), TODAY);
      expect(r.ok && r.input.kind).toBe(entry.label);
      expect(entry.label.toLowerCase()).not.toContain("ftp");
    }
  });

  it("FTP ohne oder mit ungültigem Zielwert: Fehler", () => {
    for (const v of ["", "0", "-5", "abc"]) {
      expect(buildGoalInput(form({ targetValue: v }), TODAY).ok).toBe(false);
    }
  });

  it("kein Ziel gewählt: Fehler", () => {
    expect(buildGoalInput(form({ goalKey: "" }), TODAY).ok).toBe(false);
  });

  it("Ziele ohne Zielwert ignorieren einen liegengebliebenen Wert", () => {
    const r = buildGoalInput(form({ goalKey: "bergauf", targetValue: "123" }), TODAY);
    expect(r.ok && r.input.targetValue).toBeNull();
  });

  it("Fett verlieren schreibt hier nie einen Gewichtswert", () => {
    const r = buildGoalInput(form({ goalKey: "fett_verlieren", targetValue: "70" }), TODAY);
    expect(r.ok && r.input.targetValue).toBeNull();
  });

  it("Sonstiges: Freitext Pflicht, wird (getrimmt) zu kind, kein Zielwert", () => {
    expect(buildGoalInput(form({ goalKey: "sonstiges", freeText: "   " }), TODAY).ok).toBe(false);
    const r = buildGoalInput(form({ goalKey: "sonstiges", freeText: "  Alpencross  ", targetValue: "5" }), TODAY);
    expect(r).toMatchObject({ ok: true, input: { kind: "Alpencross", goalKey: "sonstiges", targetValue: null } });
  });

  it("Datum ist optional", () => {
    const r = buildGoalInput(form({ targetDate: "" }), TODAY);
    expect(r.ok && r.input.targetDate).toBeNull();
  });

  it("Datum heute oder später ist gültig, in der Vergangenheit nicht", () => {
    expect(buildGoalInput(form({ targetDate: TODAY }), TODAY).ok).toBe(true);
    expect(buildGoalInput(form({ targetDate: "2027-03-01" }), TODAY)).toMatchObject({
      ok: true,
      input: { targetDate: "2027-03-01" },
    });
    expect(buildGoalInput(form({ targetDate: "2026-11-04" }), TODAY).ok).toBe(false);
  });

  it("ungültiges Datumsformat: Fehler", () => {
    expect(buildGoalInput(form({ targetDate: "01.03.2027" }), TODAY).ok).toBe(false);
  });

  it("gibt die gewählte Rolle weiter", () => {
    const r = buildGoalInput(form({ goalKey: "bergauf", role: "side", targetValue: "" }), TODAY);
    expect(r.ok && r.input.role).toBe("side");
  });
});

describe("Rollen", () => {
  const g = groupGoals([
    goal({ id: "m", role: "main", goalKey: "ftp", kind: "FTP" }),
    goal({ id: "legacy", kind: "Altlast" }),
  ]);

  it("replacementFor: belegte Rolle liefert das alte Ziel, freie nichts", () => {
    expect(replacementFor(g, "main")?.id).toBe("m");
    expect(replacementFor(g, "side")).toBeNull();
  });

  it("alte Freitext-Ziele werden nie ersetzt", () => {
    expect(replacementFor(groupGoals([goal({ id: "legacy" })]), "main")).toBeNull();
  });

  it("defaultRole: erst Hauptziel, dann Nebenziel", () => {
    expect(defaultRole(groupGoals([]))).toBe("main");
    expect(defaultRole(g)).toBe("side");
    const both = groupGoals([goal({ id: "m", role: "main" }), goal({ id: "s", role: "side" })]);
    expect(defaultRole(both)).toBe("main");
  });
});

describe("conflictHint (nur Hinweis, nie Sperre)", () => {
  const g = groupGoals([
    goal({ id: "m", role: "main", goalKey: "ftp" }),
    goal({ id: "s", role: "side", goalKey: "muskeln_kraft" }),
  ]);

  it("gespeicherte Kombination ohne Entwurf", () => {
    const g2 = groupGoals([
      goal({ id: "m", role: "main", goalKey: "fett_verlieren" }),
      goal({ id: "s", role: "side", goalKey: "muskeln_kraft" }),
    ]);
    expect(conflictHint(g2, null)).toMatch(/Defizit/);
  });

  it("Entwurf wird mit dem Ziel der anderen Rolle verglichen", () => {
    expect(conflictHint(g, { goalKey: "fett_verlieren", role: "main" })).toMatch(/Defizit/);
  });

  it("der Entwurf ersetzt das Ziel seiner Rolle, es zählt nicht doppelt", () => {
    // main ftp wird durch fit_bleiben ersetzt → Paar (fit_bleiben, muskeln_kraft) ohne Hinweis
    expect(conflictHint(g, { goalKey: "fit_bleiben", role: "main" })).toBe("");
  });

  it("kein Konflikt: leerer Text", () => {
    expect(conflictHint(groupGoals([]), null)).toBe("");
    expect(conflictHint(groupGoals([]), { goalKey: "ftp", role: "main" })).toBe("");
  });

  it("Entwurf ohne gewähltes Ziel verändert nichts", () => {
    expect(conflictHint(g, { goalKey: "", role: "main" })).toBe("");
  });
});

describe("describeGoal", () => {
  it("Hauptziel FTP mit Wert und Datum", () => {
    const d = describeGoal(
      goal({ id: "m", role: "main", goalKey: "ftp", kind: "FTP", targetValue: 280, targetDate: "2027-03-01" }),
    );
    expect(d).toMatchObject({ roleLabel: "Hauptziel", title: "FTP steigern", valueText: "280 W", dateText: "01.03.2027" });
  });

  it("Nebenziel", () => {
    expect(describeGoal(goal({ id: "s", role: "side", goalKey: "bergauf", kind: "Besser bergauf" })).roleLabel).toBe("Nebenziel");
  });

  it("Sonstiges zeigt den Freitext und den Notiz-Hinweis", () => {
    const d = describeGoal(goal({ id: "s", role: "side", goalKey: "sonstiges", kind: "Alpencross" }));
    expect(d.title).toBe("Alpencross");
    expect(d.notice).toMatch(/Notiz/);
  });

  it("Muskeln/Kraft zeigt den Kraftbereich-Hinweis", () => {
    expect(describeGoal(goal({ id: "m", role: "main", goalKey: "muskeln_kraft" })).notice).toMatch(/Kraftbereich/);
  });

  it("altes Freitext-Ziel: kind als Titel, keine Rolle, 'FTP' bekommt auch hier Watt", () => {
    const d = describeGoal(goal({ id: "o", kind: "FTP", targetValue: 250 }));
    expect(d.roleLabel).toBeNull();
    expect(d.title).toBe("FTP");
    expect(d.valueText).toBe("250 W");
  });

  it("zeigt nie einen Gewichtswert (Fett verlieren)", () => {
    const d = describeGoal(goal({ id: "m", role: "main", goalKey: "fett_verlieren", targetValue: 70 }));
    expect(d.valueText).toBe("");
  });
});

describe("pickCheckGoal", () => {
  it("das FTP-Ziel mit positivem Wert aus Haupt- oder Nebenziel", () => {
    const g = groupGoals([
      goal({ id: "m", role: "main", goalKey: "ausdauer" }),
      goal({ id: "s", role: "side", goalKey: "ftp", targetValue: 280 }),
    ]);
    expect(pickCheckGoal(g)?.id).toBe("s");
  });

  it("ohne FTP-Ziel oder ohne Wert: null", () => {
    expect(pickCheckGoal(groupGoals([goal({ id: "m", role: "main", goalKey: "ausdauer" })]))).toBeNull();
    expect(pickCheckGoal(groupGoals([goal({ id: "m", role: "main", goalKey: "ftp", targetValue: null })]))).toBeNull();
  });

  it("alte Freitext-FTP-Ziele (ohne Rolle) werden nicht geprüft", () => {
    expect(pickCheckGoal(groupGoals([goal({ id: "o", kind: "FTP", targetValue: 250 })]))).toBeNull();
  });
});

describe("mergedEftpHistory", () => {
  it("nutzt dieselbe gemergte Quelle wie Hero und Analyse (ohne Daten: leer)", () => {
    expect(mergedEftpHistory([], [])).toEqual([]);
  });
});

/* ── Ziel-Check ─────────────────────────────────────────────────── */

/** 9 Wochenwerte bis heute, +2 W pro Woche. */
const RISING = Array.from({ length: 9 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 8, 10) + i * 7 * 86400000);
  return { date: d.toISOString().split("T")[0], eftp: 240 + 2 * i };
});
const FLAT = RISING.map((h) => ({ ...h, eftp: 250 }));

const JUDGING = /schaffst|unrealistisch|aussichtslos|zu ambitioniert|leider|nicht erreichbar|solltest/i;

function allText(v: NonNullable<ReturnType<typeof buildFtpCheck>>): string {
  if (v.kind !== "result") return v.text;
  return [v.headline, v.confidence, ...v.rows.flatMap((r) => [r.label, r.value])].join(" | ");
}

describe("buildFtpCheck", () => {
  const target = { targetValue: 280, targetDate: "2027-03-01" };

  it("ohne Zielwert: nichts zu prüfen", () => {
    expect(buildFtpCheck({ goal: { targetValue: null, targetDate: null }, current: 250, history: RISING, todayISO: TODAY })).toBeNull();
  });

  it("ohne bekannte aktuelle FTP: sagt das offen", () => {
    const v = buildFtpCheck({ goal: target, current: null, history: RISING, todayISO: TODAY });
    expect(v?.kind).toBe("needs-current");
  });

  it("zu wenig Daten: sagt das offen und zeigt keine Zahlen", () => {
    const v = buildFtpCheck({ goal: target, current: 256, history: RISING.slice(0, 2), todayISO: TODAY });
    expect(v?.kind).toBe("too-little-data");
    expect(v && allText(v)).not.toMatch(/\d/);
    expect(v && allText(v)).toMatch(/reichen/);
  });

  it("veraltete Daten gelten als zu wenig Daten", () => {
    const v = buildFtpCheck({ goal: target, current: 256, history: RISING, todayISO: "2027-01-15" });
    expect(v?.kind).toBe("too-little-data");
  });

  it("Trend über dem nötigen Tempo: Zahlen, Zwischenziel, Sicherheit", () => {
    const v = buildFtpCheck({ goal: target, current: 256, history: RISING, todayISO: TODAY });
    expect(v?.kind).toBe("result");
    if (v?.kind !== "result") return;
    const rows = Object.fromEntries(v.rows.map((r) => [r.label, r.value]));
    expect(v.headline).toBe("Der Trend liegt über dem nötigen Tempo.");
    expect(rows["Aktuelle FTP"]).toBe("256 W");
    expect(rows["Trend (eFTP)"]).toBe("+2 W pro Woche");
    expect(rows["Nötiges Tempo"]).toBe("1,4 W pro Woche bis 01.03.2027");
    expect(rows["Prognose zum Zieldatum"]).toMatch(/^\d+ W \(Spanne \d+–\d+ W\)$/);
    expect(rows["Voraussichtlich erreicht"]).toBe("ca. 28.01.2027");
    expect(rows["Zwischenziel"]).toBe("270 W bis 17.12.2026");
    expect(v.confidence).toMatch(/^Sicherheit der Aussage: (hoch|mittel|niedrig)/);
  });

  it("Trend unter dem nötigen Tempo: nur Fakten", () => {
    // 280 W ist weniger als 10 % über 256 W, aber bis 01.12. nötig: 24 W in ~3,7 Wochen.
    const v = buildFtpCheck({ goal: { targetValue: 280, targetDate: "2026-12-01" }, current: 256, history: RISING, todayISO: TODAY });
    expect(v?.kind === "result" && v.headline).toBe("Der Trend liegt unter dem nötigen Tempo.");
  });

  it("flacher Trend: sagt das als Fakt, kein Datum", () => {
    const v = buildFtpCheck({ goal: target, current: 250, history: FLAT, todayISO: TODAY });
    expect(v?.kind).toBe("result");
    if (v?.kind !== "result") return;
    expect(v.headline).toBe("Der Trend ist flach oder fallend.");
    const rows = Object.fromEntries(v.rows.map((r) => [r.label, r.value]));
    expect(rows["Voraussichtlich erreicht"]).toBe("bei flachem Trend nicht absehbar");
  });

  it("Ziel mehr als 10 % über der aktuellen FTP: als Fakt benannt", () => {
    const v = buildFtpCheck({ goal: { targetValue: 330, targetDate: "2027-03-01" }, current: 256, history: RISING, todayISO: TODAY });
    expect(v?.kind === "result" && v.headline).toBe("Das Ziel liegt mehr als 10 % über der aktuellen FTP.");
  });

  it("ohne Datum: kein nötiges Tempo, keine Prognose, aber voraussichtliches Datum", () => {
    const v = buildFtpCheck({ goal: { targetValue: 280, targetDate: null }, current: 256, history: RISING, todayISO: TODAY });
    expect(v?.kind).toBe("result");
    if (v?.kind !== "result") return;
    const labels = v.rows.map((r) => r.label);
    expect(v.headline).toBe("Ohne Zieldatum: so sähe es beim aktuellen Tempo aus.");
    expect(labels).not.toContain("Nötiges Tempo");
    expect(labels).not.toContain("Prognose zum Zieldatum");
    expect(labels).toContain("Voraussichtlich erreicht");
  });

  it("Ziel schon erreicht: sagt das, ohne Zwischenziel", () => {
    const v = buildFtpCheck({ goal: { targetValue: 250, targetDate: null }, current: 256, history: RISING, todayISO: TODAY });
    expect(v?.kind === "result" && v.headline).toBe("Die aktuelle FTP liegt bei oder über dem Ziel.");
    expect(v?.kind === "result" && v.rows.map((r) => r.label)).not.toContain("Zwischenziel");
  });

  it("Ziel schon erreicht, auch ohne eFTP-Daten", () => {
    const v = buildFtpCheck({ goal: { targetValue: 250, targetDate: null }, current: 256, history: [], todayISO: TODAY });
    expect(v?.kind === "result" && v.headline).toBe("Die aktuelle FTP liegt bei oder über dem Ziel.");
  });

  it("bewertet nie ('schaffst du nicht' & Co.), in keinem Fall", () => {
    const cases = [
      buildFtpCheck({ goal: target, current: 256, history: RISING, todayISO: TODAY }),
      buildFtpCheck({ goal: { targetValue: 280, targetDate: "2026-12-01" }, current: 256, history: RISING, todayISO: TODAY }),
      buildFtpCheck({ goal: target, current: 250, history: FLAT, todayISO: TODAY }),
      buildFtpCheck({ goal: { targetValue: 330, targetDate: "2027-03-01" }, current: 256, history: RISING, todayISO: TODAY }),
      buildFtpCheck({ goal: target, current: 256, history: RISING.slice(0, 2), todayISO: TODAY }),
      buildFtpCheck({ goal: target, current: null, history: RISING, todayISO: TODAY }),
    ];
    for (const c of cases) {
      expect(c).not.toBeNull();
      expect(allText(c!)).not.toMatch(JUDGING);
    }
  });
});

describe("saveErrorMessage (Falle A: Fehlerfall beim Ersetzen)", () => {
  it("Ersetzen gescheitert, altes Ziel wieder aktiv: sagt, dass es aktiv bleibt", () => {
    expect(saveErrorMessage("insert kaputt", true)).toBe(
      "Das Ziel konnte nicht gespeichert werden. Dein bisheriges Ziel bleibt aktiv.",
    );
  });

  it("Rolle war frei: keine Aussage über ein bisheriges Ziel", () => {
    expect(saveErrorMessage("insert kaputt", false)).toBe("Das Ziel konnte nicht gespeichert werden.");
  });

  it("auch das Reaktivieren scheiterte: sagt das offen", () => {
    const msg = saveErrorMessage("boom — das bisherige Ziel blieb inaktiv (x).", true);
    expect(msg).toMatch(/nicht wieder aktiviert/);
    expect(msg).toMatch(/prüfe/i);
  });

  it("ohne Fehlertext", () => {
    expect(saveErrorMessage(undefined, true)).toMatch(/nicht gespeichert/);
  });
});

describe("replaceNotice (offen sagen, was ersetzt wird)", () => {
  const g = groupGoals([goal({ id: "m", role: "main", goalKey: "ausdauer", kind: "Ausdauer" })]);

  it("belegte Rolle: nennt Rolle und Titel, sagt 'beendet, nicht gelöscht'", () => {
    const t = replaceNotice(g, "main");
    expect(t).toMatch(/Hauptziel/);
    expect(t).toMatch(/Ausdauer/);
    expect(t).toMatch(/beendet, nicht gelöscht/);
  });

  it("freie Rolle: kein Text", () => {
    expect(replaceNotice(g, "side")).toBe("");
  });
});

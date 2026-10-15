/* Tests: Zonen-Erklärtexte (core/zone-explanations.js) und Quellen
   (core/zone-sources.js) — Fahrplan 24, E1. Erwartungen werden aus den
   Zonen-Definitionen in sports/* abgeleitet, nicht hart verdrahtet. */

import { test } from "vitest";
import assert from "node:assert/strict";
import {
  ZONE_EXPLANATIONS,
  EASY_ZONE_ID_BY_SPORT,
  EASY_ZONE_SHARE_SENTENCE,
  SWIMMING_HR_HINT,
} from "./zone-explanations.js";
import { SOURCE_BY_KEY, ZONE_SOURCES } from "./zone-sources.js";
import { cyclingZones } from "../sports/cycling/zones.js";
import { runningZones } from "../sports/running/zones.js";
import { swimmingZones } from "../sports/swimming/zones.js";
import { HR_ZONES } from "../sports/cycling/metrics.js";
import { RUNNING_HR_ZONES } from "../sports/running/metrics.js";
import { SWIMMING_HR_ZONES } from "../sports/swimming/metrics.js";

const SPORTS = {
  cycling: { zones: cyclingZones, hr: HR_ZONES },
  running: { zones: runningZones, hr: RUNNING_HR_ZONES },
  swimming: { zones: swimmingZones, hr: SWIMMING_HR_ZONES },
};

const FIELDS = ["kurz", "gefuehl", "wofuer", "dauer"];

function assertComplete(entry, where) {
  for (const f of FIELDS) {
    assert.equal(typeof entry[f], "string", `${where}: ${f} ist kein String`);
    assert.ok(entry[f].trim().length > 0, `${where}: ${f} ist leer`);
  }
  assert.ok(Array.isArray(entry.quelleKeys), `${where}: quelleKeys fehlt`);
}

for (const [sport, def] of Object.entries(SPORTS)) {
  test(`${sport}: Schwellen-Zonen — jede Zone hat einen vollständigen Text, ids passen zu ZoneMeta`, () => {
    const texts = ZONE_EXPLANATIONS[sport].zonen;
    const metaIds = def.zones.meta.map((m) => m.id);
    assert.deepEqual(texts.map((t) => t.id), metaIds);
    for (const t of texts) assertComplete(t, `${sport}/${t.id}`);
  });

  test(`${sport}: HF-Zonen — jede Zone hat einen vollständigen Text, ids passen zu den HR-Zonen-Schlüsseln`, () => {
    const texts = ZONE_EXPLANATIONS[sport].hf;
    assert.deepEqual(texts.map((t) => t.id), Object.keys(def.hr));
    for (const t of texts) assertComplete(t, `${sport}/hf/${t.id}`);
  });

  test(`${sport}: vorgewählte Easy-Zone existiert unter den Schwellen-Zonen`, () => {
    assert.ok(def.zones.meta.some((m) => m.id === EASY_ZONE_ID_BY_SPORT[sport]));
  });
}

test("alle quelleKeys verweisen auf vorhandene Quellen", () => {
  const all = [];
  for (const s of Object.values(ZONE_EXPLANATIONS)) all.push(...s.zonen, ...s.hf);
  for (const e of all) for (const k of e.quelleKeys) assert.ok(SOURCE_BY_KEY.has(k), `unbekannter Schlüssel ${k}`);
  for (const k of [...EASY_ZONE_SHARE_SENTENCE.quelleKeys, ...SWIMMING_HR_HINT.quelleKeys]) {
    assert.ok(SOURCE_BY_KEY.has(k), `unbekannter Schlüssel ${k}`);
  }
});

test("Quellenliste: Schlüssel eindeutig, Pflichtfelder gefüllt", () => {
  assert.equal(new Set(ZONE_SOURCES.map((s) => s.key)).size, ZONE_SOURCES.length);
  for (const s of ZONE_SOURCES) {
    assert.ok(s.title && s.note, `${s.key}: title/note fehlt`);
    if (s.url) assert.match(s.url, /^https:\/\//);
  }
});

test("Easy-Satz und Wasser-HF-Hinweis haben Text und Quelle", () => {
  for (const c of [EASY_ZONE_SHARE_SENTENCE, SWIMMING_HR_HINT]) {
    assert.ok(c.text.trim().length > 0);
    assert.ok(c.quelleKeys.length > 0);
  }
});

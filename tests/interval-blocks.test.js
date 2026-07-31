/* Tests: scripts/lib/interval-blocks.js::longestBlockAboveThreshold()
   Regressionsfälle nutzen die echten icu_intervals-Segmente der beiden
   Kalibrierungsfahrten vom 30.07.2026 (Athlet 1, FTP 193 im Zeitraum):
   10.07.2026 (verifiziert Z2 Dauer, kein Sweet-Spot-Block erwartet) und
   21.07.2026 (verifiziert Sweet Spot, durchgehend IF 0,93). */

import { test } from "node:test";
import assert from "node:assert/strict";
import { longestBlockAboveThreshold } from "../scripts/lib/interval-blocks.js";

const FTP = 193;
const THRESHOLD_WATTS = Math.round(FTP * 0.9); // 174 — Sweet-Spot-Unterkante

// Echte icu_intervals-Segmente, 10.07.2026 (activity id i164480043).
const SEGMENTS_10_07 = [
  { start_time: 0, end_time: 1541, average_watts: 126, type: "RECOVERY" },
  { start_time: 1541, end_time: 1753, average_watts: 147, type: "WORK" },
  { start_time: 1753, end_time: 3295, average_watts: 136, type: "RECOVERY" },
  { start_time: 3295, end_time: 3480, average_watts: 157, type: "WORK" },
  { start_time: 3480, end_time: 7946, average_watts: 132, type: "RECOVERY" },
  { start_time: 7946, end_time: 7960, average_watts: 364, type: "WORK" },
  { start_time: 7960, end_time: 8028, average_watts: 102, type: "RECOVERY" },
  { start_time: 8028, end_time: 8038, average_watts: 348, type: "WORK" },
  { start_time: 8038, end_time: 8134, average_watts: 122, type: "RECOVERY" },
  { start_time: 8134, end_time: 8143, average_watts: 312, type: "WORK" },
  { start_time: 8143, end_time: 8204, average_watts: 169, type: "RECOVERY" },
  { start_time: 8204, end_time: 8212, average_watts: 367, type: "WORK" },
  { start_time: 8212, end_time: 8264, average_watts: 128, type: "RECOVERY" },
  { start_time: 8264, end_time: 8278, average_watts: 338, type: "WORK" },
  { start_time: 8278, end_time: 8848, average_watts: 162, type: "RECOVERY" },
  { start_time: 8848, end_time: 8901, average_watts: 226, type: "WORK" },
  { start_time: 8901, end_time: 8999, average_watts: 141, type: "RECOVERY" },
  { start_time: 8999, end_time: 9009, average_watts: 367, type: "WORK" },
  { start_time: 9009, end_time: 10060, average_watts: 93, type: "RECOVERY" },
  { start_time: 10060, end_time: 10076, average_watts: 297, type: "WORK" },
  { start_time: 10076, end_time: 10251, average_watts: 153, type: "RECOVERY" },
  { start_time: 10251, end_time: 10260, average_watts: 379, type: "WORK" },
  { start_time: 10260, end_time: 10658, average_watts: 161, type: "RECOVERY" },
  { start_time: 10658, end_time: 10668, average_watts: 316, type: "WORK" },
  { start_time: 10668, end_time: 10858, average_watts: 153, type: "RECOVERY" },
  { start_time: 10858, end_time: 10870, average_watts: 323, type: "WORK" },
  { start_time: 10870, end_time: 11314, average_watts: 145, type: "RECOVERY" },
  { start_time: 11314, end_time: 11325, average_watts: 311, type: "WORK" },
  { start_time: 11325, end_time: 11340, average_watts: 47, type: "RECOVERY" },
  { start_time: 11340, end_time: 11347, average_watts: 391, type: "WORK" },
  { start_time: 11347, end_time: 11391, average_watts: 52, type: "RECOVERY" },
  { start_time: 11391, end_time: 11398, average_watts: 351, type: "WORK" },
  { start_time: 11398, end_time: 11972, average_watts: 54, type: "RECOVERY" },
];

// Echte icu_intervals-Segmente, 21.07.2026 (activity id i167827258).
const SEGMENTS_21_07 = [
  { start_time: 0, end_time: 2281, average_watts: 80, type: "RECOVERY" },
  { start_time: 2281, end_time: 2310, average_watts: 211, type: "WORK" },
  { start_time: 2310, end_time: 2342, average_watts: 153, type: "RECOVERY" },
  { start_time: 2342, end_time: 2370, average_watts: 246, type: "WORK" },
  { start_time: 2370, end_time: 2374, average_watts: 182, type: "RECOVERY" },
  { start_time: 2374, end_time: 2647, average_watts: 205, type: "WORK" },
  { start_time: 2647, end_time: 2657, average_watts: 322, type: "WORK" },
  { start_time: 2657, end_time: 3154, average_watts: 168, type: "RECOVERY" },
  { start_time: 3154, end_time: 3235, average_watts: 225, type: "WORK" },
  { start_time: 3235, end_time: 3320, average_watts: 166, type: "RECOVERY" },
  { start_time: 3320, end_time: 3404, average_watts: 181, type: "WORK" },
  { start_time: 3404, end_time: 3536, average_watts: 180, type: "RECOVERY" },
  { start_time: 3536, end_time: 3550, average_watts: 300, type: "WORK" },
  { start_time: 3550, end_time: 3668, average_watts: 175, type: "RECOVERY" },
  { start_time: 3668, end_time: 3724, average_watts: 232, type: "WORK" },
  { start_time: 3724, end_time: 3756, average_watts: 241, type: "RECOVERY" },
  { start_time: 3756, end_time: 3830, average_watts: 235, type: "WORK" },
  { start_time: 3830, end_time: 3839, average_watts: 175, type: "RECOVERY" },
  { start_time: 3839, end_time: 3868, average_watts: 228, type: "WORK" },
  { start_time: 3868, end_time: 4713, average_watts: 162, type: "RECOVERY" },
  { start_time: 4713, end_time: 4856, average_watts: 237, type: "WORK" },
  { start_time: 4856, end_time: 4925, average_watts: 182, type: "RECOVERY" },
  { start_time: 4925, end_time: 4960, average_watts: 282, type: "WORK" },
  { start_time: 4960, end_time: 4972, average_watts: 199, type: "RECOVERY" },
  { start_time: 4972, end_time: 5285, average_watts: 230, type: "WORK" },
  { start_time: 5285, end_time: 5567, average_watts: 145, type: "RECOVERY" },
  { start_time: 5567, end_time: 5586, average_watts: 343, type: "WORK" },
  { start_time: 5586, end_time: 6134, average_watts: 152, type: "RECOVERY" },
  { start_time: 6134, end_time: 6142, average_watts: 295, type: "WORK" },
  { start_time: 6142, end_time: 7037, average_watts: 147, type: "RECOVERY" },
  { start_time: 7037, end_time: 7283, average_watts: 179, type: "WORK" },
  { start_time: 7283, end_time: 7465, average_watts: 179, type: "RECOVERY" },
  { start_time: 7465, end_time: 7629, average_watts: 229, type: "WORK" },
  { start_time: 7629, end_time: 7775, average_watts: 134, type: "RECOVERY" },
  { start_time: 7775, end_time: 7862, average_watts: 212, type: "WORK" },
  { start_time: 7862, end_time: 7921, average_watts: 152, type: "RECOVERY" },
  { start_time: 7921, end_time: 7975, average_watts: 242, type: "WORK" },
  { start_time: 7975, end_time: 8027, average_watts: 115, type: "RECOVERY" },
  { start_time: 8027, end_time: 8039, average_watts: 300, type: "WORK" },
  { start_time: 8039, end_time: 8249, average_watts: 144, type: "RECOVERY" },
  { start_time: 8249, end_time: 8257, average_watts: 290, type: "WORK" },
  { start_time: 8257, end_time: 8269, average_watts: 163, type: "RECOVERY" },
  { start_time: 8269, end_time: 8320, average_watts: 211, type: "WORK" },
  { start_time: 8320, end_time: 8372, average_watts: 237, type: "RECOVERY" },
  { start_time: 8372, end_time: 8405, average_watts: 279, type: "WORK" },
  { start_time: 8405, end_time: 8423, average_watts: 182, type: "RECOVERY" },
  { start_time: 8423, end_time: 8633, average_watts: 219, type: "WORK" },
  { start_time: 8633, end_time: 9506, average_watts: 145, type: "RECOVERY" },
  { start_time: 9506, end_time: 9596, average_watts: 223, type: "WORK" },
  { start_time: 9596, end_time: 9930, average_watts: 149, type: "RECOVERY" },
  { start_time: 9930, end_time: 10165, average_watts: 202, type: "WORK" },
  { start_time: 10165, end_time: 10278, average_watts: 186, type: "RECOVERY" },
  { start_time: 10278, end_time: 10421, average_watts: 217, type: "WORK" },
  { start_time: 10421, end_time: 10925, average_watts: 148, type: "RECOVERY" },
  { start_time: 10925, end_time: 10956, average_watts: 259, type: "WORK" },
  { start_time: 10956, end_time: 12948, average_watts: 73, type: "RECOVERY" },
];

test("longestBlockAboveThreshold: 10.07.2026 (Z2 Dauer, verifiziert) — nur kurze Ausreißer, kein Block", () => {
  const block = longestBlockAboveThreshold(SEGMENTS_10_07, THRESHOLD_WATTS, 90);
  assert.ok(block, "sollte trotzdem den längsten (kurzen) Ausreißer finden");
  assert.equal(block.workDurationSec, 53);
  assert.ok(block.workDurationSec < 120, `erwartet < 2 min, war ${block.workDurationSec}s`);
});

test("longestBlockAboveThreshold: 21.07.2026 (Sweet Spot, verifiziert) — echter zusammenhängender Block", () => {
  const block = longestBlockAboveThreshold(SEGMENTS_21_07, THRESHOLD_WATTS, 90);
  assert.ok(block);
  assert.equal(block.workDurationSec, 629);
  assert.equal(block.totalDurationSec, 714);
  assert.ok(block.workDurationSec > 600, `erwartet > 10 min, war ${block.workDurationSec}s`);
});

test("longestBlockAboveThreshold: 21.07. deutlich länger als 10.07. — der eigentliche Diskriminator", () => {
  const a = longestBlockAboveThreshold(SEGMENTS_10_07, THRESHOLD_WATTS, 90);
  const b = longestBlockAboveThreshold(SEGMENTS_21_07, THRESHOLD_WATTS, 90);
  assert.ok(b.workDurationSec > a.workDurationSec * 5);
});

/* ── Grenzfälle (synthetisch) ──────────────────────────────────── */

test("longestBlockAboveThreshold: leeres/fehlendes Segment-Array → null", () => {
  assert.equal(longestBlockAboveThreshold([], 200, 60), null);
  assert.equal(longestBlockAboveThreshold(null, 200, 60), null);
  assert.equal(longestBlockAboveThreshold(undefined, 200, 60), null);
});

test("longestBlockAboveThreshold: kein Segment erreicht die Schwelle → null", () => {
  const segs = [
    { start_time: 0, end_time: 600, average_watts: 100 },
    { start_time: 600, end_time: 1200, average_watts: 120 },
  ];
  assert.equal(longestBlockAboveThreshold(segs, 200, 60), null);
});

test("longestBlockAboveThreshold: kurze Lücke innerhalb der Toleranz reißt den Block nicht ab", () => {
  const segs = [
    { start_time: 0, end_time: 300, average_watts: 220 }, // 5min hart
    { start_time: 300, end_time: 340, average_watts: 100 }, // 40s Pause (Toleranz 60s)
    { start_time: 340, end_time: 640, average_watts: 220 }, // 5min hart
  ];
  const block = longestBlockAboveThreshold(segs, 200, 60);
  assert.equal(block.totalDurationSec, 640); // 0 bis 640, Lücke inklusive
  assert.equal(block.workDurationSec, 600); // nur die beiden Arbeits-Segmente
  assert.equal(block.avgWatts, 220);
});

test("longestBlockAboveThreshold: Lücke länger als Toleranz reißt den Block ab", () => {
  const segs = [
    { start_time: 0, end_time: 300, average_watts: 220 }, // 5min hart
    { start_time: 300, end_time: 420, average_watts: 100 }, // 2min Pause (Toleranz 60s)
    { start_time: 420, end_time: 720, average_watts: 220 }, // 5min hart
  ];
  const block = longestBlockAboveThreshold(segs, 200, 60);
  // Zwei getrennte 5-Minuten-Blöcke — der erste gefundene gewinnt (gleich lang).
  assert.equal(block.workDurationSec, 300);
  assert.equal(block.totalDurationSec, 300);
});

test("longestBlockAboveThreshold: unsortierte Segmente werden trotzdem korrekt zusammengesetzt", () => {
  const inOrder = [
    { start_time: 0, end_time: 300, average_watts: 220 },
    { start_time: 300, end_time: 600, average_watts: 220 },
  ];
  const shuffled = [inOrder[1], inOrder[0]];
  const block = longestBlockAboveThreshold(shuffled, 200, 60);
  assert.equal(block.startSec, 0);
  assert.equal(block.endSec, 600);
  assert.equal(block.workDurationSec, 600);
});

test("longestBlockAboveThreshold: avgWatts ist über die Arbeits-Segmente gewichtet, ignoriert tolerierte Lücken", () => {
  const segs = [
    { start_time: 0, end_time: 100, average_watts: 300 }, // 100s @ 300W
    { start_time: 100, end_time: 130, average_watts: 50 }, // 30s Lücke, toleriert
    { start_time: 130, end_time: 330, average_watts: 200 }, // 200s @ 200W
  ];
  const block = longestBlockAboveThreshold(segs, 200, 60);
  // gewichtet: (100*300 + 200*200) / 300 = 233.33 → 233
  assert.equal(block.avgWatts, 233);
  assert.equal(block.workDurationSec, 300);
  assert.equal(block.totalDurationSec, 330);
});

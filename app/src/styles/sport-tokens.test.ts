/* Tests: Sport-Tokens (Fahrplan 44 E1) — stabile Namen, kein Zonenfarb-Doppel,
   WCAG-AA-Kontrast auf den dunklen Kachelflächen. Liest tokens.css direkt. */
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles/tokens.css", "utf8") /* Vitest läuft im app/-Ordner */;

function token(name: string): string {
  const m = css.match(new RegExp(`${name}: *([^;]+);`));
  if (!m) throw new Error(`Token ${name} fehlt in tokens.css`);
  return m[1].trim();
}

function parseOklch(v: string): [number, number, number] {
  const m = v.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/);
  if (!m) throw new Error(`Kein oklch(): ${v}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

const srgbLin = (c: number) => {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
};

function hexToOklch(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => srgbLin(parseInt(hex.slice(i, i + 2), 16)));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(a, bb), ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360];
}

/** relative Luminanz (WCAG) einer oklch-Farbe, in sRGB geklemmt. */
function oklchLuminance([L, C, H]: [number, number, number]): number {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((c) => Math.min(1, Math.max(0, c)));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function hexLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => srgbLin(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

const SPORTS = ["--sport-ride", "--sport-run", "--sport-swim"];

/** Alle bereits bedeutungstragenden Farben (Zonen, Status, Akzent, Gold). */
const RESERVED: Record<string, [number, number, number]> = {
  "--z1": hexToOklch(token("--z1")),
  "--z2": hexToOklch(token("--z2")),
  "--ss": hexToOklch(token("--ss")),
  "--thr": hexToOklch(token("--thr")),
  "--vo2": hexToOklch(token("--vo2")),
  "--event": hexToOklch(token("--event")),
  "--ok": parseOklch(token("--ok")),
  "--warn": parseOklch(token("--warn")),
  "--danger": parseOklch(token("--danger")),
  "--accent": parseOklch(token("--accent")),
};

const hueDistance = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

describe("Sport-Tokens", () => {
  it("definiert je Sportart genau ein stabiles Token", () => {
    for (const name of SPORTS) expect(() => parseOklch(token(name))).not.toThrow();
  });

  it("belegt keine Zonen-/Status-Farbe doppelt (Farbton ≥ 30° Abstand)", () => {
    for (const sport of SPORTS) {
      const [, , hue] = parseOklch(token(sport));
      for (const [name, [, , h]] of Object.entries(RESERVED)) {
        expect(hueDistance(hue, h), `${sport} vs ${name}`).toBeGreaterThanOrEqual(30);
      }
    }
  });

  it("unterscheidet die Sportarten untereinander (≥ 30°)", () => {
    const hues = SPORTS.map((s) => parseOklch(token(s))[2]);
    for (let i = 0; i < hues.length; i++)
      for (let j = i + 1; j < hues.length; j++)
        expect(hueDistance(hues[i], hues[j])).toBeGreaterThanOrEqual(30);
  });

  it("erreicht WCAG AA (4.5:1) als Text auf den dunklen Kachelflächen", () => {
    for (const sport of SPORTS) {
      const lum = oklchLuminance(parseOklch(token(sport)));
      for (const bg of ["#08090c", "#181b21", "#161a22"]) {
        expect(contrast(lum, hexLuminance(bg)), `${sport} auf ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

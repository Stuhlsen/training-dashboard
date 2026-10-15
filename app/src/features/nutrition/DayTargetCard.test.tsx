/* Tests: DayTargetCard — Ziel, Mindestzufuhr, Methodik hinter "ⓘ", Hinweise,
 * Fortschrittsbalken + Ampel (nur mit summary), Primäraktion. Ersetzt die
 * früheren "ok-Zustand"-Tests aus NutritionPage.test.tsx. */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { NutritionDay } from "./nutrition-day-model";
import { AMPEL_TOOLTIP } from "./nutrition-week-model";
import { DayTargetCard } from "./DayTargetCard";

afterEach(cleanup);

const OK_DAY: Extract<NutritionDay, { ok: true }> = {
  ok: true,
  dateISO: "2026-10-14",
  target: 3021,
  floor: 1760,
  capped: false,
  bmr: 1949,
  formula: "ten-haaf-2014",
  hints: [],
  bodyFatDate: null,
  sexAssumed: false,
  trainingKcal: 0,
  trainingUnknown: false,
  weightKg: 80,
  weightSource: "profile",
  sourceKeys: ["ten-haaf-2014", "fao-who-unu-pal", "ioc-reds-2023"],
};

describe("DayTargetCard — Inhalt", () => {
  it("zeigt Ziel, Mindestzufuhr und den Namen der Formel", () => {
    render(<DayTargetCard day={OK_DAY} />);
    expect(screen.getByText("Tagesziel")).toBeTruthy();
    expect(screen.getByText("3021 kcal")).toBeTruthy();
    expect(screen.getByText("Mindestzufuhr: 1760 kcal")).toBeTruthy();
    expect(screen.queryByText(/RED-S-Boden/)).toBeNull();
    expect(
      screen.getByText("Grundumsatz nach Ten Haaf (2014), in einer Studie von 2023 an Sportlern geprüft"),
    ).toBeTruthy();
    expect(screen.queryByText(/Körperfett gemessen am/)).toBeNull();
  });

  it("Methodik (Formel, Körperfett-Datum, Quelle) liegt hinter dem 'ⓘ'", () => {
    render(<DayTargetCard day={{ ...OK_DAY, formula: "cunningham-1980", bodyFatDate: "2026-10-10" }} />);
    const summary = screen.getByText("ⓘ So rechnen wir");
    const details = summary.closest("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    for (const text of [
      /Grundumsatz nach Cunningham \(1980\)/,
      /Körperfett gemessen am 10\.10\.2026/,
      /ten Haaf T, Weijs PJ/,
    ]) {
      expect(details.contains(screen.getByText(text))).toBe(true);
    }
  });

  it("Quellen mit stabiler Adresse sind klickbar und öffnen in neuem Tab", () => {
    render(<DayTargetCard day={OK_DAY} />);
    const link = screen.getByText(/ten Haaf T, Weijs PJ/).closest("a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("https://pmc.ncbi.nlm.nih.gov/articles/PMC4183531/");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("zeigt die Hinweise der Formel im deutschen Wortlaut aus core (sichtbar, nicht hinter dem ⓘ)", () => {
    render(<DayTargetCard day={{ ...OK_DAY, hints: ["Geschlecht fehlt, Schätzung ungenauer"] }} />);
    const hint = screen.getByText("Geschlecht fehlt, Schätzung ungenauer");
    expect(hint.closest("details")).toBeNull();
  });

  it("bei unbekanntem Geschlecht steht zusätzlich der Mittelwert-Satz (E35), sonst nicht", () => {
    const { rerender } = render(<DayTargetCard day={{ ...OK_DAY, sexAssumed: true }} />);
    expect(screen.getByText(/Ohne Geschlechtsangabe rechnen wir mit einem Mittelwert/)).toBeTruthy();
    rerender(<DayTargetCard day={OK_DAY} />);
    expect(screen.queryByText(/Ohne Geschlechtsangabe/)).toBeNull();
  });

  it("zeigt Trainingsenergie und, wenn der Boden greift, den Hinweis dazu", () => {
    render(<DayTargetCard day={{ ...OK_DAY, trainingKcal: 540, capped: true }} />);
    expect(screen.getByText("Training heute: +540 kcal")).toBeTruthy();
    expect(screen.getByText(/das Ziel wurde auf diesen Wert angehoben/)).toBeTruthy();
  });

  it("meldet eine geplante Einheit mit unbekannter Energie, statt sie still als Ruhetag zu zeigen", () => {
    render(<DayTargetCard day={{ ...OK_DAY, trainingUnknown: true }} />);
    expect(screen.getByText(/Heute ist eine Einheit geplant/)).toBeTruthy();
  });

  it("an einem anderen Tag heißt es nicht 'heute'", () => {
    render(
      <DayTargetCard
        day={{ ...OK_DAY, trainingKcal: 300, trainingUnknown: true }}
        dateISO="2026-10-16"
        isToday={false}
      />,
    );
    expect(screen.getByText("Training: +300 kcal")).toBeTruthy();
    expect(screen.getByText(/An diesem Tag ist eine Einheit geplant/)).toBeTruthy();
    expect(screen.getByText("16.10")).toBeTruthy();
  });
});

describe("DayTargetCard — Fortschritt und Ampel", () => {
  it("ohne summary: weder Balken noch Ampel", () => {
    render(<DayTargetCard day={OK_DAY} />);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByTitle(AMPEL_TOOLTIP)).toBeNull();
  });

  it("leerer Tag: Balken 0, 'Noch nichts geplant', keine Ampel", () => {
    render(<DayTargetCard day={OK_DAY} summary={{ totalKcal: 0, filled: 0, ampel: null }} />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
    expect(screen.getByText("Noch nichts geplant")).toBeTruthy();
    expect(screen.queryByTitle(AMPEL_TOOLTIP)).toBeNull();
  });

  it("teilweise geplant: Balkenlänge = geplant / Ziel, Text 'x von y kcal geplant', Ampel mit Text", () => {
    render(<DayTargetCard day={OK_DAY} summary={{ totalKcal: 1510, filled: 2, ampel: "red" }} />);
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("50");
    expect(bar.getAttribute("aria-valuetext")).toBe("1510 von 3021 kcal geplant");
    expect((bar.firstChild as HTMLElement).style.width).toBe(`${(1510 / 3021) * 100}%`);
    expect(screen.getByText("1510 von 3021 kcal geplant")).toBeTruthy();
    expect(screen.getByText("unter der Mindestzufuhr")).toBeTruthy();
    expect(screen.getByText(/Die Summe liegt unter der Mindestzufuhr von 1760 kcal/)).toBeTruthy();
  });

  it("Farbe nur aus der Ampel-Zuordnung (--ok / --warn / --danger)", () => {
    const fillOf = (ampel: "green" | "yellow" | "red") => {
      const { unmount } = render(<DayTargetCard day={OK_DAY} summary={{ totalKcal: 2000, filled: 3, ampel }} />);
      const fill = (screen.getByRole("progressbar").firstChild as HTMLElement).style.background;
      unmount();
      return fill;
    };
    expect(fillOf("green")).toBe("var(--ok)");
    expect(fillOf("yellow")).toBe("var(--warn)");
    expect(fillOf("red")).toBe("var(--danger)");
  });

  it("über dem Ziel: Balken bleibt bei 100 %", () => {
    render(<DayTargetCard day={OK_DAY} summary={{ totalKcal: 4000, filled: 4, ampel: "yellow" }} />);
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("100");
    expect((bar.firstChild as HTMLElement).style.width).toBe("100%");
  });
});

describe("DayTargetCard — Aktionen und Meldungen", () => {
  it("rendert die Primäraktion und zusätzliche Meldungen", () => {
    render(
      <DayTargetCard
        day={OK_DAY}
        notes={<p>Kein Rezept verfügbar</p>}
        actions={<button type="button">Tag zusammenstellen</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Tag zusammenstellen" })).toBeTruthy();
    expect(screen.getByText("Kein Rezept verfügbar")).toBeTruthy();
  });
});

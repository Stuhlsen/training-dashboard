/* Tests: WeekStrip — sieben Tage, Auswahl, Beschriftung (Text, nicht nur
 * Farbe), Fortschritt, Ampelpunkt. */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AMPEL_TOOLTIP, type WeekStripDay } from "./nutrition-week-model";
import { WeekStrip } from "./WeekStrip";

afterEach(cleanup);

const day = (over: Partial<WeekStripDay> & Pick<WeekStripDay, "dateISO" | "weekday" | "dateLabel">): WeekStripDay => ({
  isToday: false,
  filled: 0,
  totalKcal: 0,
  target: 2300,
  ratio: 0,
  ampel: null,
  ...over,
});

const DAYS: WeekStripDay[] = [
  day({ dateISO: "2026-10-14", weekday: "Mi", dateLabel: "14.10", isToday: true, filled: 3, totalKcal: 2100, ratio: 2100 / 2300, ampel: "green" }),
  day({ dateISO: "2026-10-15", weekday: "Do", dateLabel: "15.10" }),
  day({ dateISO: "2026-10-16", weekday: "Fr", dateLabel: "16.10", filled: 1, totalKcal: 800, ratio: 800 / 2300, ampel: "red" }),
];

function setup(selectedISO = "2026-10-14") {
  const onSelect = vi.fn();
  render(<WeekStrip days={DAYS} selectedISO={selectedISO} onSelect={onSelect} />);
  return { onSelect };
}

describe("WeekStrip", () => {
  it("ein Knopf je Tag, benannt mit Wochentag, Datum und Stand", () => {
    setup();
    expect(
      screen.getByRole("button", { name: "Mi 14.10, heute: 2100 von 2300 kcal geplant, im Rahmen" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Do 15.10: nichts geplant" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Fr 16.10: 800 von 2300 kcal geplant, unter der Mindestzufuhr" }),
    ).toBeTruthy();
  });

  it("der gewählte Tag ist gedrückt, heute ist 'current'", () => {
    setup("2026-10-15");
    const selected = screen.getByRole("button", { name: /^Do 15\.10/ });
    expect(selected.getAttribute("aria-pressed")).toBe("true");
    const today = screen.getByRole("button", { name: /^Mi 14\.10/ });
    expect(today.getAttribute("aria-pressed")).toBe("false");
    expect(today.getAttribute("aria-current")).toBe("date");
    expect(selected.getAttribute("aria-current")).toBeNull();
  });

  it("zeigt 'Heute' statt des Wochentags für heute", () => {
    setup();
    const today = screen.getByRole("button", { name: /^Mi 14\.10/ });
    expect(within(today).getByText("Heute")).toBeTruthy();
    expect(within(screen.getByRole("button", { name: /^Do 15\.10/ })).getByText("Do")).toBeTruthy();
  });

  it("Antippen meldet das Datum", () => {
    const { onSelect } = setup();
    fireEvent.click(screen.getByRole("button", { name: /^Fr 16\.10/ }));
    expect(onSelect).toHaveBeenCalledWith("2026-10-16");
  });

  it("Fortschrittsbalken in Länge des Anteils, Farbe nur aus der Ampel; leerer Tag ohne Farbe", () => {
    setup();
    const bar = (name: RegExp) => {
      const track = within(screen.getByRole("button", { name })).getAllByText("", { selector: "span" })[0];
      return (track.firstChild as HTMLElement).style;
    };
    expect(bar(/^Mi 14\.10/).width).toBe(`${(2100 / 2300) * 100}%`);
    expect(bar(/^Mi 14\.10/).background).toBe("var(--ok)");
    expect(bar(/^Fr 16\.10/).background).toBe("var(--danger)");
    expect(bar(/^Do 15\.10/).width).toBe("0%");
    expect(bar(/^Do 15\.10/).background).toBe("transparent");
  });

  it("Ampelpunkt trägt den Text im Tooltip (nie nur Farbe)", () => {
    setup();
    const dots = document.querySelectorAll(`[title="im Rahmen — ${AMPEL_TOOLTIP}"]`);
    expect(dots).toHaveLength(1);
    expect(document.querySelectorAll("[title^='unter der Mindestzufuhr']")).toHaveLength(1);
  });

  it("Tippziel mindestens 44 px", () => {
    setup();
    for (const b of screen.getAllByRole("button")) {
      expect(parseInt(b.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
    }
  });
});

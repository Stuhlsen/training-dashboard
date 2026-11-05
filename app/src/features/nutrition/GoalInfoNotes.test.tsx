/* Tests: GoalInfoNotes — Zusatzangaben der Tageskarte bei aktiven Zielen (Fahrplan 43, E6).
 * Texte neutral: kein Lob, keine Dringlichkeit, keine Diagnose, keine Versprechen. */

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { GoalInfoNotes } from "./GoalInfoNotes";
import type { DayGoalInfo } from "./nutrition-day-model";

const EMPTY: DayGoalInfo = {
  strictFloor: false,
  deficitBlockedReason: null,
  nextDayUnknown: false,
  eaWarn: false,
  paceCapped: false,
  proteinG: null,
  carbsG: null,
};

function renderNotes(info: Partial<DayGoalInfo>) {
  return render(
    <MemoryRouter>
      <GoalInfoNotes info={{ ...EMPTY, ...info }} />
    </MemoryRouter>,
  );
}

describe("GoalInfoNotes", () => {
  it("zeigt nichts, wenn es nichts zu sagen gibt", () => {
    const { container } = renderNotes({});
    expect(container.childNodes.length).toBe(0);
  });

  it("hängt an die Hinweise den ruhigen Satz: Orientierung, kein Ersatz für Fachberatung (E7)", () => {
    renderNotes({ proteinG: { min: 144, max: 176 } });
    expect(screen.getByText("Die Werte sind Orientierung und kein Ersatz für Fachberatung.")).toBeTruthy();
  });

  it("zeigt den Eiweiß-Bereich in Gramm", () => {
    renderNotes({ proteinG: { min: 144, max: 176 } });
    expect(screen.getByText(/Eiweiß/).textContent).toContain("144–176 g");
  });

  it("zeigt das Kohlenhydrat-Band in Gramm", () => {
    renderNotes({ carbsG: [480, 800] });
    expect(screen.getByText(/Kohlenhydrate/).textContent).toContain("480–800 g");
  });

  it("erklärt ohne Körperfett, warum es kein Defizit gibt, und verweist auf die Einstellungen", () => {
    renderNotes({ deficitBlockedReason: "no-body-fat" });
    expect(screen.getByText(/kein gemessenes Körperfett/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Körperfett eintragen/i }).getAttribute("href")).toBe("/app/settings");
  });

  it("erklärt vor harten Einheiten, warum es kein Defizit gibt", () => {
    renderNotes({ deficitBlockedReason: "hard-day" });
    expect(screen.getByText(/harte Einheit/i)).toBeTruthy();
  });

  it("meldet einen unbekannten Folgetag", () => {
    renderNotes({ nextDayUnknown: true });
    expect(screen.getByText(/morgen steht nichts im Plan/i)).toBeTruthy();
  });

  it("meldet ein gekürztes Tempo, ohne Zahlen zu nennen", () => {
    renderNotes({ paceCapped: true });
    const note = screen.getByText(/Obergrenze/);
    expect(note.textContent).not.toMatch(/\d/);
  });

  it("nennt den Warnbereich sachlich", () => {
    renderNotes({ eaWarn: true });
    expect(screen.getByText(/30 bis 45/)).toBeTruthy();
  });

  it("bleibt neutral: kein Lob, keine Dringlichkeit, keine Diagnose", () => {
    const { container } = renderNotes({
      strictFloor: true,
      deficitBlockedReason: "no-body-fat",
      nextDayUnknown: true,
      eaWarn: true,
      paceCapped: true,
      proteinG: { min: 144, max: 176 },
      carbsG: [480, 800],
    });
    expect(container.textContent).not.toMatch(
      /super|stark|toll|gut gemacht|geschafft|sofort|unbedingt|gefährlich|Essstörung|RED-S|Mangel|Krankheit|garantiert|verspro/i,
    );
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HintChip } from "./HintChip";

afterEach(cleanup);

describe("HintChip", () => {
  it("rendert nichts bei leerer Hinweisliste", () => {
    const { container } = render(<HintChip items={[]} idSeed="a" />);
    expect(container.firstChild).toBeNull();
  });

  it("zeigt die Zusammenfassung als Chip-Label und öffnet den Tooltip per Klick", () => {
    render(<HintChip items={[{ severity: "warning", text: "Zwei harte Tage in Folge" }]} idSeed="toggle" />);
    const button = screen.getByRole("button", { name: /1 Hinweis/ });
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.click(button);
    expect(screen.getByRole("tooltip").textContent).toContain("Zwei harte Tage in Folge");
    expect(button.getAttribute("aria-expanded")).toBe("true");

    // Auf einem hover-fähigen Gerät (Standard in jsdom, da window.matchMedia
    // fehlt und hoverCapable() dann auf true zurückfällt) schließt ein
    // weiterer Klick NICHT — das übernimmt mouseleave/blur (s. Test unten).
    // Ein Toggle-per-Klick hier war genau der Bug, den die Playwright-
    // Verifikation gegen dashboard-dev gefunden hat (s. Kommentar in
    // HintChip.tsx): mouseenter öffnet vor dem Klick, ein Toggle hätte den
    // Chip sofort wieder geschlossen, während die Maus noch darauf steht.
    fireEvent.click(button);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    expect(button.getAttribute("aria-expanded")).toBe("true");

    fireEvent.mouseLeave(button);
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("togglet per Klick auf einem NICHT hover-fähigen Gerät (Touch)", () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) =>
      ({ matches: false, media: query }) as MediaQueryList) as typeof window.matchMedia;
    try {
      render(<HintChip items={[{ severity: "warning", text: "Zwei harte Tage in Folge" }]} idSeed="touch" />);
      const button = screen.getByRole("button", { name: /1 Hinweis/ });

      fireEvent.click(button);
      expect(button.getAttribute("aria-expanded")).toBe("true");

      fireEvent.click(button);
      expect(button.getAttribute("aria-expanded")).toBe("false");
    } finally {
      window.matchMedia = original;
    }
  });

  it("öffnet bei einem echten Maus-Klick (mousedown→focus→click), nicht nur bei fireEvent.click", () => {
    // Regressionstest für einen per Playwright gegen dashboard-dev gefundenen
    // Bug: ein echter Maus-Klick löst mousedown→focus→mouseup→click aus.
    // onFocus öffnete den Chip VOR onClick — der Klick-Handler sah dann
    // bereits "offen" und schloss sofort wieder zu. fireEvent.click allein
    // (wie in den Tests oben) feuert kein vorheriges focus-Event und deckte
    // das nicht auf.
    render(<HintChip items={[{ severity: "warning", text: "Zwei harte Tage in Folge" }]} idSeed="mouse-order" />);
    const button = screen.getByRole("button", { name: /1 Hinweis/ });

    fireEvent.mouseDown(button);
    fireEvent.focus(button);
    fireEvent.click(button);

    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("tooltip").textContent).toContain("Zwei harte Tage in Folge");
  });

  it("öffnet per reinem Tab-Fokus (ohne vorheriges mousedown) als Vorschau", () => {
    render(<HintChip items={[{ severity: "warning", text: "Zwei harte Tage in Folge" }]} idSeed="keyboard-focus" />);
    const button = screen.getByRole("button", { name: /1 Hinweis/ });

    fireEvent.focus(button);

    expect(button.getAttribute("aria-expanded")).toBe("true");
    fireEvent.blur(button); // aufräumen für nachfolgende Tests im selben Modul
  });

  it("unterdrückt einen späteren Tab-Fokus nicht mehr, nachdem ein zweiter Klick auf ein bereits fokussiertes Element kein erneutes focus-Event ausgelöst hat", () => {
    // Regressionstest für einen /code-review-Fund: Browser feuern `focus`
    // nicht erneut auf ein bereits fokussiertes Element. Ohne den
    // mouseup-Reset bliebe die mousedown-Guard "hängen" (nie durch `onFocus`
    // konsumiert) und würde den nächsten echten Tab-Fokus fälschlich
    // unterdrücken.
    render(<HintChip items={[{ severity: "warning", text: "Zwei harte Tage in Folge" }]} idSeed="stuck-guard" />);
    const button = screen.getByRole("button", { name: /1 Hinweis/ });

    // Erster Klick: mousedown → focus → mouseup → click (normaler Ablauf).
    fireEvent.mouseDown(button);
    fireEvent.focus(button);
    fireEvent.mouseUp(button);
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");

    // Zweiter Klick auf dasselbe, BEREITS fokussierte Element: kein
    // erneutes focus-Event, nur mousedown → mouseup → click.
    fireEvent.mouseDown(button);
    fireEvent.mouseUp(button);
    fireEvent.click(button);

    fireEvent.blur(button);
    fireEvent.focus(button); // simuliert späteren, unabhängigen Tab-Fokus
    expect(button.getAttribute("aria-expanded")).toBe("true");
    fireEvent.blur(button); // aufräumen für nachfolgende Tests im selben Modul
  });

  it("kürzt auf CARD_HINT_CHIP_MAX_VISIBLE Zeilen mit '+N weitere'", () => {
    const items = [
      { severity: "info" as const, text: "A" },
      { severity: "info" as const, text: "B" },
      { severity: "info" as const, text: "C" },
      { severity: "info" as const, text: "D" },
    ];
    render(<HintChip items={items} idSeed="overflow" />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("tooltip").textContent).toContain("+1 weitere");
  });

  it("lässt nur einen Tooltip gleichzeitig offen (zwei Chips, Exklusivität)", () => {
    render(
      <>
        <HintChip items={[{ severity: "info", text: "Hinweis A" }]} idSeed="excl-a" />
        <HintChip items={[{ severity: "info", text: "Hinweis B" }]} idSeed="excl-b" />
      </>,
    );
    const [buttonA, buttonB] = screen.getAllByRole("button");

    fireEvent.click(buttonA);
    expect(buttonA.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(buttonB);
    expect(buttonB.getAttribute("aria-expanded")).toBe("true");
    expect(buttonA.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getAllByRole("tooltip")).toHaveLength(1);

    fireEvent.mouseLeave(buttonB); // aufräumen für nachfolgende Tests im selben Modul
  });
});

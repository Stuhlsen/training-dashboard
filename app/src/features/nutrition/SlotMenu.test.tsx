/* Tests: SlotMenu — "⋯"-Menü: Öffnen/Schließen, Escape + Fokus, Pfeiltasten,
 * Klick daneben, Auswahl, gesperrte Einträge, Tippziel. */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SlotMenu } from "./SlotMenu";

afterEach(cleanup);

function setup(over: { disabledRemove?: boolean } = {}) {
  const onSwap = vi.fn();
  const onDetails = vi.fn();
  const onRemove = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <div>
      <SlotMenu
        label="Frühstück: Aktionen"
        onOpenChange={onOpenChange}
        items={[
          { key: "swap", label: "Tauschen", onSelect: onSwap },
          { key: "details", label: "Details", onSelect: onDetails },
          { key: "remove", label: "Entfernen", onSelect: onRemove, disabled: over.disabledRemove },
        ]}
      />
      <p>daneben</p>
    </div>,
  );
  const trigger = screen.getByRole("button", { name: "Frühstück: Aktionen" });
  return { trigger, onSwap, onDetails, onRemove, onOpenChange };
}

describe("SlotMenu", () => {
  it("ist zu, bis man den Knopf antippt; Knopf meldet aria-haspopup und aria-expanded", () => {
    const { trigger, onOpenChange } = setup();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["Tauschen", "Details", "Entfernen"]);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
  });

  it("Fokus landet beim Öffnen auf dem ersten Eintrag", () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Tauschen" }));
  });

  it("Escape schließt und gibt den Fokus an den Knopf zurück", () => {
    const { trigger, onOpenChange } = setup();
    fireEvent.click(trigger);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("Pfeil runter/hoch, Pos1 und Ende wandern durch die Einträge (mit Umbruch)", () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    const press = (key: string) => fireEvent.keyDown(document.activeElement as HTMLElement, { key });
    const focused = () => (document.activeElement as HTMLElement).textContent;

    press("ArrowDown");
    expect(focused()).toBe("Details");
    press("ArrowDown");
    press("ArrowDown");
    expect(focused()).toBe("Tauschen"); // Umbruch
    press("ArrowUp");
    expect(focused()).toBe("Entfernen"); // Umbruch rückwärts
    press("Home");
    expect(focused()).toBe("Tauschen");
    press("End");
    expect(focused()).toBe("Entfernen");
  });

  it("überspringt gesperrte Einträge bei der Tastaturbedienung", () => {
    const { trigger } = setup({ disabledRemove: true });
    fireEvent.click(trigger);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "End" });
    expect((document.activeElement as HTMLElement).textContent).toBe("Details");
    expect((screen.getByRole("menuitem", { name: "Entfernen" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Auswahl ruft die Aktion, schließt das Menü und lässt den Fokus am Knopf", () => {
    const { trigger, onDetails, onSwap } = setup();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "Details" }));
    expect(onDetails).toHaveBeenCalledTimes(1);
    expect(onSwap).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("ein gesperrter Eintrag löst nichts aus", () => {
    const { trigger, onRemove } = setup({ disabledRemove: true });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "Entfernen" }));
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("Antippen daneben schließt; Antippen im Menü nicht", () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.pointerDown(screen.getByRole("menu"));
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.pointerDown(screen.getByText("daneben"));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Tab schließt das Menü (Fokus wandert weiter)", () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Tab" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Tippziele sind mindestens 44 px", () => {
    const { trigger } = setup();
    expect(trigger.style.width).toBe("44px");
    expect(trigger.style.height).toBe("44px");
    fireEvent.click(trigger);
    for (const item of screen.getAllByRole("menuitem")) expect(item.style.minHeight).toBe("44px");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ActionSportPicker } from "./ActionSportPicker";

afterEach(cleanup);

describe("ActionSportPicker", () => {
  it("nennt die Aktion und bietet jede Sportart mit Symbol + Text an", () => {
    render(<ActionSportPicker action="Neuer Plan" sports={["ride", "run", "swim"]} onPick={() => {}} onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: /Neuer Plan/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rad" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lauf" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Schwimmen" })).toBeTruthy();
  });

  it("meldet die gewählte Sportart", () => {
    const onPick = vi.fn();
    render(<ActionSportPicker action="Plan anpassen" sports={["ride", "run"]} onPick={onPick} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Lauf" }));
    expect(onPick).toHaveBeenCalledWith("run");
  });

  it("schließt per Abbrechen und per Escape, ohne eine Sportart zu wählen", () => {
    const onClose = vi.fn();
    const onPick = vi.fn();
    render(<ActionSportPicker action="Neuer Plan" sports={["ride", "run"]} onPick={onPick} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onPick).not.toHaveBeenCalled();
  });
});

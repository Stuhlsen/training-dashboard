/* Tests: GroupSportEditor.tsx — das Stundenfeld in „Plan anpassen“ (Fahrplan 44 E6).
 * Das Feld muss sich leeren und neu tippen lassen, ohne auf den alten Wert zurückzuspringen. */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GroupSportEditor } from "./GroupSportEditor";

function setup(hours = 5) {
  const onHours = vi.fn();
  render(
    <GroupSportEditor
      sport="run"
      selected
      lockSelected={false}
      disabled={false}
      weekdays={[1, 3, 7]}
      hours={hours}
      fixedDays={[]}
      ftpTarget={null}
      currentFtp={null}
      estimates={{} as never}
      onToggleSelected={vi.fn()}
      onToggleDay={vi.fn()}
      onHours={onHours}
      onFixedDays={vi.fn()}
      onFtpTarget={vi.fn()}
    />,
  );
  const input = screen.getByLabelText("Stunden pro Woche") as HTMLInputElement;
  return { input, onHours };
}

describe("GroupSportEditor — Stundenfeld", () => {
  it("zeigt den Wert aus den Props", () => {
    expect(setup(5).input.value).toBe("5");
  });

  it("lässt sich leeren, ohne auf den alten Wert zurückzuspringen, und meldet nichts Ungültiges", () => {
    const { input, onHours } = setup(5);
    fireEvent.change(input, { target: { value: "" } });
    expect(input.value).toBe("");
    expect(onHours).not.toHaveBeenCalled();
  });

  it("übernimmt die neue Zahl, sobald sie gültig ist", () => {
    const { input, onHours } = setup(5);
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.change(input, { target: { value: "12" } });
    expect(onHours).toHaveBeenLastCalledWith(12);
    expect(input.value).toBe("12");
  });

  it("meldet 0 oder negative Werte nicht", () => {
    const { input, onHours } = setup(5);
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.change(input, { target: { value: "-2" } });
    expect(onHours).not.toHaveBeenCalled();
  });

  it("springt beim Verlassen eines leeren Feldes auf den gültigen Wert zurück", () => {
    const { input } = setup(5);
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(input.value).toBe("5");
  });
});

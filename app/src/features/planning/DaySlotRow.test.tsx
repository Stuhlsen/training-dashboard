import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { DaySlotRow } from "./DaySlotRow";

// Kein globaler afterEach(cleanup) im Projekt-Setup (vite.config.ts hat
// weder `globals: true` noch setupFiles) — RTLs Auto-Cleanup greift daher
// nicht, jeder Test räumt hier explizit ab.
afterEach(cleanup);

/** useDroppable() braucht einen DndContext-Provider — ohne den wirft
 *  dnd-kit beim Rendern. */
function renderRow(anchorDate: string, today: string) {
  return render(
    <DndContext>
      <DaySlotRow anchorDate={anchorDate} today={today} />
    </DndContext>,
  );
}

describe("DaySlotRow", () => {
  it("rendert alle 7 Tage der Woche, Montag zuerst", () => {
    // 2026-07-22 ist ein Mittwoch → Wochenanfang 2026-07-20 (Montag)
    renderRow("2026-07-22", "2026-07-20");
    // getByText wirft, wenn der Tag fehlt — allein der Aufruf ist der Beweis.
    screen.getByText("Mo 20.07");
    screen.getByText("Di 21.07");
    screen.getByText("So 26.07");
  });

  it("markiert vergangene Tage als 'vorbei', zukünftige als 'ablegen'", () => {
    renderRow("2026-07-22", "2026-07-22");
    // Mo/Di liegen vor "heute" (Mi) → vorbei; Mi–So sind erlaubt.
    const past = screen.getByText("Mo 20.07").closest("div");
    const future = screen.getByText("Mi 22.07").closest("div");
    expect(past?.textContent).toContain("vorbei");
    expect(future?.textContent).toContain("ablegen");
  });
});

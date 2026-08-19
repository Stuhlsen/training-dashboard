import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { WeekGrid } from "./WeekGrid";
import { buildWeekGrid } from "./week-grid-view-model";
import type { PlanCard } from "../../api/types";

// Kein globaler afterEach(cleanup) im Projekt-Setup (vite.config.ts hat
// weder `globals: true` noch setupFiles) — RTLs Auto-Cleanup greift daher
// nicht, jeder Test räumt hier explizit ab.
afterEach(cleanup);

const TODAY = "2026-08-12"; // Mittwoch, KW33 (Mo 10.08–So 16.08)

function card(overrides: Partial<PlanCard> & { id: string; date: string }): PlanCard {
  return {
    sortOrder: 0,
    name: "Session",
    typ: "Z2 Dauer",
    km: null,
    durationMin: null,
    tssPlanned: null,
    week: null,
    phase: "Aufbau 2",
    details: null,
    workout: null,
    workoutStructure: null,
    pushedExternalId: null,
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

/** useDraggable()/useDroppable() brauchen einen DndContext-Provider — ohne
 *  den wirft dnd-kit beim Rendern. */
function renderGrid(
  cards: PlanCard[],
  opts: Partial<{ canEdit: boolean; trainerProposalMode: boolean; renderDetail: (cell: unknown, week: unknown) => React.ReactNode }> = {},
) {
  const weeks = buildWeekGrid(cards, [], TODAY);
  return render(
    <DndContext>
      <WeekGrid
        weeks={weeks}
        today={TODAY}
        canEdit={opts.canEdit ?? true}
        trainerProposalMode={opts.trainerProposalMode ?? false}
        renderDetail={opts.renderDetail as never}
      />
    </DndContext>,
  );
}

describe("WeekGrid — Klick öffnet/schließt Detailzeile", () => {
  it("öffnet die Detailzeile für die angeklickte Zelle und schließt sie beim erneuten Klick", () => {
    const cards = [card({ id: "a", date: "2026-08-14" })]; // Freitag, offen
    renderGrid(cards, { renderDetail: (cell) => <div data-testid="detail">{(cell as { date: string }).date}</div> });

    expect(screen.queryByTestId("detail")).toBeNull();
    fireEvent.click(screen.getByText("Session"));
    expect(screen.getByTestId("detail").textContent).toBe("2026-08-14");
    fireEvent.click(screen.getByText("Session"));
    expect(screen.queryByTestId("detail")).toBeNull();
  });

  it("hält höchstens ein offenes Datum je Woche — ein zweiter Klick wechselt statt zu addieren", () => {
    const cards = [card({ id: "a", date: "2026-08-14", name: "Erste" }), card({ id: "b", date: "2026-08-15", name: "Zweite" })];
    renderGrid(cards, { renderDetail: (cell) => <div data-testid="detail">{(cell as { date: string }).date}</div> });

    fireEvent.click(screen.getByText("Erste"));
    expect(screen.getByTestId("detail").textContent).toBe("2026-08-14");
    fireEvent.click(screen.getByText("Zweite"));
    // nur EIN Datum offen — die vorherige Detailzeile verschwindet
    expect(screen.getAllByTestId("detail")).toHaveLength(1);
    expect(screen.getByTestId("detail").textContent).toBe("2026-08-15");
  });

  it("leere Tage ohne Karte reagieren nicht auf Klick (kein renderDetail-Aufruf)", () => {
    const cards = [card({ id: "a", date: "2026-08-14" })];
    let called = false;
    renderGrid(cards, {
      renderDetail: () => {
        called = true;
        return <div data-testid="detail" />;
      },
    });
    const emptyCell = document.querySelector('[data-grid-cell-date="2026-08-10"][data-status="empty"]');
    expect(emptyCell).not.toBeNull();
    fireEvent.click(emptyCell as Element);
    expect(called).toBe(false);
  });
});

describe("WeekGrid — Drag-Deaktivierung", () => {
  it("deaktiviert Drag auf einer vergangenen (verpassten) Zelle", () => {
    const cards = [card({ id: "a", date: "2026-08-10" })]; // Montag, vor TODAY, nicht verschoben → missed
    renderGrid(cards);
    const cell = document.querySelector('[data-grid-cell-date="2026-08-10"]');
    expect(cell?.getAttribute("data-status")).toBe("missed");
    expect(cell?.getAttribute("aria-disabled")).toBe("true");
  });

  it("deaktiviert Drag auf einer ausgefallenen Zelle, auch wenn das Datum in der Zukunft liegt", () => {
    const cards = [card({ id: "a", date: "2026-08-14", cancelled: true })];
    renderGrid(cards);
    const cell = document.querySelector('[data-grid-cell-date="2026-08-14"]');
    expect(cell?.getAttribute("data-status")).toBe("cancelled");
    expect(cell?.getAttribute("aria-disabled")).toBe("true");
  });

  it("erlaubt Drag auf einer offenen zukünftigen Zelle mit Bearbeitungsrecht", () => {
    const cards = [card({ id: "a", date: "2026-08-14" })];
    renderGrid(cards, { canEdit: true });
    const cell = document.querySelector('[data-grid-cell-date="2026-08-14"]');
    expect(cell?.getAttribute("data-status")).toBe("open");
    expect(cell?.getAttribute("aria-disabled")).toBe("false");
  });

  it("deaktiviert Drag ohne Bearbeitungsrecht (read-only Athlet)", () => {
    const cards = [card({ id: "a", date: "2026-08-14" })];
    renderGrid(cards, { canEdit: false });
    const cell = document.querySelector('[data-grid-cell-date="2026-08-14"]');
    expect(cell?.getAttribute("aria-disabled")).toBe("true");
  });

  it("deaktiviert Drag im Trainer-Vorschlagsmodus", () => {
    const cards = [card({ id: "a", date: "2026-08-14" })];
    renderGrid(cards, { canEdit: true, trainerProposalMode: true });
    const cell = document.querySelector('[data-grid-cell-date="2026-08-14"]');
    expect(cell?.getAttribute("aria-disabled")).toBe("true");
  });
});

describe("WeekGrid — Drop-Ziele", () => {
  it("markiert vergangene Tage als nicht droppbar, heutige/zukünftige als droppbar", () => {
    const cards = [card({ id: "a", date: "2026-08-14" })];
    renderGrid(cards);
    const past = document.querySelector('[data-grid-cell-date="2026-08-10"]');
    const todayCell = document.querySelector(`[data-grid-cell-date="${TODAY}"]`);
    const future = document.querySelector('[data-grid-cell-date="2026-08-16"]');
    expect(past?.getAttribute("data-drop-allowed")).toBe("false");
    expect(todayCell?.getAttribute("data-drop-allowed")).toBe("true");
    expect(future?.getAttribute("data-drop-allowed")).toBe("true");
  });
});

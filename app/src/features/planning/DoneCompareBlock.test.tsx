import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DoneCompareBlock } from "./DoneCompareBlock";
import type { PlanCard } from "../../api/types";

type Ride = import("../../types.js").Ride;

afterEach(cleanup);

function card(overrides: Partial<PlanCard> = {}): PlanCard {
  return {
    id: "card-1",
    date: "2026-08-06",
    sortOrder: 0,
    name: "Threshold 3×12 Min",
    typ: "Schwelle",
    km: null,
    durationMin: null,
    tssPlanned: null,
    week: "2026-KW32",
    phase: "Rennhärte",
    details: null,
    workout: null,
    workoutStructure: null,
    pushedExternalId: null,
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

function ride(overrides: Partial<Ride> = {}): Ride {
  return { dateISO: "2026-08-06", ...overrides } as Ride;
}

describe("DoneCompareBlock", () => {
  it("zeigt die Typ-Abweichung des 06.08.-Falls (Schwelle geplant, Z2 Lang gefahren)", () => {
    render(<DoneCompareBlock card={card({ typ: "Schwelle", km: 60 })} ride={ride({ typ: "Z2 Lang", km: 86 })} canEdit={false} />);
    screen.getByText("Geplant → Tatsächlich");
    screen.getByText("Schwelle");
    screen.getByText("Z2 Lang");
  });

  it("rendert nichts ohne jegliche Ist-Werte", () => {
    const { container } = render(<DoneCompareBlock card={card()} ride={ride()} canEdit={false} />);
    expect(container.firstChild).toBeNull();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WhatIfPanel } from "./WhatIfPanel";

afterEach(cleanup);

const DEFAULT_SCENARIO = { enabled: false, weekTssPct: 0, restDays: 0, rampRatePct: 0 };

describe("WhatIfPanel", () => {
  it("zeigt den Toggle-Zustand und formatierte Regler-Werte (±%)", () => {
    render(
      <WhatIfPanel
        scenario={{ enabled: true, weekTssPct: 20, restDays: 2, rampRatePct: -10 }}
        onParamsChange={vi.fn()}
        onEnabledChange={vi.fn()}
      />,
    );
    const toggle = screen.getByRole("checkbox", { name: /What-if-Szenario/ }) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    screen.getByText("+20%");
    screen.getByText("2");
    screen.getByText("-10%");
  });

  it("meldet Toggle-Änderungen über onEnabledChange, unabhängig von den Reglern", () => {
    const onEnabledChange = vi.fn();
    render(<WhatIfPanel scenario={DEFAULT_SCENARIO} onParamsChange={vi.fn()} onEnabledChange={onEnabledChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /What-if-Szenario/ }));
    expect(onEnabledChange).toHaveBeenCalledWith(true);
  });

  it("meldet Regler-Änderungen über onParamsChange, ohne enabled anzufassen", () => {
    const onParamsChange = vi.fn();
    render(<WhatIfPanel scenario={DEFAULT_SCENARIO} onParamsChange={onParamsChange} onEnabledChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Wochen-TSS-Änderung/), { target: { value: "15" } });
    expect(onParamsChange).toHaveBeenCalledWith({ weekTssPct: 15 });

    fireEvent.change(screen.getByLabelText(/Zusätzliche Ruhetage/), { target: { value: "1" } });
    expect(onParamsChange).toHaveBeenCalledWith({ restDays: 1 });

    fireEvent.change(screen.getByLabelText(/Erzwungener Wochen-Zuwachs/), { target: { value: "-20" } });
    expect(onParamsChange).toHaveBeenCalledWith({ rampRatePct: -20 });

    expect(onParamsChange).toHaveBeenCalledTimes(3);
  });
});

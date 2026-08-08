import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ComparePanel } from "./ComparePanel";

afterEach(cleanup);

const EMPTY_METRICS = { sumTss: 0, avgCtl: null, ramp: null, hardDays: 0 };

describe("ComparePanel", () => {
  it("zeigt 'noch nicht gemerkt' für einen leeren Slot", () => {
    render(
      <ComparePanel
        enabled={false}
        onEnabledChange={vi.fn()}
        slotA={null}
        slotB={null}
        metricsA={EMPTY_METRICS}
        metricsB={EMPTY_METRICS}
        compareActive={false}
        onSaveSlot={vi.fn()}
        canSave
      />,
    );
    const notes = screen.getAllByText("noch nicht gemerkt");
    expect(notes).toHaveLength(2);
  });

  it("zeigt einen Hinweis statt Kennzahlen, wenn ein Slot gemerkt aber der Modus aus ist", () => {
    render(
      <ComparePanel
        enabled={false}
        onEnabledChange={vi.fn()}
        slotA={{ from: "2026-06-01", to: "2026-06-07" }}
        slotB={null}
        metricsA={EMPTY_METRICS}
        metricsB={EMPTY_METRICS}
        compareActive={false}
        onSaveSlot={vi.fn()}
        canSave
      />,
    );
    screen.getByText(/Vergleichsmodus einschalten für Kennzahlen/);
  });

  it("zeigt Kennzahlen, wenn der Vergleich aktiv ist", () => {
    render(
      <ComparePanel
        enabled
        onEnabledChange={vi.fn()}
        slotA={{ from: "2026-06-01", to: "2026-06-07" }}
        slotB={{ from: "2026-07-01", to: "2026-07-07" }}
        metricsA={{ sumTss: 320, avgCtl: 41.3, ramp: 2.5, hardDays: 2 }}
        metricsB={{ sumTss: 410, avgCtl: 55, ramp: -1, hardDays: 3 }}
        compareActive
        onSaveSlot={vi.fn()}
        canSave
      />,
    );
    screen.getByText("Σ TSS 320");
    screen.getByText("⌀ CTL 41.3");
    screen.getByText("Rampe +2.5");
    screen.getByText("Σ TSS 410");
    screen.getByText("Rampe -1");
  });

  it("meldet Toggle-Änderungen über onEnabledChange", () => {
    const onEnabledChange = vi.fn();
    render(
      <ComparePanel
        enabled={false}
        onEnabledChange={onEnabledChange}
        slotA={null}
        slotB={null}
        metricsA={EMPTY_METRICS}
        metricsB={EMPTY_METRICS}
        compareActive={false}
        onSaveSlot={vi.fn()}
        canSave
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /Vergleichsmodus/ }));
    expect(onEnabledChange).toHaveBeenCalledWith(true);
  });

  it("ruft onSaveSlot mit 'a'/'b' bei Klick auf die jeweiligen Buttons auf", () => {
    const onSaveSlot = vi.fn();
    render(
      <ComparePanel
        enabled={false}
        onEnabledChange={vi.fn()}
        slotA={null}
        slotB={null}
        metricsA={EMPTY_METRICS}
        metricsB={EMPTY_METRICS}
        compareActive={false}
        onSaveSlot={onSaveSlot}
        canSave
      />,
    );
    fireEvent.click(screen.getByText("Als A merken"));
    fireEvent.click(screen.getByText("Als B merken"));
    expect(onSaveSlot).toHaveBeenNthCalledWith(1, "a");
    expect(onSaveSlot).toHaveBeenNthCalledWith(2, "b");
  });

  it("deaktiviert beide Buttons, wenn canSave false ist (kein Brush-Fenster geladen)", () => {
    render(
      <ComparePanel
        enabled={false}
        onEnabledChange={vi.fn()}
        slotA={null}
        slotB={null}
        metricsA={EMPTY_METRICS}
        metricsB={EMPTY_METRICS}
        compareActive={false}
        onSaveSlot={vi.fn()}
        canSave={false}
      />,
    );
    expect((screen.getByText("Als A merken") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText("Als B merken") as HTMLButtonElement).disabled).toBe(true);
  });
});

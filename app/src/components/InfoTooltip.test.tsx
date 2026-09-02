import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { InfoTooltip } from "./InfoTooltip";

afterEach(cleanup);

describe("InfoTooltip", () => {
  it("rendert die children", () => {
    render(<InfoTooltip termKey="ctl">CTL Fitness</InfoTooltip>);
    expect(screen.getByText(/CTL Fitness/)).toBeTruthy();
  });

  it("zeigt die Box bei Fokus und verbirgt sie bei Blur", () => {
    render(<InfoTooltip termKey="ctl">CTL Fitness</InfoTooltip>);
    const trigger = screen.getByText(/CTL Fitness/);

    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.focus(trigger);
    const box = screen.getByRole("tooltip");
    expect(box.textContent).toContain("Langzeit-Fitness");

    fireEvent.blur(trigger);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("schließt die Box bei Escape", () => {
    render(<InfoTooltip termKey="tsb">Form</InfoTooltip>);
    const trigger = screen.getByText(/Form/);

    fireEvent.focus(trigger);
    expect(screen.getByRole("tooltip")).toBeTruthy();

    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("verknüpft Trigger und Box per aria-describedby / id", () => {
    render(<InfoTooltip termKey="np">NP</InfoTooltip>);
    const trigger = screen.getByText(/NP/);

    fireEvent.focus(trigger);
    const box = screen.getByRole("tooltip");
    expect(trigger.getAttribute("aria-describedby")).toBe(box.id);
    expect(box.id.length).toBeGreaterThan(0);
  });

  it("lässt die gepunktete Unterstreichung mit underline={false} weg (Marker + Verhalten bleiben)", () => {
    render(
      <InfoTooltip termKey="tss" underline={false}>
        <span data-testid="badge">Sweet Spot</span>
      </InfoTooltip>,
    );
    const trigger = screen.getByText("Sweet Spot").closest('[tabindex="0"]') as HTMLElement;
    expect(trigger.style.textDecoration).toBe("");
    expect(trigger.style.cursor).toBe("help");

    fireEvent.focus(trigger);
    expect(screen.getByRole("tooltip").textContent).toContain("Trainingsbelastung");
  });

  it("rendert bei unbekanntem Key nur die children ohne Marker/Fokus", () => {
    const { container } = render(<InfoTooltip termKey="gibt-es-nicht">Rohtext</InfoTooltip>);
    expect(screen.getByText("Rohtext")).toBeTruthy();
    expect(container.querySelector('[tabindex="0"]')).toBeNull();

    fireEvent.focus(screen.getByText("Rohtext"));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});

/* Tests: OnboardingWizard (Fahrplan 21 E4 + Fahrplan 23 E5) — Schritt-Reihenfolge.
 * Passwort (Pflicht) → Sportarten (Pflicht, Q8 kein Skip) →
 * Profil-Basisdaten (überspringbar) → Ernährung (Pflicht, kein Skip) →
 * intervals.icu-Key (überspringbar).
 * Wir mocken die Schritt-Komponenten und prüfen, dass der Wizard
 * nach jedem onComplete den erwarteten nächsten Schritt mountet und dass
 * Sports- und Nutrition-Schritte bewusst KEIN onSkip erhalten. */

import { render, screen, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";

// Fängt die an die gemockten Schritte übergebenen Props (onComplete/onSkip).
const captured: Record<string, { onComplete?: () => void; onSkip?: () => void }> = {};

function makeStepMock(name: string, render: (p: { onComplete?: () => void; onSkip?: () => void }) => ReactNode) {
  return ({ onComplete, onSkip }: { onComplete?: () => void; onSkip?: () => void }) => {
    captured[name] = { onComplete, onSkip };
    return render({ onComplete, onSkip });
  };
}

vi.mock("./SetPasswordStep", () => ({
  SetPasswordStep: makeStepMock("password", (p) => (
    <div data-testid="step-password">
      <button onClick={() => p.onComplete?.()}>complete-password</button>
    </div>
  )),
}));

vi.mock("../settings/SportsSection", () => ({
  SportsSection: makeStepMock("sports", (p) => (
    <div data-testid="step-sports">
      <button onClick={() => p.onComplete?.()}>complete-sports</button>
    </div>
  )),
}));

vi.mock("../settings/ProfileBasicsSection", () => ({
  ProfileBasicsSection: makeStepMock("profile", (p) => (
    <div data-testid="step-profile">
      <button onClick={() => p.onComplete?.()}>complete-profile</button>
      <button onClick={() => p.onSkip?.()}>skip-profile</button>
    </div>
  )),
}));

vi.mock("../settings/IntervalsSection", () => ({
  IntervalsSection: makeStepMock("intervals", (p) => (
    <div data-testid="step-intervals">
      <button onClick={() => p.onComplete?.()}>complete-intervals</button>
      <button onClick={() => p.onSkip?.()}>skip-intervals</button>
    </div>
  )),
}));

vi.mock("./NutritionStep", () => ({
  NutritionStep: makeStepMock("nutrition", (p) => (
    <div data-testid="step-nutrition">
      <button onClick={() => p.onComplete?.()}>complete-nutrition</button>
    </div>
  )),
}));

const { OnboardingWizard } = await import("./OnboardingWizard");

describe("OnboardingWizard step order (Fahrplan 21 E4)", () => {
  beforeEach(() => {
    captured.password = {};
    captured.sports = {};
    captured.profile = {};
    captured.nutrition = {};
    captured.intervals = {};
  });

  it("startet mit dem Passwort-Schritt", () => {
    render(<OnboardingWizard onFinished={() => {}} />);
    expect(screen.getByTestId("step-password")).toBeTruthy();
    expect(screen.queryByTestId("step-sports")).toBeNull();
  });

  it("zeigt nach Passwort den Sportarten-Schritt (Pflicht, KEIN onSkip)", () => {
    render(<OnboardingWizard onFinished={() => {}} />);
    act(() => {
      captured.password.onComplete?.();
    });
    expect(screen.getByTestId("step-sports")).toBeTruthy();
    // Q8: Sports-Schritt darf kein onSkip bekommen.
    expect(captured.sports.onSkip).toBeUndefined();
    expect(typeof captured.sports.onComplete).toBe("function");
  });

  it("zeigt nach Sportarten den Profil-Schritt", () => {
    render(<OnboardingWizard onFinished={() => {}} />);
    act(() => {
      captured.password.onComplete?.();
    });
    act(() => {
      captured.sports.onComplete?.();
    });
    expect(screen.getByTestId("step-profile")).toBeTruthy();
    expect(typeof captured.profile.onSkip).toBe("function");
  });

  it("zeigt nach Profil den Ernährungs-Schritt (Pflicht, KEIN onSkip)", () => {
    render(<OnboardingWizard onFinished={() => {}} />);
    act(() => {
      captured.password.onComplete?.();
    });
    act(() => {
      captured.sports.onComplete?.();
    });
    act(() => {
      captured.profile.onComplete?.();
    });
    expect(screen.getByTestId("step-nutrition")).toBeTruthy();
    // E5: Nutrition-Schritt darf kein onSkip bekommen (Pflicht).
    expect(captured.nutrition.onSkip).toBeUndefined();
    expect(typeof captured.nutrition.onComplete).toBe("function");
  });

  it("zeigt nach Ernährung den intervals.icu-Schritt", () => {
    render(<OnboardingWizard onFinished={() => {}} />);
    act(() => {
      captured.password.onComplete?.();
    });
    act(() => {
      captured.sports.onComplete?.();
    });
    act(() => {
      captured.profile.onComplete?.();
    });
    act(() => {
      captured.nutrition.onComplete?.();
    });
    expect(screen.getByTestId("step-intervals")).toBeTruthy();
  });

  it("ruft onFinished nach dem intervals-Schritt (complete)", () => {
    const onFinished = vi.fn();
    render(<OnboardingWizard onFinished={onFinished} />);
    act(() => {
      captured.password.onComplete?.();
    });
    act(() => {
      captured.sports.onComplete?.();
    });
    act(() => {
      captured.profile.onComplete?.();
    });
    act(() => {
      captured.nutrition.onComplete?.();
    });
    act(() => {
      captured.intervals.onComplete?.();
    });
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it("ruft onFinished nach dem intervals-Schritt (skip, nutrition always passes through)", () => {
    const onFinished = vi.fn();
    render(<OnboardingWizard onFinished={onFinished} />);
    act(() => {
      captured.password.onComplete?.();
    });
    act(() => {
      captured.sports.onComplete?.();
    });
    act(() => {
      captured.profile.onSkip?.();
    });
    // Nutrition-Schritt ist Pflicht — muss durchlaufen werden
    act(() => {
      captured.nutrition.onComplete?.();
    });
    act(() => {
      captured.intervals.onSkip?.();
    });
    expect(onFinished).toHaveBeenCalledTimes(1);
  });
});

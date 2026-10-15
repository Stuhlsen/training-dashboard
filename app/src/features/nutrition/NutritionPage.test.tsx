/* Tests: NutritionPage — Nur-eigene-Daten-Guard (E28), Karte "Profil ergänzen",
 * einmaliger wegklickbarer Hinweis (E30), ok-Zustand mit Formelname,
 * Körperfett-Datum und Hinweisen (E33–E35). Hooks sind gemockt. */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NutritionDay } from "./nutrition-day-model";

let mockUserId: string | null = "u1";
let mockSelf = { isSelf: true, isLoading: false };
let mockBasics: Record<string, unknown> | undefined = { heightCm: 180, sex: "m", weightKg: 80 };
let mockDay: NutritionDay | null = null;
let mockDayLoading = false;
const useNutritionDayMock = vi.fn();

vi.mock("../../api/hooks/useActiveAthlete", () => ({
  useActiveAthlete: () => ({ activeAthleteId: "athlete1", setActiveAthleteId: vi.fn() }),
}));
vi.mock("../../api/hooks/useSession", () => ({ useAuthUserId: () => mockUserId }));
vi.mock("../../api/hooks/useWriteAuthorization", () => ({ useIsSelfAthlete: () => mockSelf }));
vi.mock("../../api/hooks/useProfile", () => ({
  useProfileBasics: () => ({ data: mockBasics, isLoading: false }),
}));
vi.mock("./useNutritionDay", () => ({
  useNutritionDay: (...args: unknown[]) => {
    useNutritionDayMock(...args);
    return { day: mockDay, isLoading: mockDayLoading };
  },
}));

// Die Wochenansicht hat eigene Tests (WeekView.test.tsx) und eigene Hooks
vi.mock("./WeekView", () => ({ WeekView: () => <p>Wochenansicht-Platzhalter</p> }));
vi.mock("./ShoppingListView", () => ({
  ShoppingListView: ({ onShowWeek }: { onShowWeek: () => void }) => (
    <button type="button" onClick={onShowWeek}>
      Einkaufsliste-Platzhalter
    </button>
  ),
}));

vi.mock("./RecipesView", () => ({ RecipesView: () => <p>Rezepte-Platzhalter</p> }));

const { NutritionPage } = await import("./NutritionPage");

const OK_DAY: Extract<NutritionDay, { ok: true }> = {
  ok: true,
  dateISO: "2026-10-14",
  target: 3021,
  floor: 1760,
  capped: false,
  bmr: 1949,
  formula: "ten-haaf-2014",
  hints: [],
  bodyFatDate: null,
  sexAssumed: false,
  trainingKcal: 0,
  trainingUnknown: false,
  weightKg: 80,
  weightSource: "profile",
  sourceKeys: ["ten-haaf-2014", "fao-who-unu-pal", "ioc-reds-2023"],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <NutritionPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  useNutritionDayMock.mockClear();
  mockUserId = "u1";
  mockSelf = { isSelf: true, isLoading: false };
  mockBasics = { heightCm: 180, sex: "m", weightKg: 80 };
  mockDay = OK_DAY;
  mockDayLoading = false;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("NutritionPage — Guard (E28)", () => {
  it("fremder Athlet: nur der Hinweis, keine Berechnung und kein Hook-Aufruf für die Daten", () => {
    mockSelf = { isSelf: false, isLoading: false };
    renderPage();
    expect(screen.getByText("Ernährung ist nur in deinem eigenen Profil sichtbar")).toBeTruthy();
    expect(screen.queryByText("Tagesziel")).toBeNull();
    expect(useNutritionDayMock).not.toHaveBeenCalled();
  });

  it("eigener Athlet: Tagesziel statt Hinweis", () => {
    renderPage();
    expect(screen.queryByText("Ernährung ist nur in deinem eigenen Profil sichtbar")).toBeNull();
    // die Tagesziel-Karte sitzt in der Tagesbühne (WeekView, hier gemockt) — Details: DayTargetCard.test.tsx
    expect(screen.getByText("Wochenansicht-Platzhalter")).toBeTruthy();
    expect(useNutritionDayMock).toHaveBeenCalledWith("athlete1", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });

  it("ausgeloggt: Anmelde-Link, keine Datenabfrage", () => {
    mockUserId = null;
    renderPage();
    const link = screen.getByText("Zur Anmeldung") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/app/login");
    expect(useNutritionDayMock).not.toHaveBeenCalled();
  });

  it("solange die Eigen-Prüfung läuft: Lade-Anzeige, keine Datenabfrage", () => {
    mockSelf = { isSelf: false, isLoading: true };
    renderPage();
    expect(screen.getByText("Lade …")).toBeTruthy();
    expect(useNutritionDayMock).not.toHaveBeenCalled();
  });
});

describe("NutritionPage — Karte 'Profil ergänzen'", () => {
  it("listet die fehlenden Angaben und verlinkt in die Einstellungen", () => {
    mockDay = { ok: false, missing: ["Gewicht", "Geburtsdatum"], hint: null };
    renderPage();
    expect(screen.getByText("Profil ergänzen")).toBeTruthy();
    expect(screen.getByText("Gewicht")).toBeTruthy();
    expect(screen.getByText("Geburtsdatum")).toBeTruthy();
    expect(screen.queryByText("Tagesziel")).toBeNull();
    const link = screen.getByText("Zu den Einstellungen") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/app/settings");
  });

  it("ohne fehlende Angaben, aber mit Rechen-Hinweis (z. B. ungültiges Körperfett) zeigt sie den Hinweis", () => {
    mockDay = { ok: false, missing: [], hint: "Körperfett-Wert ungültig (150); bitte korrigieren." };
    renderPage();
    expect(screen.getByText("Körperfett-Wert ungültig (150); bitte korrigieren.")).toBeTruthy();
  });

  it("zeigt eine Fehlermeldung statt ewigem 'Lade …', wenn das Laden fertig ist, aber Daten fehlen", () => {
    mockDay = null;
    mockDayLoading = false;
    renderPage();
    expect(screen.getByText(/Deine Daten konnten nicht geladen werden/)).toBeTruthy();
    expect(screen.queryByText("Lade …")).toBeNull();
  });

  it("zeigt Lade-Anzeige, solange das Tagesziel lädt", () => {
    mockDay = null;
    mockDayLoading = true;
    renderPage();
    expect(screen.getByText("Lade …")).toBeTruthy();
  });
});

describe("NutritionPage — Umschalter Woche | Einkaufsliste (E8)", () => {
  it("startet mit der Woche und schaltet auf die Einkaufsliste und zurück", () => {
    renderPage();
    expect(screen.getByText("Wochenansicht-Platzhalter")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Woche" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Einkaufsliste" }));
    expect(screen.queryByText("Wochenansicht-Platzhalter")).toBeNull();
    expect(screen.getByRole("button", { name: "Einkaufsliste" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByText("Einkaufsliste-Platzhalter")); // onShowWeek der Liste
    expect(screen.getByText("Wochenansicht-Platzhalter")).toBeTruthy();
  });

  it("Einkaufsliste zeigt weiter die Tagesziel-Karte, aber ohne Fortschritt", () => {
    renderPage();
    expect(screen.queryByText("Tagesziel")).toBeNull(); // Woche: Karte kommt aus der Bühne
    fireEvent.click(screen.getByRole("button", { name: "Einkaufsliste" }));
    expect(screen.getByText("Tagesziel")).toBeTruthy();
    expect(screen.getByText("3021 kcal")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("Rezepte (R2): dritte Ansicht, ohne Tagesziel-Karte, und zurück zur Woche", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Rezepte" }));
    expect(screen.getByText("Rezepte-Platzhalter")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rezepte" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("Wochenansicht-Platzhalter")).toBeNull();
    expect(screen.queryByText("Tagesziel")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Woche" }));
    expect(screen.getByText("Wochenansicht-Platzhalter")).toBeTruthy();
    expect(screen.queryByText("Rezepte-Platzhalter")).toBeNull();
  });

  it("fremder Athlet (E28): kein Zugang zu den Rezepten über den Tab", () => {
    mockSelf = { isSelf: false, isLoading: false };
    renderPage();
    expect(screen.queryByRole("button", { name: "Rezepte" })).toBeNull();
  });

  it("ohne Tagesziel (Profil unvollständig) gibt es keinen Umschalter", () => {
    mockDay = { ok: false, missing: ["Gewicht"], hint: null };
    renderPage();
    expect(screen.queryByRole("button", { name: "Einkaufsliste" })).toBeNull();
  });

  it("fremder Athlet (E28): weder Umschalter noch Liste", () => {
    mockSelf = { isSelf: false, isLoading: false };
    renderPage();
    expect(screen.queryByRole("button", { name: "Einkaufsliste" })).toBeNull();
    expect(screen.queryByText("Einkaufsliste-Platzhalter")).toBeNull();
  });
});

describe("NutritionPage — einmaliger Hinweis für Bestandsathleten (E30)", () => {
  const HINT = /Neu: Ernährung/;

  it("ist sichtbar, wenn Geschlecht fehlt, und verschwindet nach 'Verstanden' dauerhaft", () => {
    mockBasics = { heightCm: 180, sex: null, weightKg: 80 };
    const first = renderPage();
    expect(screen.getByText(HINT)).toBeTruthy();

    fireEvent.click(screen.getByText("Verstanden"));
    expect(screen.queryByText(HINT)).toBeNull();
    expect(localStorage.getItem("nutrition-profile-hint-dismissed:u1")).toBe("1");

    first.unmount();
    renderPage();
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it("ist sichtbar, wenn die Größe fehlt", () => {
    mockBasics = { heightCm: null, sex: "m", weightKg: 80 };
    renderPage();
    expect(screen.getByText(HINT)).toBeTruthy();
  });

  it("ist sichtbar, wenn das Gewicht ganz fehlt (weder Wellness noch Profil)", () => {
    mockBasics = { heightCm: 180, sex: "m", weightKg: null };
    mockDay = { ok: false, missing: ["Gewicht"], hint: null };
    renderPage();
    expect(screen.getByText(HINT)).toBeTruthy();
  });

  it("fehlt bei vollständigem Profil", () => {
    renderPage();
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it("gilt je Nutzer: das Wegklicken von u1 versteckt ihn nicht für u2", () => {
    mockBasics = { heightCm: 180, sex: null, weightKg: 80 };
    localStorage.setItem("nutrition-profile-hint-dismissed:u1", "1");
    mockUserId = "u2";
    renderPage();
    expect(screen.getByText(HINT)).toBeTruthy();
  });

  it("bleibt bedienbar, wenn localStorage nicht verfügbar ist (Lesen und Schreiben werfen)", () => {
    mockBasics = { heightCm: 180, sex: null, weightKg: 80 };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderPage();
    expect(screen.getByText(HINT)).toBeTruthy();
    fireEvent.click(screen.getByText("Verstanden"));
    // Für diese Sitzung trotzdem weg
    expect(screen.queryByText(HINT)).toBeNull();
  });
});

describe("NutritionPage — Haftungshinweis (E10)", () => {
  const NOTE = /Tagesziel und Vorschläge sind eine Orientierung und ersetzen keine Ernährungsberatung/;

  it("Woche: Hinweis sichtbar", () => {
    renderPage();
    expect(screen.getByText("Wochenansicht-Platzhalter")).toBeTruthy();
    expect(screen.getByText(NOTE)).toBeTruthy();
    expect(screen.getByText("Wichtiger Hinweis:")).toBeTruthy();
  });

  it("Einkaufsliste: Hinweis bleibt sichtbar", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Einkaufsliste" }));
    expect(screen.getByText("Einkaufsliste-Platzhalter")).toBeTruthy();
    expect(screen.getByText(NOTE)).toBeTruthy();
  });

  it("Profil unvollständig: Hinweis fehlt nicht", () => {
    mockDay = { ok: false, missing: ["Gewicht"], hint: null };
    renderPage();
    expect(screen.getByText("Profil ergänzen")).toBeTruthy();
    expect(screen.getByText(NOTE)).toBeTruthy();
  });
});

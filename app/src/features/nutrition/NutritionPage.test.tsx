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
vi.mock("./WeekView", () => ({ WeekView: () => null }));

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
    expect(screen.getByText("Tagesziel")).toBeTruthy();
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

describe("NutritionPage — ok-Zustand", () => {
  it("zeigt Ziel, RED-S-Boden und den Namen der Formel", () => {
    renderPage();
    expect(screen.getByText("3021 kcal")).toBeTruthy();
    expect(screen.getByText("RED-S-Boden: 1760 kcal")).toBeTruthy();
    expect(screen.getByText("Grundumsatz nach Ten Haaf (2014)")).toBeTruthy();
    expect(screen.queryByText(/Körperfett gemessen am/)).toBeNull();
  });

  it("Cunningham mit gemessenem Körperfett: Formelname und Datum (DD.MM.JJJJ — die Messung kann alt sein)", () => {
    mockDay = { ...OK_DAY, formula: "cunningham-1980", bodyFatDate: "2026-10-10" };
    renderPage();
    expect(screen.getByText("Grundumsatz nach Cunningham (1980)")).toBeTruthy();
    expect(screen.getByText(/Körperfett gemessen am 10\.10\.2026/)).toBeTruthy();
  });

  it("zeigt die Hinweise der Formel im deutschen Wortlaut aus core", () => {
    mockDay = { ...OK_DAY, hints: ["Geschlecht fehlt, Schätzung ungenauer"] };
    renderPage();
    expect(screen.getByText("Geschlecht fehlt, Schätzung ungenauer")).toBeTruthy();
  });

  it("bei unbekanntem Geschlecht steht zusätzlich der Mittelwert-Satz (E35)", () => {
    mockDay = { ...OK_DAY, sexAssumed: true };
    renderPage();
    expect(
      screen.getByText(
        /Ohne Geschlechtsangabe rechnen wir mit einem Mittelwert\. Eine Körperfett-Messung macht die Schätzung unabhängig davon\./,
      ),
    ).toBeTruthy();
  });

  it("bei bekanntem Geschlecht fehlt dieser Satz", () => {
    renderPage();
    expect(screen.queryByText(/Ohne Geschlechtsangabe/)).toBeNull();
  });

  it("zeigt Trainingsenergie und, wenn der Boden greift, den Hinweis dazu", () => {
    mockDay = { ...OK_DAY, trainingKcal: 540, capped: true };
    renderPage();
    expect(screen.getByText("Training heute: +540 kcal")).toBeTruthy();
    expect(screen.getByText(/das Ziel wurde auf diesen Wert angehoben/)).toBeTruthy();
  });

  it("meldet eine geplante Einheit mit unbekannter Energie, statt sie still als Ruhetag zu zeigen", () => {
    mockDay = { ...OK_DAY, trainingUnknown: true };
    renderPage();
    expect(screen.getByText(/Heute ist eine Einheit geplant/)).toBeTruthy();
  });

  it("'Quelle' klappt die Einträge aus core/nutrition-sources.js auf", () => {
    renderPage();
    expect(screen.getByText("ⓘ Quelle")).toBeTruthy();
    expect(screen.getByText(/ten Haaf T, Weijs PJ/)).toBeTruthy();
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

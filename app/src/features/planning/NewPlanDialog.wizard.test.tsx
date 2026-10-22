import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { TrainingPlan } from "../../api/types";

/* Hooks der Daten-Schicht werden ersetzt — getestet wird die Verdrahtung des
   Dialogs: Startmodus (PF17), Vorausfüllen und die Rolle-Antwort (PF18). */
const h = vi.hoisted(() => ({
  activePlan: null as unknown,
  planLoading: false,
  isSelf: true,
  profileRole: null as boolean | null,
  updateRole: vi.fn(async () => ({ ok: true as const })),
}));

vi.mock("../../api/hooks/useEvents", () => ({ useEvents: () => ({ data: [] }) }));
vi.mock("../../api/hooks/useRides", () => ({ useRides: () => ({ data: undefined }) }));
vi.mock("../../api/hooks/useActiveSport", () => ({
  useEffectiveSport: () => ({ effectiveSport: "ride" }),
}));
vi.mock("../../api/hooks/usePlanHistoryAggregate", () => ({
  usePlanHistoryAggregate: () => ({ aggregate: null }),
}));
vi.mock("../../api/hooks/useAthleteFormats", () => ({
  useAthleteFormats: () => ({ entries: [] }),
}));
vi.mock("../../api/hooks/useActiveTrainingPlan", () => ({
  useActiveTrainingPlan: () => ({ data: h.activePlan, isLoading: h.planLoading }),
}));
vi.mock("../../api/hooks/usePlanCards", () => ({ usePlanCards: () => ({ data: [] }) }));
vi.mock("../../api/hooks/useSession", () => ({ useSessionProfile: () => ({ id: "u1" }) }));
vi.mock("../../api/hooks/useWriteAuthorization", () => ({
  useIsSelfAthlete: () => ({ isSelf: h.isSelf, isLoading: false }),
}));
vi.mock("../../api/hooks/useFtpHistory", () => ({ useFtpHistory: () => ({ entries: [] }) }));
vi.mock("../../api/hooks/useProfile", () => ({
  useProfileBasics: () => ({
    data: { hasIndoorTrainer: h.profileRole },
    isLoading: false,
  }),
  useUpdateHasIndoorTrainer: () => ({ update: h.updateRole, isPending: false }),
}));
vi.mock("./useCreateTrainingPlan", () => ({
  useCreateTrainingPlan: () => ({ createPlan: vi.fn(), isPending: false }),
}));
vi.mock("../../config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../config")>()),
  athleteConfig: () => null,
}));

import { NewPlanDialog } from "./NewPlanDialog";

const plan = {
  id: "plan-1",
  mode: "open",
  weeks: 9,
  level: "einsteiger",
  focus: "berg",
  trainingWeekdays: [1, 3, 5],
  weeklyHours: 5,
  sport: "ride",
  params: {},
} as unknown as TrainingPlan;

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));

function renderDialog() {
  render(<NewPlanDialog athleteId="athlete1" onClose={() => {}} />);
}

/** Wizard bis zum Formular durchklicken (Rad, Rolle-Schritt + Drinnen/Draußen). */
function completeRideWizard(role: "Ja" | "Nein") {
  click("Weiter");
  click("Über 1 Jahr");
  click("Weiter");
  click("Allgemein");
  click("Weiter");
  click("Weiter");
  click(role);
  click("Weiter");
  if (role === "Ja") click("Weiter"); // Drinnen/Draußen: alles „egal"
  click("Nein"); // FTP unbekannt
  click("Zum Formular");
}

beforeEach(() => {
  h.activePlan = null;
  h.planLoading = false;
  h.isSelf = true;
  h.profileRole = null;
  h.updateRole.mockClear();
});
afterEach(cleanup);

describe("NewPlanDialog — Wizard-Start und Rolle", () => {
  it("ohne bisherigen Plan startet der Wizard, das Formular bleibt verborgen", () => {
    renderDialog();
    expect(screen.getByText(/Schritt 1 von/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Vorschau erstellen" })).toBeNull();
  });

  it("während der Plan lädt: Platzhalter statt Wizard oder Formular", () => {
    h.planLoading = true;
    renderDialog();
    expect(screen.getByText("Lade …")).toBeTruthy();
    expect(screen.queryByText(/Schritt 1 von/)).toBeNull();
    expect((screen.getByRole("button", { name: "Erweitert" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("mit Plan startet das Formular, vorausgefüllt aus dem Plan; „Geführt“ öffnet den Wizard", () => {
    h.activePlan = plan;
    renderDialog();
    expect(screen.getByRole("button", { name: "Vorschau erstellen" })).toBeTruthy();
    expect((screen.getByLabelText("Planlänge (Wochen)") as HTMLInputElement).value).toBe("9");
    expect((screen.getByLabelText("Zeitbudget (h/Woche)") as HTMLInputElement).value).toBe("5");

    click("Geführt");
    expect(screen.getByText(/Schritt 1 von/)).toBeTruthy();
    click("Weiter");
    // Erfahrung kommt aus dem Plan (Einsteiger) und ist vorgewählt
    expect(screen.getByRole("button", { name: "Unter 1 Jahr" }).getAttribute("aria-pressed")).toBe(
      "true"
    );
  });

  it("Athlet selbst: Rolle-Antwort wird im Profil gespeichert, danach steht das Formular", async () => {
    renderDialog();
    completeRideWizard("Ja");
    await waitFor(() => expect(h.updateRole).toHaveBeenCalledWith(true));
    expect(screen.getByRole("button", { name: "Vorschau erstellen" })).toBeTruthy();
  });

  it("fremder Athlet: Rolle-Antwort wird nie ins Profil geschrieben", async () => {
    h.isSelf = false;
    renderDialog();
    completeRideWizard("Ja");
    await waitFor(() => expect(screen.getByRole("button", { name: "Vorschau erstellen" })).toBeTruthy());
    expect(h.updateRole).not.toHaveBeenCalled();
  });

  it("Profilwert schon gesetzt: kein Rolle-Schritt, nichts zu speichern", () => {
    h.profileRole = false;
    renderDialog();
    expect(screen.getByText("Schritt 1 von 5")).toBeTruthy();
  });
});

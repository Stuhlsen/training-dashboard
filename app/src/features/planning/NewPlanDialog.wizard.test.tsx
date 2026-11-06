import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { TrainingPlan } from "../../api/types";

/* Hooks der Daten-Schicht werden ersetzt — getestet wird die Verdrahtung des
   Dialogs: Startmodus (PF17), Vorausfüllen und die Rolle-Antwort (PF18). */
const h = vi.hoisted(() => ({
  activePlan: null as unknown,
  planLoading: false,
  isSelf: true,
  profileRole: null as boolean | null,
  updateRole: vi.fn(async () => ({ ok: true as const })),
  goals: [] as unknown[],
  sports: ["ride"] as string[],
  createPlan: vi.fn(async () => ({ ok: true as const, planId: "p1" })),
  createPlans: vi.fn(async () => ({ ok: true as const, planIds: ["p1", "p2"] })),
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
vi.mock("./useGoalPlanContext", () => ({
  useGoalPlanContext: () => ({ goals: h.goals, interimFtp: null, isLoading: false }),
}));
vi.mock("./useCreateTrainingPlan", () => ({
  useCreateTrainingPlan: () => ({
    createPlan: h.createPlan,
    createPlans: h.createPlans,
    isPending: false,
  }),
}));
vi.mock("../../api/hooks/useAthleteSports", () => ({ useAthleteSports: () => h.sports }));
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

function renderDialog(props: { onClose?: () => void; onCreated?: () => void } = {}) {
  render(<NewPlanDialog athleteId="athlete1" onClose={props.onClose ?? (() => {})} onCreated={props.onCreated} />);
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
  h.goals = [];
  h.sports = ["ride"];
  h.createPlan.mockClear();
  h.createPlans.mockClear();
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

  it("Ziele belegen Fokus vor (überschreiben den letzten Plan) und sagen das offen; alles bleibt änderbar", () => {
    h.activePlan = plan; // Fokus „berg"
    h.goals = [{ id: "g", kind: "Ausdauer", goalKey: "ausdauer", role: "main", targetValue: null, targetDate: null }];
    renderDialog();
    // Ausdauer belegt nur den Fokus vor — Level wird nicht behauptet.
    expect(screen.getByText(/Vorbelegt aus deinen Zielen \(Fokus\)\./)).toBeTruthy();
    const focus = screen.getByLabelText(/^Fokus/) as HTMLSelectElement;
    expect(focus.value).toBe("langstrecke");
    fireEvent.change(focus, { target: { value: "crit" } });
    expect(focus.value).toBe("crit");
  });

  it("ohne passende Ziele: keine Vorbelegung, kein Hinweis, Fokus bleibt aus dem Plan", () => {
    h.activePlan = plan;
    h.goals = [{ id: "g", kind: "Muskeln", goalKey: "muskeln_kraft", role: "main", targetValue: null, targetDate: null }];
    renderDialog();
    expect(screen.queryByText(/Vorbelegt aus deinen Zielen/)).toBeNull();
    expect((screen.getByLabelText(/^Fokus/) as HTMLSelectElement).value).toBe("berg");
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

/* Fahrplan 44 E4: mehrere Sportarten in einem Dialog. */
describe("NewPlanDialog — mehrere Sportarten", () => {
  // Rad auf den Standard-Radtagen: Laufen (Mo/Mi/So) bekommt eigene Tage.
  const ridePlan = {
    ...plan,
    trainingWeekdays: [2, 4, 6],
    weeklyHours: 6,
    endDate: "2026-12-20",
  } as unknown as TrainingPlan;
  const picker = () => screen.queryByRole("group", { name: "Sportarten in diesem Plan" });
  const chip = (name: RegExp) => screen.getByRole("button", { name });

  it("mit nur einer Sportart gibt es keine Auswahl — der Dialog bleibt wie bisher", () => {
    h.activePlan = ridePlan;
    renderDialog();
    expect(picker()).toBeNull();
    expect(screen.getByRole("button", { name: "Vorschau erstellen" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Laufen-Plan" })).toBeNull();
  });

  it("mit mehreren Sportarten erscheint die Auswahl; gewählt ist zunächst nur Rad", () => {
    h.sports = ["ride", "run"];
    h.activePlan = ridePlan;
    renderDialog();
    expect(picker()).toBeTruthy();
    expect(chip(/Rad/).getAttribute("aria-pressed")).toBe("true");
    expect(chip(/Laufen/).getAttribute("aria-pressed")).toBe("false");
    // Die einzige gewählte Sportart lässt sich nicht abwählen.
    expect((chip(/Rad/) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("group", { name: "Laufen-Plan" })).toBeNull();
  });

  it("eine Sportart allein gewählt läuft den heutigen Weg: speichert über createPlan, ohne Gruppe", async () => {
    h.sports = ["ride", "run"];
    h.activePlan = ridePlan;
    renderDialog();
    click("Vorschau erstellen");
    click(/Plan ersetzen/);
    await waitFor(() => expect(h.createPlan).toHaveBeenCalledTimes(1));
    expect(h.createPlans).not.toHaveBeenCalled();
  });

  it("Laufen dazuwählen zeigt dessen Abschnitt; wieder abwählen entfernt ihn", () => {
    h.sports = ["ride", "run"];
    h.activePlan = ridePlan;
    renderDialog();
    click(/Laufen/);
    const run = screen.getByRole("group", { name: "Laufen-Plan" });
    expect(within(run).getByLabelText("Zeitbudget (h/Woche)")).toBeTruthy();
    expect(within(run).getByLabelText(/Aktuelle Schwellenpace/)).toBeTruthy();
    // Der Geführt-Modus gibt es für mehrere Sportarten nicht.
    expect((screen.getByRole("button", { name: "Geführt" }) as HTMLButtonElement).disabled).toBe(true);
    click(/Laufen/);
    expect(screen.queryByRole("group", { name: "Laufen-Plan" })).toBeNull();
  });

  it("Vorschau: gemeinsames Raster, Last je Sportart, Summe als Näherung, Ersetzen je Sportart", () => {
    h.sports = ["ride", "run"];
    h.activePlan = ridePlan;
    renderDialog();
    click(/Laufen/);
    click("Vorschau erstellen");
    const region = screen.getByRole("region", { name: "Gemeinsame Vorschau" });
    expect(within(region).getByRole("table", { name: "Wochenraster aller Sportarten" })).toBeTruthy();
    expect(within(region).getByText("Summe (Näherung)")).toBeTruthy();
    expect(within(region).getByText(/Rad: ersetzt den laufenden Plan/)).toBeTruthy();
    expect(within(region).getByText(/Laufen: ersetzt den laufenden Plan/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pläne ersetzen" })).toBeTruthy();
  });

  it("Übernehmen speichert beide Pläne in einem Lauf und schließt den Dialog", async () => {
    h.sports = ["ride", "run"];
    h.activePlan = ridePlan;
    const onClose = vi.fn();
    const onCreated = vi.fn();
    renderDialog({ onClose, onCreated });
    click(/Laufen/);
    click("Vorschau erstellen");
    click("Pläne ersetzen");
    await waitFor(() => expect(h.createPlans).toHaveBeenCalledTimes(1));
    const items = (h.createPlans.mock.calls[0] as unknown as [Array<{ input: { sport: string } }>])[0];
    expect(items.map((i) => i.input.sport)).toEqual(["ride", "run"]);
    expect(h.createPlan).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onCreated).toHaveBeenCalled();
  });

  it("Eingabefehler einer Sportart zeigt das Formular, ohne Vorschau und ohne Speichern", () => {
    h.sports = ["ride", "run"];
    h.activePlan = ridePlan;
    renderDialog();
    click(/Laufen/);
    const run = screen.getByRole("group", { name: "Laufen-Plan" });
    fireEvent.change(within(run).getByLabelText("Zeitbudget (h/Woche)"), { target: { value: "0" } });
    click("Vorschau erstellen");
    expect(screen.getByText("Laufen: Zeitbudget in Stunden angeben.")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Gemeinsame Vorschau" })).toBeNull();
    expect((screen.getByRole("button", { name: /Pläne|Plan ersetzen|Übernehmen/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("zeigt Hinweise der Verteilung, die nichts sperren", () => {
    h.sports = ["ride", "run"];
    h.activePlan = ridePlan;
    renderDialog();
    click(/Laufen/);
    const run = screen.getByRole("group", { name: "Laufen-Plan" });
    fireEvent.change(within(run).getByLabelText("Zeitbudget (h/Woche)"), { target: { value: "12" } });
    const hints = screen.getByRole("status", { name: "Hinweise zur Verteilung" });
    expect(hints.textContent).toMatch(/sperren nichts/);
    expect(hints.textContent).toMatch(/viele Stunden pro Tag/);
    click("Vorschau erstellen");
    expect(screen.getByRole("region", { name: "Gemeinsame Vorschau" })).toBeTruthy();
  });

  it("eine Änderung nach der Vorschau macht sie ungültig — erst neu erstellen, dann speichern", () => {
    h.sports = ["ride", "run"];
    h.activePlan = ridePlan;
    renderDialog();
    click(/Laufen/);
    click("Vorschau erstellen");
    const run = screen.getByRole("group", { name: "Laufen-Plan" });
    fireEvent.change(within(run).getByLabelText("Zeitbudget (h/Woche)"), { target: { value: "4" } });
    expect(screen.queryByRole("region", { name: "Gemeinsame Vorschau" })).toBeNull();
    expect((screen.getByRole("button", { name: /Pläne/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

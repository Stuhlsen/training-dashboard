import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GuidedPlanQuestions, type GuidedPlanQuestionsProps } from "./GuidedPlanQuestions";
import { defaultFormState } from "./new-plan-dialog-view-model";

afterEach(cleanup);

const TODAY = "2026-10-22";

function renderWizard(over: Partial<GuidedPlanQuestionsProps> = {}) {
  const onComplete = vi.fn();
  render(
    <GuidedPlanQuestions
      sport="ride"
      profileRole={null}
      canSaveRoleToProfile
      prefilled={false}
      initialForm={defaultFormState(null, TODAY)}
      events={[]}
      todayISO={TODAY}
      onComplete={onComplete}
      {...over}
    />
  );
  return onComplete;
}

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));

/** Ziel (Vorgabe) → Erfahrung → Fokus → Tage + Stunden (Vorgaben) durchklicken. */
function throughSchedule(experience: "Unter 1 Jahr" | "Über 1 Jahr" = "Über 1 Jahr") {
  click("Weiter");
  click(experience);
  click("Weiter");
  click("Allgemein");
  click("Weiter");
  click("Weiter");
}

describe("GuidedPlanQuestions", () => {
  it("zeigt einen Schritt pro Bildschirm mit Fortschritt, Zurück ist im ersten Schritt aus", () => {
    renderWizard();
    expect(screen.getByText("Schritt 1 von 6")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Worauf trainierst du hin?" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Zurück" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("hält an, solange eine Pflichtfrage offen ist, und zeigt den Grund", () => {
    renderWizard();
    click("Weiter"); // Ziel (offen, 12 Wochen) ok
    click("Weiter"); // Erfahrung offen
    expect(screen.getByRole("alert").textContent).toMatch(/Antwort/);
    expect(screen.getByText("Schritt 2 von 6")).toBeTruthy();
  });

  it("Rad ohne Profil-Rolle: „Ja“ fügt den Drinnen/Draußen-Schritt ein", () => {
    renderWizard();
    throughSchedule();
    expect(screen.getByRole("heading", { name: /Rolle oder einen Smart-Trainer/ })).toBeTruthy();
    expect(screen.getByText("Schritt 5 von 6")).toBeTruthy();
    click("Ja");
    expect(screen.getByText("Schritt 5 von 7")).toBeTruthy();
    click("Weiter");
    expect(screen.getByRole("heading", { name: /drinnen, welche draußen/ })).toBeTruthy();
    // eine Gruppe je Trainingstag (Vorgabe: Di/Do/Sa)
    expect(screen.getAllByRole("group")).toHaveLength(3);
    fireEvent.click(screen.getAllByRole("button", { name: "Drinnen" })[0]);
    click("Weiter");
    expect(screen.getByRole("heading", { name: "Kennst du deine FTP?" })).toBeTruthy();
    expect(screen.getByText("Schritt 7 von 7")).toBeTruthy();
  });

  it("liefert das Ergebnis: FTP bekannt vor 2 Wochen, Rolle im Selbst-Fall fürs Profil", () => {
    const onComplete = renderWizard();
    throughSchedule("Unter 1 Jahr");
    click("Nein"); // Rolle
    click("Weiter");
    click(/Ja, ungefähr/);
    fireEvent.change(screen.getByLabelText("FTP (W)"), { target: { value: "250" } });
    fireEvent.change(screen.getByLabelText("Gemessen etwa am"), { target: { value: "2026-10-08" } });
    click("Zum Formular");

    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0];
    expect(result.saveIndoorTrainerToProfile).toBe(true);
    expect(result.form).toMatchObject({
      level: "einsteiger",
      focus: "allgemein",
      hasIndoorTrainer: false,
      currentFtp: 250,
      ftpMeasuredDate: "2026-10-08",
    });
  });

  it("verlangt bei „FTP bekannt“ Watt und Messdatum", () => {
    const onComplete = renderWizard();
    throughSchedule();
    click("Nein"); // Rolle
    click("Weiter");
    click(/Ja, ungefähr/);
    click("Zum Formular");
    expect(screen.getByRole("alert").textContent).toMatch(/Watt/);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("überspringt den Rolle-Schritt, wenn das Profil schon antwortet", () => {
    renderWizard({ profileRole: false });
    expect(screen.getByText("Schritt 1 von 5")).toBeTruthy();
  });

  it("Trainer-Fall: Rolle wird gefragt, aber nicht fürs Profil gespeichert", () => {
    const onComplete = renderWizard({ canSaveRoleToProfile: false });
    throughSchedule();
    expect(screen.getByText(/gilt nur für diesen Plan/)).toBeTruthy();
    click("Nein");
    click("Weiter");
    click("Nein"); // FTP unbekannt
    click("Zum Formular");
    expect(onComplete.mock.calls[0][0].saveIndoorTrainerToProfile).toBe(false);
    expect(onComplete.mock.calls[0][0].form.hasIndoorTrainer).toBe(false);
  });

  it("Lauf: keine Rolle, letzter Schritt ist die optionale Schwellenpace", () => {
    const onComplete = renderWizard({ sport: "run" });
    expect(screen.getByText("Schritt 1 von 5")).toBeTruthy();
    throughSchedule();
    expect(screen.getByRole("heading", { name: "Kennst du deine Schwellenpace?" })).toBeTruthy();
    click("Zum Formular"); // leer lassen ist erlaubt
    expect(onComplete.mock.calls[0][0].form).not.toHaveProperty("hasIndoorTrainer");
  });

  it("Zurück behält die Antworten", () => {
    renderWizard();
    click("Weiter");
    click("Unter 1 Jahr");
    click("Weiter");
    click("Zurück");
    expect(screen.getByRole("button", { name: "Unter 1 Jahr" }).getAttribute("aria-pressed")).toBe(
      "true"
    );
  });

  it("Event-Ziel ohne Event: verlangt Renntag und Name", () => {
    renderWizard();
    click("Auf ein Event hin");
    click("Weiter");
    expect(screen.getByRole("alert").textContent).toMatch(/Event/);
  });
});

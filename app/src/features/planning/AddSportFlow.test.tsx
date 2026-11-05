/* Tests: AddSportFlow.tsx — Darstellung und Bedienung von „Sportart
 * hinzufügen" (Fahrplan 44 E5). Der Zustand (useAddSportFlow) ist gemockt; die
 * Rechnung steckt im View-Model und ist dort getestet. Hier zählt: nichts wird
 * geschrieben, bevor bestätigt wird, und was fehlt, wird offen genannt. */

import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const confirm = vi.fn();
let flow: Record<string, unknown>;

vi.mock("./useAddSportFlow", () => ({ useAddSportFlow: () => flow }));

const { AddSportFlow } = await import("./AddSportFlow");

const draft = { hours: 3, weekdays: [1, 3, 7], level: "einsteiger", currentThresholdSpeed: null, thresholdSpeedTarget: null };
const load = {
  weekStarts: ["2026-11-09"],
  rows: [
    { sport: "ride", label: "Rad", values: [180], avg: 180 },
    { sport: "run", label: "Laufen", values: [40], avg: 40 },
  ],
  total: [220],
  totalAvg: 220,
  totalLabel: "Summe (Näherung)",
};
const okPreview = (over: Record<string, unknown> = {}) => ({
  ok: true,
  startDate: "2026-11-09",
  duration: { weeks: 12, usedMinimum: false, cappedAtMax: false },
  notes: [],
  hints: [],
  jump: { oldAvg: 180, newAvg: 220, pct: 22, warn: false, text: null },
  gridItems: [
    { sport: "ride", plan: { weeks: [{ start: "2026-11-09", cards: [] }] } },
    { sport: "run", plan: { weeks: [{ start: "2026-11-09", cards: [] }] } },
  ],
  load,
  ...over,
});

function baseFlow(over: Record<string, unknown> = {}) {
  return {
    loading: false,
    activePlans: [{ id: "p", sport: "ride", endDate: "2027-01-31" }],
    options: { offered: ["run"], missingInProfile: [], outranked: [] },
    sport: "run",
    pick: vi.fn(),
    draft,
    setDraft: vi.fn(),
    gentle: { gentle: true, reason: "no-history", profile: {} },
    gentleOn: true,
    setGentle: vi.fn(),
    startDate: "2026-11-09",
    preview: okPreview(),
    saveError: null,
    isPending: false,
    confirm,
    ...over,
  };
}

function setup() {
  const onBack = vi.fn();
  const onClose = vi.fn();
  const onBusyChange = vi.fn();
  const { container } = render(
    <MemoryRouter>
      <AddSportFlow athleteId="athlete1" onBack={onBack} onClose={onClose} onBusyChange={onBusyChange} />
    </MemoryRouter>,
  );
  return { onBack, onClose, onBusyChange, backdrop: container.firstElementChild as HTMLElement };
}

const addButton = () => screen.getByRole("button", { name: "Sportart hinzufügen" }) as HTMLButtonElement;

beforeEach(() => {
  confirm.mockReset();
  confirm.mockResolvedValue(true);
  flow = baseFlow();
});

describe("AddSportFlow — Fehler werden angekündigt", () => {
  it("ein Speicherfehler steht in einem role=alert (Screenreader)", () => {
    flow = baseFlow({ saveError: "Das Speichern ist gescheitert." });
    setup();
    expect(screen.getByRole("alert").textContent).toContain("Das Speichern ist gescheitert.");
  });
});

describe("AddSportFlow — Schließen während des Speicherns", () => {
  it("ein Klick auf den Hintergrund schließt nicht, solange gespeichert wird", () => {
    flow = baseFlow({ isPending: true });
    const { onClose, backdrop } = setup();
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ein Klick auf den Hintergrund schließt, wenn nichts gespeichert wird", () => {
    const { onClose, backdrop } = setup();
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("meldet dem Eltern-Dialog „beschäftigt“ von Beginn bis Ende des Speicherns", async () => {
    const { onBusyChange } = setup();
    fireEvent.click(addButton());
    await vi.waitFor(() => expect(onBusyChange).toHaveBeenCalledWith(false));
    expect(onBusyChange.mock.calls.map((c) => c[0])).toEqual([true, false]);
  });
});

describe("AddSportFlow", () => {
  it("zeigt Start nächsten Montag, Dauer und dass der laufende Plan unverändert bleibt", () => {
    setup();
    expect(screen.getByText(/Dein laufender Plan bleibt, wie er ist/)).toBeTruthy();
    expect(screen.getByText(/Start: Montag, 09\.11 /)).toBeTruthy();
    expect(screen.getByText(/12 Wochen/)).toBeTruthy();
  });

  it("Abbrechen schreibt nichts und schließt", () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("Zurück schreibt nichts", () => {
    const { onBack } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Zurück zu/ }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("schreibt erst nach „Sportart hinzufügen“ und schließt danach", async () => {
    const { onClose } = setup();
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.click(addButton());
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("scheitert das Speichern, bleibt der Dialog offen", async () => {
    confirm.mockResolvedValue(false);
    const { onClose } = setup();
    fireEvent.click(addButton());
    await vi.waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("nennt eine Sportart, die im Profil fehlt, offen und verweist auf die Einstellungen", () => {
    flow = baseFlow({
      options: { offered: [], missingInProfile: ["run"], outranked: [] },
      sport: null,
      draft: null,
      preview: null,
    });
    setup();
    expect(screen.getByText(/Laufen ist in deinem Profil nicht aktiviert/)).toBeTruthy();
    const link = screen.getByRole("link", { name: "Einstellungen" });
    expect(link.getAttribute("href")).toBe("/app/settings");
    expect(addButton().disabled).toBe(true);
  });

  it("zeigt die Warnung bei einem Lastsprung ruhig, ohne den Knopf zu sperren", () => {
    flow = baseFlow({
      preview: okPreview({
        jump: { oldAvg: 180, newAvg: 260, pct: 44, warn: true, text: "Die Wochenlast steigt im Schnitt … Näherung." },
      }),
    });
    setup();
    expect(screen.getByRole("status", { name: "Hinweis zur Gesamtlast" }).textContent).toMatch(/Wochenlast steigt/);
    expect(addButton().disabled).toBe(false);
  });

  it("ohne Sprung keine Warnung", () => {
    setup();
    expect(screen.queryByRole("status", { name: "Hinweis zur Gesamtlast" })).toBeNull();
  });

  it("zeigt die Hinweise der Verteilung und die Last mit „Näherung“", () => {
    flow = baseFlow({
      preview: okPreview({ hints: [{ code: "SHARED_DAY", text: "Laufen teilt sich den Di.", sport: "run" }] }),
    });
    setup();
    expect(screen.getByRole("status", { name: "Hinweise zur Verteilung" }).textContent).toMatch(/teilt sich den Di/);
    expect(screen.getByText("Summe (Näherung)")).toBeTruthy();
  });

  it("bei Eingabefehlern: Fehler sichtbar, Bestätigen gesperrt", () => {
    flow = baseFlow({
      preview: {
        ok: false,
        errors: { "run.trainingWeekdays": "Laufen: Mindestens zwei Trainingstage wählen." },
        hints: [],
      },
    });
    setup();
    expect(screen.getByRole("alert").textContent).toMatch(/Mindestens zwei Trainingstage/);
    expect(addButton().disabled).toBe(true);
  });

  it("der sanfte Einstieg ist änderbar", () => {
    setup();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(flow.setGentle as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(false);
  });
});

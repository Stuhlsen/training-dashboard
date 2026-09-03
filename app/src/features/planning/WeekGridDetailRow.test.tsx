import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WeekGridDetailRow } from "./WeekGridDetailRow";
import type { PlanCard } from "../../api/types";

// Kein globaler afterEach(cleanup) im Projekt-Setup (s. WeekGrid.test.tsx).
afterEach(cleanup);

const TODAY = "2026-08-12";

// Leere Projektion — cardImpact() liefert bei fehlendem Tag `null` (s.
// core/plan-feedback.js::dayImpact), die Wirkungsanzeige ist hier bewusst
// nicht Teil dieses Tests (schon in projection.test.js/plan-feedback.test.js
// abgedeckt) — nur die Detailzweig-Auswahl/Handler-Verdrahtung sind neu.
const EMPTY_PROJECTION = { days: [], startCtl: 0, startAtl: 0 } as never;

function card(overrides: Partial<PlanCard> & { id: string }): PlanCard {
  return {
    date: "2026-08-14",
    sortOrder: 0,
    name: "Session",
    typ: "Sweet Spot",
    km: null,
    durationMin: null,
    tssPlanned: null,
    week: null,
    phase: "Aufbau 2",
    details: null,
    workout: null,
    workoutStructure: null,
    pushedExternalId: null,
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

function renderRow(c: PlanCard, propOverrides: Partial<Parameters<typeof WeekGridDetailRow>[0]> = {}) {
  const onEdit = vi.fn();
  const onMove = vi.fn().mockResolvedValue({ ok: true });
  const onCancel = vi.fn().mockResolvedValue({ ok: true });
  const onUndo = vi.fn().mockResolvedValue({ ok: true });
  const utils = render(
    <WeekGridDetailRow
      card={c}
      canEdit
      rides={[]}
      conflicts={[]}
      projection={EMPTY_PROJECTION}
      ftp={200}
      forecast={{}}
      wellness={[]}
      plannedSessions={[]}
      onEdit={onEdit}
      onMove={onMove}
      onCancel={onCancel}
      onUndo={onUndo}
      {...propOverrides}
    />,
  );
  return { ...utils, onEdit, onMove, onCancel, onUndo };
}

describe("WeekGridDetailRow — Detail-Quelle-Priorität", () => {
  it("zeigt Block-Chips, wenn workout im neuen {blocks} Format vorliegt", () => {
    renderRow(card({ id: "a", workout: { blocks: [{ type: "interval", text: "3x5min @ 250W" }] } }));
    expect(screen.getByText(/Intervall: 3x5min @ 250W/)).toBeTruthy();
  });

  it("zeigt die Legacy-Segmentleiste beim alten Zahlenformat, ohne Blocks", () => {
    renderRow(
      card({
        id: "b",
        workout: { warmup: 10, intervals: 3, duration: 5, rest: 3, cooldown: 10, watts: [200, 220] },
      }),
    );
    expect(screen.getByText(/Warm-up/)).toBeTruthy();
  });

  it("zeigt den Z2-Block bei Z2-Typ + km, ohne workout/Legacy-Timeline", () => {
    renderRow(card({ id: "c", typ: "Z2 Dauer", km: 60, details: "locker fahren" }));
    expect(screen.getByText(/Ziel-HF/)).toBeTruthy();
  });

  it("zeigt den Recovery-Block bei Recovery-Typ, ohne Z2/workout", () => {
    renderRow(card({ id: "d", typ: "Z1 Recovery", details: "ganz locker" }));
    expect(screen.getByText(/Aktuelle Erholungswerte/)).toBeTruthy();
  });

  it("zeigt den Freitext, wenn kein anderer Zweig greift", () => {
    renderRow(card({ id: "e", typ: "Sweet Spot", details: "Freier Beschreibungstext" }));
    expect(screen.getByText("Freier Beschreibungstext")).toBeTruthy();
  });
});

describe("WeekGridDetailRow — Verschieben/Ausfallen/Push-Verdrahtung", () => {
  it("ruft onMove mit id/Datum/Begründung auf und schließt das Formular danach", async () => {
    const { onMove } = renderRow(card({ id: "a" }));
    fireEvent.click(screen.getByText("Verschieben"));
    fireEvent.change(screen.getByLabelText("Neues Datum"), { target: { value: "2026-08-20" } });
    fireEvent.change(screen.getByLabelText("Begründung (optional)"), { target: { value: "Termin" } });
    fireEvent.click(screen.getByText("Verschieben", { selector: "button[type=submit]" }));
    await vi.waitFor(() => expect(onMove).toHaveBeenCalledWith("a", "2026-08-20", "Termin"));
    await vi.waitFor(() => expect(screen.queryByLabelText("Neues Datum")).toBeNull());
  });

  it("ruft onCancel mit id/Grund auf", async () => {
    const { onCancel } = renderRow(card({ id: "b" }));
    fireEvent.click(screen.getByText("Ausfallen"));
    fireEvent.change(screen.getByLabelText("Grund (optional)"), { target: { value: "krank" } });
    fireEvent.click(screen.getByText("Ausfallen", { selector: "button[type=submit]" }));
    await vi.waitFor(() => expect(onCancel).toHaveBeenCalledWith("b", "krank"));
  });

  it("zeigt 'Rückgängig' statt Verschieben/Ausfallen bei ausgefallener Karte und ruft onUndo auf", async () => {
    const { onUndo } = renderRow(card({ id: "c", cancelled: true }));
    expect(screen.queryByText("Verschieben")).toBeNull();
    fireEvent.click(screen.getByText("↩ Rückgängig"));
    await vi.waitFor(() => expect(onUndo).toHaveBeenCalledWith("c"));
  });

  describe("Push", () => {
    const CREDENTIALS = { apiKey: "token-abc", athleteId: "i123" };

    it("ruft onPush mit den hinterlegten Zugangsdaten auf, wenn canPush + workout gesetzt sind", async () => {
      const onPush = vi.fn().mockResolvedValue({ ok: true });
      renderRow(card({ id: "d", workout: { blocks: [] } }), {
        canPush: true,
        onPush,
        intervalsCredentials: CREDENTIALS,
      });
      fireEvent.click(screen.getByText("📤 Auf Wahoo pushen"));
      await vi.waitFor(() => expect(onPush).toHaveBeenCalledWith("d", "token-abc", "i123"));
      await screen.findByText("✅ Gepusht!");
    });

    it("zeigt den Push-Button nicht ohne canPush", () => {
      renderRow(card({ id: "e", workout: { blocks: [] } }), {
        canPush: false,
        onPush: vi.fn(),
        intervalsCredentials: CREDENTIALS,
      });
      expect(screen.queryByText(/Auf Wahoo pushen/)).toBeNull();
    });

    it("zeigt einen Hinweis statt zu pushen, wenn keine Zugangsdaten hinterlegt sind", async () => {
      const onPush = vi.fn();
      renderRow(card({ id: "f", workout: { blocks: [] } }), {
        canPush: true,
        onPush,
        intervalsCredentials: null,
      });
      fireEvent.click(screen.getByText("📤 Auf Wahoo pushen"));
      await screen.findByText(/intervals\.icu-Key fehlt/);
      expect(onPush).not.toHaveBeenCalled();
    });
  });

  describe("Zwift/MyWhoosh-Export", () => {
    const NUMERIC_WORKOUT = { warmup: 10, intervals: 3, duration: 10, rest: 3, cooldown: 8, pct: [84, 97] };

    it("zeigt die Export-Auswahl nicht bei Freitext-Blockform (keine %FTP-Werte ableitbar)", () => {
      renderRow(card({ id: "g", workout: { blocks: [] } }), { canPush: true });
      expect(screen.queryByTitle("Trainingsdatei für Zwift oder MyWhoosh herunterladen")).toBeNull();
    });

    it("zeigt die Export-Auswahl nicht bei numerischem Workout ohne Hauptsatz (z. B. Ramp-Test)", () => {
      renderRow(
        card({ id: "g2", workout: { warmup: 10, intervals: null, duration: null, cooldown: 5, pct: null } }),
        { canPush: true },
      );
      expect(screen.queryByTitle("Trainingsdatei für Zwift oder MyWhoosh herunterladen")).toBeNull();
    });

    it("löst bei numerischem Workout einen Zwift-Download aus und zeigt den Zielordner-Hinweis", async () => {
      const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
      const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
      const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

      renderRow(card({ id: "h", workout: NUMERIC_WORKOUT }), { canPush: true });
      fireEvent.click(screen.getByTitle("Trainingsdatei für Zwift oder MyWhoosh herunterladen"));
      fireEvent.click(screen.getByText("Für Zwift (.zwo)"));

      expect(createObjectURL).toHaveBeenCalled();
      expect(click).toHaveBeenCalled();
      await screen.findByText(/Zwift\\Workouts/);

      createObjectURL.mockRestore();
      revokeObjectURL.mockRestore();
      click.mockRestore();
    });
  });
});

describe("WeekGridDetailRow — Umsortieren innerhalb des Tages", () => {
  it("zeigt keine ▲/▼-Knöpfe ohne reorder-Prop (Tag mit nur einer Karte)", () => {
    renderRow(card({ id: "a" }));
    expect(screen.queryByRole("button", { name: "Eine Position nach oben" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Eine Position nach unten" })).toBeNull();
  });

  it("ruft onReorder('down') auf und lässt ▲ am oberen Rand deaktiviert", async () => {
    const onReorder = vi.fn().mockResolvedValue({ ok: true });
    renderRow(card({ id: "a" }), { reorder: { canUp: false, canDown: true, onReorder } });

    const up = screen.getByRole("button", { name: "Eine Position nach oben" });
    const down = screen.getByRole("button", { name: "Eine Position nach unten" });
    expect(up).toHaveProperty("disabled", true);
    expect(down).toHaveProperty("disabled", false);

    fireEvent.click(down);
    await vi.waitFor(() => expect(onReorder).toHaveBeenCalledWith("down"));
  });

  it("zeigt eine Fehlermeldung, wenn das Umsortieren fehlschlägt", async () => {
    const onReorder = vi.fn().mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "geht nicht" } });
    renderRow(card({ id: "a" }), { reorder: { canUp: true, canDown: false, onReorder } });

    fireEvent.click(screen.getByRole("button", { name: "Eine Position nach oben" }));
    expect(await screen.findByText("geht nicht")).toBeTruthy();
  });
});

describe("WeekGridDetailRow — Ruhetag-gefahren-Hinweis", () => {
  it("zeigt den Hinweis-Chip, wenn ein Ruhetag trotzdem gefahren wurde", () => {
    renderRow(card({ id: "f", typ: "Ruhetag", date: TODAY }), {
      rides: [{ date: TODAY } as never],
    });
    expect(screen.getByText("1 Hinweis")).toBeTruthy();
  });

  it("zeigt keinen Hinweis-Chip für einen nicht gefahrenen Ruhetag", () => {
    renderRow(card({ id: "g", typ: "Ruhetag", date: TODAY }), { rides: [] });
    expect(screen.queryByText("1 Hinweis")).toBeNull();
  });
});

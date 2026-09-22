/* Tests: SportsSection (Fahrplan 21 E3) — Q4: keine Sportart ist Pflicht,
 * die jeweils letzte verbleibende aktive Sportart (egal welche) bleibt
 * gesperrt. Rad ist NICHT hartkodiert erforderlich. */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

let updateMock: ReturnType<typeof vi.fn> = vi.fn();
let updatePending = false;
let profileData: { sports: string[] } | undefined = { sports: ["ride"] };

vi.mock("../../api/hooks/useSession", () => ({
  useCurrentProfile: () => ({
    data: profileData,
    isLoading: false,
  }),
}));

vi.mock("../../api/hooks/useProfile", () => ({
  useUpdateSports: () => ({ update: updateMock, isPending: updatePending }),
}));

const { SportsSection } = await import("./SportsSection");

describe("SportsSection (Q4: keine ride-Pflicht)", () => {
  it("einzelne nicht-Rad-Sportart (Schwimm) bleibt gesperrt und schreibt nicht", async () => {
    profileData = { sports: ["swim"] };
    updateMock = vi.fn(async () => ({ ok: true }));
    const { unmount } = render(<SportsSection />);

    const swim = screen.getByLabelText("Schwimm") as HTMLInputElement;
    expect(swim.checked).toBe(true);
    expect(swim.disabled).toBe(true);

    await act(async () => {
      fireEvent.click(swim);
    });
    expect(updateMock).not.toHaveBeenCalled();
    unmount();
  });

  it("bei mehreren Sportarten laesst sich Rad abwaehlen (kein ride-Zwang)", async () => {
    profileData = { sports: ["ride", "run"] };
    updateMock = vi.fn(async () => ({ ok: true }));
    const { unmount } = render(<SportsSection />);

    const ride = screen.getByLabelText("Rad") as HTMLInputElement;
    expect(ride.checked).toBe(true);
    expect(ride.disabled).toBe(false);

    await act(async () => {
      fireEvent.click(ride);
    });
    expect(updateMock).toHaveBeenCalledWith(["run"]);
    unmount();
  });

  it("bei mehreren Sportarten laesst sich Lauf abwaehlen, Rad bleibt", async () => {
    profileData = { sports: ["ride", "run"] };
    updateMock = vi.fn(async () => ({ ok: true }));
    const { unmount } = render(<SportsSection />);

    const run = screen.getByLabelText("Lauf") as HTMLInputElement;
    await act(async () => {
      fireEvent.click(run);
    });
    expect(updateMock).toHaveBeenCalledWith(["ride"]);
    unmount();
  });

  it("einzelne Rad-Sportart bleibt gesperrt (letzte verbleibende, egal welche)", async () => {
    profileData = { sports: ["ride"] };
    updateMock = vi.fn(async () => ({ ok: true }));
    const { unmount } = render(<SportsSection />);

    const ride = screen.getByLabelText("Rad") as HTMLInputElement;
    expect(ride.disabled).toBe(true);
    await act(async () => {
      fireEvent.click(ride);
    });
    expect(updateMock).not.toHaveBeenCalled();
    unmount();
  });
});

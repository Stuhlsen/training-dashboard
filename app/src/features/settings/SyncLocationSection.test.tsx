/* Tests: SyncLocationSection — ein gespeicherter Ort wird nie im Klartext
 * gezeigt (Punkte wie beim Intervals-Key), „Ändern" öffnet das Formular,
 * im Streamer-Modus ist auch das gesperrt. Hooks gemockt, synthetische Orte. */

import { act, fireEvent, render, renderHook, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let mockLocation: { lat: number | null; lon: number | null; locationLabel: string | null } = {
  lat: 52.52,
  lon: 13.4,
  locationLabel: "Teststadt, Testland",
};

vi.mock("../../api/hooks/useSyncLocation", () => ({
  useSyncLocation: () => ({
    location: mockLocation,
    isLoading: false,
    update: vi.fn(async () => ({ ok: true })),
    isPending: false,
  }),
}));

vi.mock("../../api/supabase/athlete-sync-config", () => ({
  roundCoord: (n: number) => n,
}));

vi.mock("../../api/geocoding", () => ({
  formatCityLabel: (m: { name: string }) => m.name,
  searchCities: vi.fn(async () => ({ ok: true, matches: [] })),
}));

const { SyncLocationSection } = await import("./SyncLocationSection");
const { useStreamerMode } = await import("../../hooks/useStreamerMode");

afterEach(() => {
  const { result } = renderHook(() => useStreamerMode());
  act(() => result.current.setEnabled(false));
  mockLocation = { lat: 52.52, lon: 13.4, locationLabel: "Teststadt, Testland" };
});

describe("SyncLocationSection", () => {
  it("zeigt einen gespeicherten Ort nur als Punkte, ohne Koordinaten", () => {
    const { container } = render(<SyncLocationSection />);
    const view = within(container);
    expect(container.textContent).not.toContain("Teststadt");
    expect(container.textContent).not.toContain("Koordinaten (gerundet)");
    expect(view.getByLabelText("Stadt (verdeckt)")).toBeTruthy();
    expect(view.getByText("Ändern")).toBeTruthy();
  });

  it("„Ändern“ öffnet das Formular mit dem Ort und den Koordinaten", () => {
    const { container } = render(<SyncLocationSection />);
    fireEvent.click(within(container).getByText("Ändern"));
    const input = container.querySelector('input[placeholder="z. B. Bremen"]') as HTMLInputElement;
    expect(input.value).toBe("Teststadt, Testland");
    expect(container.textContent).toContain("Koordinaten (gerundet)");
  });

  it("ohne gespeicherten Ort gleich das Formular", () => {
    mockLocation = { lat: null, lon: null, locationLabel: null };
    const { container } = render(<SyncLocationSection />);
    expect(container.querySelector('input[placeholder="z. B. Bremen"]')).toBeTruthy();
  });

  it("Streamer-Modus: Ort verdeckt, kein „Ändern“, Hinweis sichtbar", () => {
    const { result } = renderHook(() => useStreamerMode());
    act(() => result.current.setEnabled(true));
    const { container } = render(<SyncLocationSection />);
    const view = within(container);
    expect(container.textContent).not.toContain("Teststadt");
    expect(view.queryByText("Ändern")).toBeNull();
    expect(container.textContent).toContain("Streamer-Modus aktiv");
  });
});

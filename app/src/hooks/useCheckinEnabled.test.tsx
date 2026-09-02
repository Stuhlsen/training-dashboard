/* Tests: useCheckinEnabled() — lokaler Schalter „Morgen-Check-in".
 *
 * Der Hook hält modul-weiten Zustand (wie useActiveAthlete), der beim
 * ersten Import EINMAL aus localStorage gelesen wird. Die Tests laufen
 * daher sequential auf derselben Instanz und setzen den Schalter über die
 * öffentliche API (setEnabled) statt den Modulzustand neu zu initialisieren. */

import { renderHook, act } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useCheckinEnabled } from "./useCheckinEnabled";

afterEach(() => {
  // Schalter für den nächsten Test wieder auf Default (an) bringen — über
  // die API, damit der Modulzustand mitzieht.
  const { result } = renderHook(() => useCheckinEnabled());
  act(() => result.current.setEnabled(true));
});

describe("useCheckinEnabled", () => {
  it("ist standardmäßig an", () => {
    const { result } = renderHook(() => useCheckinEnabled());
    expect(result.current.enabled).toBe(true);
  });

  it("schaltet ab und persistiert als \"0\"", () => {
    const { result } = renderHook(() => useCheckinEnabled());
    act(() => result.current.setEnabled(false));
    expect(result.current.enabled).toBe(false);
    expect(localStorage.getItem("checkin_enabled")).toBe("0");
  });

  it("synchronisiert mehrere Aufrufer sofort", () => {
    const a = renderHook(() => useCheckinEnabled());
    const b = renderHook(() => useCheckinEnabled());
    act(() => a.result.current.setEnabled(false));
    expect(b.result.current.enabled).toBe(false);
    act(() => a.result.current.setEnabled(true));
    expect(b.result.current.enabled).toBe(true);
  });
});

/* Tests: useStreamerMode() — lokaler Schalter „Streamer-Modus".
 *
 * Wie useCheckinEnabled: modul-weiter Zustand, beim ersten Import EINMAL aus
 * localStorage gelesen. Die Tests laufen sequential auf derselben Instanz und
 * setzen den Schalter über die öffentliche API. */

import { renderHook, act } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useStreamerMode } from "./useStreamerMode";

afterEach(() => {
  const { result } = renderHook(() => useStreamerMode());
  act(() => result.current.setEnabled(false));
});

describe("useStreamerMode", () => {
  it("ist standardmäßig aus", () => {
    const { result } = renderHook(() => useStreamerMode());
    expect(result.current.enabled).toBe(false);
  });

  it("schaltet an und persistiert als \"1\"", () => {
    const { result } = renderHook(() => useStreamerMode());
    act(() => result.current.setEnabled(true));
    expect(result.current.enabled).toBe(true);
    expect(localStorage.getItem("streamer_mode")).toBe("1");
  });

  it("synchronisiert mehrere Aufrufer sofort", () => {
    const a = renderHook(() => useStreamerMode());
    const b = renderHook(() => useStreamerMode());
    act(() => a.result.current.setEnabled(true));
    expect(b.result.current.enabled).toBe(true);
    act(() => a.result.current.setEnabled(false));
    expect(b.result.current.enabled).toBe(false);
  });
});

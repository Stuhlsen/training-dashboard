import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWakeLock } from "./useWakeLock";

function stubWakeLock(request: () => Promise<unknown>) {
  Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
}

function makeSentinel() {
  const s = { released: false, release: vi.fn(async () => { s.released = true; }) };
  return s;
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "wakeLock");
});

describe("useWakeLock", () => {
  it("fordert den Lock an und gibt ihn beim Aufräumen frei", async () => {
    const sentinel = makeSentinel();
    const request = vi.fn(async () => sentinel);
    stubWakeLock(request);
    const { unmount } = renderHook(() => useWakeLock(true));
    await waitFor(() => expect(request).toHaveBeenCalledWith("screen"));
    unmount();
    await waitFor(() => expect(sentinel.release).toHaveBeenCalled());
  });

  it("fordert den Lock nach Sichtbarkeitswechsel neu an, wenn der Browser ihn freigab", async () => {
    const first = makeSentinel();
    const second = makeSentinel();
    const request = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    stubWakeLock(request);
    renderHook(() => useWakeLock(true));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    first.released = true;
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  });

  it("bleibt still, wenn der Browser ablehnt oder die API fehlt", async () => {
    const request = vi.fn(async () => { throw new Error("NotAllowedError"); });
    stubWakeLock(request);
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
    await waitFor(() => expect(request).toHaveBeenCalled());
    Reflect.deleteProperty(navigator, "wakeLock");
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
  });

  it("tut nichts, wenn inaktiv", () => {
    const request = vi.fn();
    stubWakeLock(request);
    renderHook(() => useWakeLock(false));
    expect(request).not.toHaveBeenCalled();
  });
});

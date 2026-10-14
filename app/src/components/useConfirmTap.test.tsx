/* Tests: useConfirmTap — Zwei-Tap-Konfirmation (E7b extrahiert) */
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useConfirmTap } from "./useConfirmTap";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useConfirmTap", () => {
  test("erster Tap setzt pending, zweiter Tap ruft onConfirm auf", () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useConfirmTap(onConfirm));

    expect(result.current.pending).toBe(false);

    act(() => {
      result.current.trigger();
    });
    expect(result.current.pending).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();

    act(() => {
      result.current.trigger();
    });
    expect(result.current.pending).toBe(false);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test("nach CONFIRM_MS laeuft pending ab ohne onConfirm", () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useConfirmTap(onConfirm));

    act(() => {
      result.current.trigger();
    });
    expect(result.current.pending).toBe(true);

    act(() => {
      vi.advanceTimersByTime(3100);
    });
    expect(result.current.pending).toBe(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test("trigger nach Ablauf startet neuen Zyklus", () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useConfirmTap(onConfirm));

    act(() => {
      result.current.trigger();
    });
    act(() => {
      vi.advanceTimersByTime(3100);
    });
    expect(result.current.pending).toBe(false);

    act(() => {
      result.current.trigger();
    });
    expect(result.current.pending).toBe(true);

    act(() => {
      result.current.trigger();
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test("cleanup bei Unmount verhindert verzögerte setState", () => {
    const onConfirm = vi.fn();
    const { result, unmount } = renderHook(() => useConfirmTap(onConfirm));

    act(() => {
      result.current.trigger();
    });
    unmount();
    // Darf keinen Fehler werfen
    act(() => {
      vi.advanceTimersByTime(3100);
    });
  });
});
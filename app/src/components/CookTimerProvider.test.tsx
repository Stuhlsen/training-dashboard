/* Tests: CookTimerProvider und RunningTimersBar (E7a)
   Nutzt vi.useFakeTimers + @testing-library/react.
   Web Audio wird gestubbt (AudioContext gemockt).
   Kein echter Timer, kein Warten auf echte Zeit — alles via
   vi.advanceTimersByTime. */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, renderHook, act, screen, fireEvent } from "@testing-library/react";
import { useCookTimers } from "./cook-timer-context";
import { CookTimerProvider } from "./CookTimerProvider";
import { RunningTimersBar } from "./RunningTimersBar";

/* ── AudioContext stub ─────────────────────────────────── */

function stubAudio() {
  return {
    currentTime: 0,
    state: "running",
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
    createOscillator: vi.fn(() => ({
      type: "",
      frequency: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    })),
    createGain: vi.fn(() => ({
      gain: { value: 0 },
      connect: vi.fn(),
    })),
    destination: {},
  };
}

let audioCtx: ReturnType<typeof stubAudio>;
let audioCtxConstructor: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  audioCtx = stubAudio();
  audioCtxConstructor = vi.fn().mockImplementation(function () { return audioCtx; });
  vi.stubGlobal("AudioContext", audioCtxConstructor);
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
  vi.unstubAllGlobals();
  // DOM bereinigen, damit keine Elemente aus vorherigen Tests hängen bleiben
  document.body.innerHTML = "";
});

/* ── Hilfsfunktion: Provider-Wrapper ──────────────────── */

function createWrapper(userId: string | null = "user1") {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <CookTimerProvider userId={userId}>{children}</CookTimerProvider>;
  };
}

/* ── useCookTimers Hook-Tests ──────────────────────────── */

describe("useCookTimers — reine Zustandslogik", () => {
  test("startTimer erzeugt Timer und setTimer startet einen", () => {
    const { result } = renderHook(() => useCookTimers(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.start("a", "Nudeln", 120);
    });

    expect(result.current.timers).toHaveLength(1);
    expect(result.current.timers[0].id).toBe("a");
    expect(result.current.timers[0].label).toBe("Nudeln");
    expect(result.current.timers[0].endAt).toBeGreaterThan(Date.now());
  });

  test("startTimer mit bereits laufender ID ist no-op", () => {
    const { result } = renderHook(() => useCookTimers(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.start("a", "Nudeln", 120);
    });
    act(() => {
      result.current.start("a", "Nochmal Nudeln", 60);
    });

    expect(result.current.timers).toHaveLength(1);
    // Label bleibt wie beim ersten Start
    expect(result.current.timers[0].label).toBe("Nudeln");
  });

  test("zwei Timer parallel, zuruecksetzen eines beeinflusst nicht den anderen", () => {
    const { result } = renderHook(() => useCookTimers(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.start("a", "Timer A", 120);
    });
    act(() => {
      result.current.start("b", "Timer B", 300);
    });

    expect(result.current.timers).toHaveLength(2);

    act(() => {
      result.current.reset("a");
    });

    expect(result.current.timers).toHaveLength(1);
    expect(result.current.timers[0].id).toBe("b");
  });

  test("dismiss entfernt Timer", () => {
    const { result } = renderHook(() => useCookTimers(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.start("a", "Timer A", 120);
    });
    act(() => {
      result.current.dismiss("a");
    });

    expect(result.current.timers).toHaveLength(0);
  });

  test("muted standardmaessig false; setMuted schaltet um", () => {
    const { result } = renderHook(() => useCookTimers(), {
      wrapper: createWrapper(),
    });

    expect(result.current.muted).toBe(false);

    act(() => {
      result.current.setMuted(true);
    });
    expect(result.current.muted).toBe(true);

    act(() => {
      result.current.setMuted(false);
    });
    expect(result.current.muted).toBe(false);
  });

  test("now wird vom Tick-Interval aktualisiert", () => {
    const { result } = renderHook(() => useCookTimers(), {
      wrapper: createWrapper(),
    });

    const before = result.current.now;
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.now).toBeGreaterThanOrEqual(before + 1000);
  });
});

/* ── localStorage-Tests ─────────────────────────────────── */

describe("CookTimerProvider — localStorage", () => {
  test("reset-Timer wird aus localStorage entfernt", () => {
    const { result } = renderHook(() => useCookTimers(), {
      wrapper: createWrapper("user1"),
    });

    act(() => {
      result.current.start("a", "Nudeln", 120);
    });

    // Nach dem Start muss localStorage den Timer haben
    const key = "cook-timers:user1";
    const afterStart = JSON.parse(localStorage.getItem(key) || "[]");
    expect(afterStart).toHaveLength(1);

    act(() => {
      result.current.reset("a");
    });

    // Nach Reset muss localStorage leer sein
    const afterReset = JSON.parse(localStorage.getItem(key) || "[]");
    expect(afterReset).toHaveLength(0);
  });

  test("ueberlebt Remount aus localStorage", () => {
    // Provider 1: Timer starten
    const { unmount, result } = renderHook(() => useCookTimers(), {
      wrapper: createWrapper("user1"),
    });

    act(() => {
      result.current.start("a", "Nudeln", 300);
    });

    const timerBefore = result.current.timers[0];
    unmount();

    // Provider 2: neu mounten — geladene Timer sind erhalten
    const { result: result2 } = renderHook(() => useCookTimers(), {
      wrapper: createWrapper("user1"),
    });

    expect(result2.current.timers).toHaveLength(1);
    expect(result2.current.timers[0].id).toBe("a");
    expect(result2.current.timers[0].endAt).toBe(timerBefore.endAt);
  });

  test("anderer User sieht keine fremden Timer", () => {
    // Timer unter user1 starten
    const { result: r1 } = renderHook(() => useCookTimers(), {
      wrapper: createWrapper("user1"),
    });
    act(() => r1.current.start("a", "User1 Timer", 60));

    // user2 mounten — darf keine Timer von user1 sehen
    const { result: r2 } = renderHook(() => useCookTimers(), {
      wrapper: createWrapper("user2"),
    });

    expect(r2.current.timers).toHaveLength(0);
  });

  test("kein Crash wenn localStorage nicht verfuegbar", () => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => { throw new Error("storage unavailable"); }),
      setItem: vi.fn(() => { throw new Error("storage unavailable"); }),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    });

    const { result } = renderHook(() => useCookTimers(), {
      wrapper: createWrapper("user1"),
    });

    // start darf nicht crashen
    act(() => {
      result.current.start("a", "Nudeln", 60);
    });

    expect(result.current.timers).toHaveLength(1);

    // reset darf nicht crashen
    act(() => {
      result.current.reset("a");
    });
    expect(result.current.timers).toHaveLength(0);

    // Globalen Storage wiederherstellen
    vi.unstubAllGlobals();
  });
});

/* ── Alarm-Tests ──────────────────────────────────────── */

describe("CookTimerProvider — Alarm", () => {
  function renderWithAlarm(userId = "user1") {
    let start!: (id: string, label: string, secs: number) => void;
    let setMuted!: (v: boolean) => void;

    function TestConsumer() {
      const ctx = useCookTimers();
      start = ctx.start;
      setMuted = ctx.setMuted;
      return <RunningTimersBar />;
    }

    const view = render(
      <CookTimerProvider userId={userId}>
        <TestConsumer />
      </CookTimerProvider>,
    );

    return { view, start: () => start, setMuted: (v: boolean) => setMuted(v) };
  }

  test("Alarm ertoent bei Ablauf (sichtbar, nicht stumm)", () => {
    const { start } = renderWithAlarm();
    audioCtx.createOscillator.mockClear();

    act(() => {
      start()("a", "Kurz", 5);
    });

    // Schrittweise: 1s advance → act-flush → re-render
    for (let i = 0; i < 12; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }

    // Bar sollte "abgelaufen" zeigen (Timer-Erkennung funktioniert)
    expect(screen.getByText("abgelaufen")).toBeTruthy();

    expect(audioCtx.createOscillator).toHaveBeenCalled();
  });

  test("stummgeschaltet: kein Sound bei Ablauf", () => {
    const { start, setMuted } = renderWithAlarm();

    act(() => {
      setMuted(true);
    });
    act(() => {
      start()("a", "Kurz", 5);
    });

    audioCtx.createOscillator.mockClear();

    for (let i = 0; i < 12; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }

    expect(audioCtx.createOscillator).not.toHaveBeenCalled();
  });
});

/* ── RunningTimersBar-Tests ───────────────────────────── */

describe("RunningTimersBar", () => {
  /**
   * Renders a provider + bar + a consumer hook that exposes controls.
   * This is the single render approach per test — never mix with renderBar().
   */
  function renderWithControls(userId = "user1") {
    let start!: (id: string, label: string, secs: number) => void;
    let reset!: (id: string) => void;

    function TestConsumer() {
      const ctx = useCookTimers();
      start = ctx.start;
      reset = ctx.reset;
      return <RunningTimersBar />;
    }

    const view = render(
      <CookTimerProvider userId={userId}>
        <TestConsumer />
      </CookTimerProvider>,
    );

    return { view, start: () => start, reset: () => reset };
  }

  test("ohne Timer wird nichts angezeigt", () => {
    const { view } = renderWithControls();
    expect(view.container.textContent).toBe("");
  });

  test("mit laufendem Timer wird die Bar angezeigt", () => {
    const { start } = renderWithControls();
    act(() => {
      start()("a", "Nudeln", 300);
    });

    expect(screen.getByText("Nudeln")).toBeTruthy();
    expect(screen.getByText("Zuruecksetzen")).toBeTruthy();
  });

  test("einmaliger Klick zeigt Konfirmation, kein Reset", () => {
    const { start } = renderWithControls();
    act(() => {
      start()("a", "Nudeln", 300);
    });

    const resetBtn = screen.getAllByText("Zuruecksetzen")[0];
    fireEvent.click(resetBtn);

    expect(screen.getByText("Wirklich zuruecksetzen?")).toBeTruthy();
  });

  test("zweiter Klick innerhalb 3s setzt zurueck", () => {
    const { start } = renderWithControls();
    act(() => {
      start()("a", "Nudeln", 300);
    });

    fireEvent.click(screen.getAllByText("Zuruecksetzen")[0]);
    expect(screen.getByText("Wirklich zuruecksetzen?")).toBeTruthy();

    fireEvent.click(screen.getByText("Wirklich zuruecksetzen?"));

    expect(screen.queryByText("Nudeln")).toBeNull();
  });

  test("Konfirmation laeuft nach 3s ab ohne zurueckzusetzen", () => {
    const { start } = renderWithControls();
    act(() => {
      start()("a", "Nudeln", 300);
    });

    fireEvent.click(screen.getAllByText("Zuruecksetzen")[0]);
    expect(screen.getByText("Wirklich zuruecksetzen?")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(3100);
    });

    expect(screen.getByText("Nudeln")).toBeTruthy();
    expect(screen.getAllByText("Zuruecksetzen").length).toBeGreaterThanOrEqual(1);
  });

  test("einmaliger versehentlicher Klick laesst Timer laufen", () => {
    const { start } = renderWithControls();
    act(() => {
      start()("a", "Nudeln", 300);
    });

    fireEvent.click(screen.getAllByText("Zuruecksetzen")[0]);
    expect(screen.getByText("Wirklich zuruecksetzen?")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(3100);
    });

    expect(screen.getByText("Nudeln")).toBeTruthy();
  });

  test("abgelaufener Timer zeigt 'abgelaufen' und Schliessen-Button", () => {
    const { start } = renderWithControls();
    act(() => {
      start()("a", "Kurz", 5);
    });

    act(() => {
      vi.advanceTimersByTime(7000);
    });

    expect(screen.getByText("abgelaufen")).toBeTruthy();
    expect(screen.getByText("Schliessen")).toBeTruthy();
  });

  test("dismiss bei abgelaufenem Timer entfernt ihn", () => {
    const { start } = renderWithControls();
    act(() => {
      start()("a", "Kurz", 5);
    });

    act(() => {
      vi.advanceTimersByTime(7000);
    });

    fireEvent.click(screen.getByText("Schliessen"));

    expect(screen.queryByText("Kurz")).toBeNull();
  });

  test("Mute-Button umschaltbar", () => {
    const { start } = renderWithControls();
    act(() => {
      start()("a", "Nudeln", 300);
    });

    const muteBtn = screen.getByLabelText("Stummschalten");
    expect(muteBtn).toBeTruthy();

    fireEvent.click(muteBtn);
    expect(screen.getByLabelText("Stummschaltung aufheben")).toBeTruthy();
  });
});

/* ── User-Wechsel-Tests ───────────────────────────────── */

describe("CookTimerProvider — User-Wechsel", () => {
  test("Remount bei User-Wechsel zeigt keine fremden Timer", () => {
    // user1 startet einen Timer
    const { result: r1, unmount } = renderHook(() => useCookTimers(), {
      wrapper: createWrapper("user1"),
    });
    act(() => r1.current.start("a", "User1 Timer", 120));
    expect(r1.current.timers).toHaveLength(1);
    unmount(); // user1 abgemeldet = Provider unmount

    // user2 mountet — neuer Provider
    const { result: r2 } = renderHook(() => useCookTimers(), {
      wrapper: createWrapper("user2"),
    });
    expect(r2.current.timers).toHaveLength(0);
  });
});

/* ─── Test: bereits abgelaufene Timer beim Laden ──────── */

describe("CookTimerProvider — abgelaufene Timer beim Laden", () => {
  test("bereits abgelaufener Timer loest keinen Alarm aus", () => {
    const expiredEndAt = Date.now() - 5000; // vor 5s abgelaufen
    localStorage.setItem("cook-timers:user1", JSON.stringify([
      { id: "old", label: "Alter Timer", durationSeconds: 60, endAt: expiredEndAt },
    ]));

    // renderWithControls rendert den Provider + Bar + Consumer
    // (Die Alarm-Prüfung läuft im Provider-Effect)

    let start!: (id: string, label: string, secs: number) => void;

    function TestConsumer() {
      const ctx = useCookTimers();
      start = ctx.start;
      return null;
    }

    render(
      <CookTimerProvider userId="user1">
        <TestConsumer />
      </CookTimerProvider>,
    );

    // Kein createOscillator-Aufruf (kein Sound für bereits abgelaufene Timer)
    expect(audioCtx.createOscillator).not.toHaveBeenCalled();

    // Ein neuer Timer starten und ablaufen lassen — Alarm MUSS ertönen
    audioCtx.createOscillator.mockClear();
    act(() => {
      start("b", "Frisch", 5);
    });

    for (let i = 0; i < 12; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }

    // Frischer Timer löst Alarm aus (der alte bleibt stumm)
    expect(audioCtx.createOscillator).toHaveBeenCalledTimes(3);
  });
});

/* ─── Test: nur einmaliger Alarm ──────────────────────── */

describe("CookTimerProvider — einmaliger Alarm", () => {
  test("alarm nur einmal bei einem Timer", () => {
    let start!: (id: string, label: string, secs: number) => void;

    function TestConsumer() {
      const ctx = useCookTimers();
      start = ctx.start;
      return null;
    }

    render(
      <CookTimerProvider userId="user1">
        <TestConsumer />
      </CookTimerProvider>,
    );

    act(() => {
      start("a", "Kurz", 5);
    });

    audioCtx.createOscillator.mockClear();

    // Timer läuft ab
    for (let i = 0; i < 12; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }

    expect(audioCtx.createOscillator).toHaveBeenCalledTimes(3); // 3 Beeps

    audioCtx.createOscillator.mockClear();

    // Weiteren Tick abwarten — kein weiterer Alarm
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(audioCtx.createOscillator).not.toHaveBeenCalled();
  });
});
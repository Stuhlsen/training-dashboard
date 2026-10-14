/* ============================================================
   COMPONENTS/COOKTIMERPROVIDER.TSX — Timer-Provider (E7a)
   Lazy-initialisierter State aus localStorage (kein useEffect +
   setState, der das Projekt zweimal biss). Persistiert per
   logged-in user in localStorage.
   Kein roher console.*-Aufruf (Schichtenregel).
   ============================================================ */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { CookTimer } from "../types.js";
import {
  startTimer as coreStartTimer,
  newlyExpired,
  serializeTimers,
  restoreTimers,
} from "../core/cook-timer.js";

/* ── localStorage keys ─────────────────────────────────── */

const KEY_PREFIX = "cook-timers:";
const MUTED_KEY = "cook-timers-muted";

function storageKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

/* ── Timer-Persistence (lokal) ─────────────────────────── */

function loadTimers(userId: string | null): CookTimer[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    return restoreTimers(raw, Date.now());
  } catch {
    return [];
  }
}

function saveTimers(userId: string | null, timers: CookTimer[]): void {
  if (!userId) return;
  try {
    localStorage.setItem(storageKey(userId), serializeTimers(timers));
  } catch {
    // localStorage nicht verfügbar — nichts bricht
  }
}

/* ── Mute-Persistence ──────────────────────────────────── */

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === "true";
  } catch {
    return false;
  }
}

function saveMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTED_KEY, String(muted));
  } catch {
    // localStorage nicht verfügbar
  }
}

/* ── Alarm (Web Audio) ─────────────────────────────────── */

function playAlarm(): void {
  try {
    const ctx = new AudioContext();
    const t = ctx.currentTime;

    // Drei kurze Sinus-Beeps (Eigenes Ermessen, Issue #27)
    // Frequenz 880 Hz (A5), 150 ms Länge, 250 ms Abstand
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.3;
      const start = t + i * 0.25;
      const end = start + 0.15;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(end);
    }

    setTimeout(() => ctx.close(), 2000);
  } catch {
    // Web Audio nicht verfügbar — kein Sound, kein Fehler
  }
}

/* ── Context type ──────────────────────────────────────── */

export interface CookTimerContextValue {
  timers: CookTimer[];
  start: (id: string, label: string, durationSeconds: number) => void;
  reset: (id: string) => void;
  dismiss: (id: string) => void;
  muted: boolean;
  setMuted: (v: boolean) => void;
  now: number;
}

export const CookTimerContext = createContext<CookTimerContextValue | null>(null);

/* ── Provider ──────────────────────────────────────────── */

interface ProviderProps {
  userId: string | null;
  children: ReactNode;
}

export function CookTimerProvider({ userId, children }: ProviderProps) {
  /* Timer-Liste: lazy initial aus localStorage (kein Effect) */
  const [timers, setTimers] = useState<CookTimer[]>(() => loadTimers(userId));

  /* Mute: lazy initial */
  const [muted, setMutedState] = useState<boolean>(() => loadMuted());

  /* Refs für Dinge, die keine Re-Renders auslösen sollen */
  const alreadyAlertedRef = useRef(new Set<string>());
  const pageVisibleRef = useRef(true);

  /* Aktuelle Systemzeit (wird vom Tick-Interval aktualisiert) zur
   * Verwendung in RunningTimersBar (kein Date.now() während des Render,
   * Lint-Regel react-hooks/purity). */
  const [now, setNow] = useState<number>(() => Date.now());

  /* Persistenz: immer wenn sich timers oder userId ändern */
  useEffect(() => {
    saveTimers(userId, timers);
  }, [userId, timers]);

  /* Mute persistieren */
  useEffect(() => {
    saveMuted(muted);
  }, [muted]);

  /* Tick-Interval (1s): triggert Re-Render für Timer-Anzeige */
  useEffect(() => {
    const id = setInterval(() => {
      const tick = Date.now();
      setNow(tick);
      setTimers((prev) => [...prev]);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  /* visibilitychange: beim Zurückkommen neu berechnen */
  useEffect(() => {
    const handler = () => {
      pageVisibleRef.current = !document.hidden;
      if (!document.hidden) {
        // Re-Render, damit Anzeige aktuelle Restzeit zeigt
        setTimers((prev) => [...prev]);
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  /* Alarm-Check: nach jedem Render prüfen, ob ein Timer gerade abgelaufen ist */
  useEffect(() => {
    if (muted) return;
    if (!pageVisibleRef.current) return;

    const now = Date.now();
    const expiredIds = newlyExpired(timers, now, alreadyAlertedRef.current);

    if (expiredIds.length > 0) {
      for (const id of expiredIds) {
        alreadyAlertedRef.current.add(id);
      }
      playAlarm();
    }
  });

  /* Timer-Aktionen */

  const start = useCallback(
    (id: string, label: string, durationSeconds: number) => {
      setTimers((prev) => {
        // Bereits laufend mit dieser ID → no-op
        if (prev.some((t) => t.id === id && t.endAt != null)) return prev;

        const newTimer = coreStartTimer({
          id,
          label,
          durationSeconds,
          now: Date.now(),
        });
        return [...prev, newTimer];
      });
    },
    [],
  );

  const reset = useCallback(
    (id: string) => {
      // Timer vollständig entfernen (kein endAt-loses Objekt behalten):
      // Issue sagt "a reset timer disappears from the bar and from localStorage".
      setTimers((prev) => prev.filter((t) => t.id !== id));
      alreadyAlertedRef.current.delete(id);
    },
    [],
  );

  const dismiss = useCallback(
    (id: string) => {
      setTimers((prev) => prev.filter((t) => t.id !== id));
      alreadyAlertedRef.current.delete(id);
    },
    [],
  );

  const setMuted = useCallback((v: boolean) => {
    setMutedState(v);
  }, []);

  /* Context-Wert stabil halten */

  const ctxValue = useMemo<CookTimerContextValue>(
    () => ({ timers, start, reset, dismiss, muted, setMuted, now }),
    [timers, start, reset, dismiss, muted, setMuted, now],
  );

  return (
    <CookTimerContext.Provider value={ctxValue}>
      {children}
    </CookTimerContext.Provider>
  );
}

/* ── Hook ──────────────────────────────────────────────── */

export function useCookTimers(): CookTimerContextValue {
  const ctx = useContext(CookTimerContext);
  if (!ctx) {
    throw new Error("useCookTimers() must be used within a <CookTimerProvider>");
  }
  return ctx;
}
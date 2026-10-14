/* ============================================================
   COMPONENTS/COOKTIMERPROVIDER.TSX — Timer-Provider (E7a)
   Lazy-initialisierter State aus localStorage (kein useEffect +
   setState, der das Projekt zweimal biss). Persistiert per
   logged-in user in localStorage.
   Kein roher console.*-Aufruf (Schichtenregel).

   Bekannte Einschränkung (Issue #27, Edge Cases):
   Zwei Browser-Tabs mit derselben App-URL werden NICHT
   synchronisiert — jeder Tab hat seinen eigenen Timer-Zustand.
   ============================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { CookTimer } from "../types.js";
import {
  startTimer as coreStartTimer,
  newlyExpired,
  serializeTimers,
  restoreTimers,
} from "../core/cook-timer.js";
import { CookTimerContext, type CookTimerContextValue } from "./cook-timer-context";

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


function playAlarm(audioCtx: AudioContext | null): void {
  if (!audioCtx) return;
  try {
    const t = audioCtx.currentTime;

    // Drei kurze Sinus-Beeps (Eigenes Ermessen, Issue #27)
    // Frequenz 880 Hz (A5), 150 ms Länge, 250 ms Abstand
    for (let i = 0; i < 3; i++) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.3;
      const start = t + i * 0.25;
      const end = start + 0.15;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(start);
      osc.stop(end);
    }
  } catch {
    // Web Audio nicht verfügbar — kein Sound, kein Fehler
  }
}

/* ── Provider ──────────────────────────────────────────── */

interface ProviderProps {
  userId: string | null;
  children: ReactNode;
}

export function CookTimerProvider({ userId, children }: ProviderProps) {
  /* Refs für Dinge, die keine Re-Renders auslösen sollen */
  const alreadyAlertedRef = useRef(new Set<string>());
  const pageVisibleRef = useRef(true);
  const lastSavedRef = useRef("");
  const audioCtxRef = useRef<AudioContext | null>(null);

  /* Timer-Liste: lazy initial aus localStorage (kein Effect).
   * Die alreadyAlertedRef-Pre-Seed (kein Sound für bereits abgelaufene
   * Timer) erfolgt im useEffect unten, nicht im useState-Initializer
   * (react-hooks/refs-Regel). */
  const [timers, setTimers] = useState<CookTimer[]>(() => loadTimers(userId));

  /* Pre-seed alreadyAlertedRef: Timer, die beim Laden bereits
   * abgelaufen sind, sollen keinen Alarm auslösen — der Sound
   * wurde bereits beim ursprünglichen Ablauf gespielt oder
   * wäre bei Reload/hidden ohnehin nicht zu hören gewesen. */
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    const now = Date.now();
    for (const t of timers) {
      if (t.endAt != null && t.endAt <= now) {
        alreadyAlertedRef.current.add(t.id);
      }
    }
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps */

  /* Mute: lazy initial */
  const [muted, setMutedState] = useState<boolean>(() => loadMuted());

  /* Aktuelle Systemzeit (wird vom Tick-Interval aktualisiert) zur
   * Verwendung in RunningTimersBar (kein Date.now() während des Render,
   * Lint-Regel react-hooks/purity). */
  const [now, setNow] = useState<number>(() => Date.now());

  /* Persistenz: schreibt nur bei tatsächlichen Änderungen,
   * nicht bei jedem 1s-Tick (der setTimers nur zum Re-Render zwingt). */
  useEffect(() => {
    const serialized = serializeTimers(timers);
    if (serialized !== lastSavedRef.current) {
      lastSavedRef.current = serialized;
      saveTimers(userId, timers);
    }
  }, [userId, timers]);

  /* Mute persistieren */
  useEffect(() => {
    saveMuted(muted);
  }, [muted]);

  /* Tick-Interval (1s): triggert Re-Render für Timer-Anzeige,
   * aktualisiert `now` (schreibt NICHT localStorage). */
  useEffect(() => {
    const id = setInterval(() => {
      const tick = Date.now();
      setNow(tick);
      // Kopie erzeugen, damit abhängige Komponenten neu rendern
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

  /* Alarm-Check: nach jedem Render prüfen, ob ein Timer gerade abgelaufen ist.
   * Neu abgelaufene IDs werden IMMER zum Set hinzugefügt (damit sie beim
   * nächsten Durchlauf nicht erneut auslösen), aber der Sound wird nur
   * abgespielt, wenn die Seite sichtbar und nicht stummgeschaltet ist. */
  useEffect(() => {
    const currentNow = Date.now();
    const expiredIds = newlyExpired(timers, currentNow, alreadyAlertedRef.current);

    if (expiredIds.length > 0) {
      for (const id of expiredIds) {
        alreadyAlertedRef.current.add(id);
      }

      // Sound nur, wenn Seite sichtbar UND nicht stummgeschaltet
      if (!muted && pageVisibleRef.current) {
        playAlarm(audioCtxRef.current);
      }
    }
  });

  /* Timer-Aktionen */

  const start = useCallback(
    (id: string, label: string, durationSeconds: number) => {
      // AudioContext in der User-Geste initialisieren/aufwecken.
      // Ein geschlossener Context (state === "closed", z. B. nach
      // vorherigem close()) wird als nicht vorhanden behandelt.
      if (audioCtxRef.current == null || audioCtxRef.current.state === "closed") {
        try {
          audioCtxRef.current = new AudioContext();
        } catch {
          // Web Audio nicht verfügbar
        }
      }
      if (audioCtxRef.current?.state === "suspended") {
        audioCtxRef.current.resume().catch(() => {});
      }

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
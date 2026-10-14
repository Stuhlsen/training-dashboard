/* ============================================================
   HOOKS/USEWAKELOCK.TS — Bildschirm wach halten (Kochmodus, E7b)
   Screen Wake Lock API (nur HTTPS, Baseline seit 2024-05). Der
   Browser gibt den Lock frei, sobald die Seite verdeckt wird —
   deshalb beim Zurückkommen neu anfordern. Verweigerung oder
   fehlende API ist kein Fehler: der Kochmodus läuft ohne weiter.
   ============================================================ */

import { useEffect } from "react";

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void lock.release().catch(() => {});
          return;
        }
        sentinel = lock;
      } catch {
        // Vom Browser abgelehnt (z. B. Energiesparmodus) — ohne Lock weiter
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible" && (!sentinel || sentinel.released)) {
        void acquire();
      }
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => {});
    };
  }, [active]);
}

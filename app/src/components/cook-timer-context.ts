/* ============================================================
   COMPONENTS/COOK-TIMER-CONTEXT.TS — Timer-Context-Definition (E7a)
   Ausgelagert aus CookTimerProvider.tsx, damit die
   react-refresh/only-export-components-Lint-Warnung entfällt.
   ============================================================ */

import { createContext, useContext } from "react";
import type { CookTimer } from "../types.js";

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

export function useCookTimers(): CookTimerContextValue {
  const ctx = useContext(CookTimerContext);
  if (!ctx) {
    throw new Error("useCookTimers() must be used within a <CookTimerProvider>");
  }
  return ctx;
}
import type { HeroBriefing } from "./hero-view-model";

/** Auch von HeroPage genutzt (Status-Punkt neben dem Workout-Namen). */
export const LEVEL_COLOR: Record<HeroBriefing["level"], string> = {
  green: "var(--ok)",
  yellow: "var(--warn)",
  red: "var(--danger)",
};
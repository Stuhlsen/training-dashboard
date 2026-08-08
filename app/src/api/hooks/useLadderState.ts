/* ============================================================
   API/HOOKS/USELADDERSTATE.TS — Leiterzustand des eingeloggten Athleten
   (Etappe 7c, Progressionssteuerung D2/D4b — docs/konzept-progressions-
   steuerung.md)

   Port von state/ladder.js + state/formats.js (Vanilla). getLadderState()
   ist die Zusammenstellung für die Export-Panel-Zeile und das
   Briefing-Gedächtnis (core/export-briefing.js::buildMemorySection): NUR
   aktive Formate × aktuelle Stufe × die zwei Nachbarstufen — nie der volle
   Katalog. useLadderPresetSuggestion() ist die Stelle, die
   profiles.ladder_progression_enabled VOR core/ladder-progression.js::
   presetAction() prüft — ohne Freigabe bleibt es beim reinen
   Beobachtungsmodus (kein Stufenvorschlag). Schreibt selbst nichts.
   ============================================================ */

import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSessionFormats, type SessionFormat } from "../supabase/session-formats";
import { getAthleteFormats } from "../supabase/athlete-formats";
import { getLadderHistory, type LadderHistoryEntry } from "../supabase/ladder";
import { getProfile } from "../supabase/profiles";
import { useAuthUserId } from "./useSession";
import { qk } from "../keys";
import { unwrap, catchResult } from "../result";
import { localISODate } from "../../core/format.js";
import {
  currentLadderStep,
  stepAt,
  neighborSteps,
  formatSummary,
  activeLockUntil,
} from "../../core/ladder.js";
import { presetAction } from "../../core/ladder-progression.js";
import type { Result } from "../types";

export interface LadderStateFormat {
  formatId: string;
  label: string;
  evidenceGrade: string;
  step: number;
  stepData: unknown;
  summary: string;
  neighbors: { prev: unknown; next: unknown };
}

async function loadLadderState(userId: string): Promise<LadderStateFormat[]> {
  const [catalogResult, athleteFormatsResult, historyResult] = await Promise.all([
    getSessionFormats(),
    getAthleteFormats(userId),
    getLadderHistory(userId),
  ]);
  const { formats: catalogFormats } = unwrap(catalogResult);
  const { athleteFormats } = unwrap(athleteFormatsResult);
  const { history } = unwrap(historyResult);

  const catalogById = new Map<string, SessionFormat>(catalogFormats.map((f) => [f.id, f]));
  const activeFormatIds = athleteFormats.filter((af) => af.active).map((af) => af.formatId);
  const today = localISODate();

  return activeFormatIds
    .map((formatId): LadderStateFormat | null => {
      const format = catalogById.get(formatId);
      if (!format) return null;
      const current = currentLadderStep(history, formatId, today);
      const step = current?.step ?? 1;
      const stepData = stepAt(format, step);
      return {
        formatId,
        label: format.label,
        evidenceGrade: format.evidenceGrade,
        step,
        stepData,
        summary: formatSummary(format, stepData, step),
        neighbors: neighborSteps(format, step),
      };
    })
    .filter((f): f is LadderStateFormat => f !== null);
}

/** Leiterzustand (aktive Formate) des eingeloggten Profils. */
export function useLadderState() {
  const userId = useAuthUserId();
  const query = useQuery({
    queryKey: qk.ladderState(userId ?? "anonymous"),
    enabled: !!userId,
    queryFn: () => loadLadderState(userId!),
  });
  return { formats: query.data ?? [], isLoading: query.isLoading };
}

export type ExportPreset = "general" | "event" | "check" | "reduce" | "build";

interface PresetSuggestionCtx {
  rating?: "green" | "yellow" | "red" | null;
  rpe?: number | null;
  isTestEvent?: boolean;
  inTaper?: boolean;
}

interface PresetSuggestionData {
  enabled: boolean;
  suggestion: {
    step: number;
    action: string;
    lockWeeks?: number;
    lockedUntil?: string;
  } | null;
}

/** D4b: Preset-Stufenvorschlag für ein Format — reiner Auswertungsschritt
 *  ohne Cache (wird bei jeder Export-Neu-Generierung frisch abgefragt, wie
 *  Vanillas ui/export-panel.js). */
export function useLadderPresetSuggestion() {
  const userId = useAuthUserId();

  return useCallback(
    async (
      preset: ExportPreset,
      formatId: string,
      ctx: PresetSuggestionCtx = {},
    ): Promise<Result<PresetSuggestionData>> => {
      if (!userId) return { ok: true, enabled: false, suggestion: null };

      return catchResult(async () => {
        const profile = unwrap(await getProfile(userId));
        if (!profile.profile.ladderProgressionEnabled) {
          return { enabled: false, suggestion: null };
        }

        const history = unwrap(await getLadderHistory(userId)).history as LadderHistoryEntry[];
        const today = localISODate();
        const current = currentLadderStep(history, formatId, today);
        const currentStep = current?.step ?? 1;
        const lockedUntil = activeLockUntil(history, formatId, today);
        const base = presetAction(preset, { currentStep, ...ctx, locked: !!lockedUntil });
        const suggestion = lockedUntil ? { ...base, lockedUntil } : base;
        return { enabled: true, suggestion };
      });
    },
    [userId],
  );
}

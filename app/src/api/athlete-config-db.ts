/* ============================================================
   API/ATHLETE-CONFIG-DB.TS — Stammdaten eines Eintrags ohne Platz in
   config.ts (Fahrplan 26, E3)

   Ein Account ohne festen Platz hat keinen `athletes[]`-Eintrag. Seine
   Stammdaten setzt `buildDbAthleteConfig()` aus drei Quellen zusammen
   (gegrillt 2026-10-21):
   1. `athlete_profile_extras` — gilt zuerst. Heute schreibt noch niemand die
      Tabelle (E4: Einstellungen), die Zeile fehlt also meist.
   2. `training_profile_data.meta` — vom Sync gefüllt (ftp, ftpGoal,
      dataSources, hrMax, hrRest); füllt, was Extras offen lässt.
   3. `profiles` — Anzeigename und Sportarten.
   Was keine Quelle liefert, bleibt `null` (die FTP-Widgets blenden sich dann
   aus, wie bei Athlet 4).
   ============================================================ */

import type { AthleteConfig } from "../config";
import { SELF_FALLBACK_NAME } from "../core/athlete-selection.js";
import type { AthleteProfileExtras } from "./supabase/athlete-profile-extras";
import type { Profile } from "./types";

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

export interface DbAthleteConfigInput {
  profile: Pick<Profile, "displayName" | "sports"> | null;
  extras: AthleteProfileExtras | null;
  meta: Record<string, unknown> | null;
}

export function buildDbAthleteConfig(id: string, input: DbAthleteConfigInput): AthleteConfig {
  const { profile, extras, meta } = input;
  const m = meta ?? {};
  const extraSources = extras?.dataSources ?? [];
  return {
    id,
    name: profile?.displayName?.trim() || SELF_FALLBACK_NAME,
    // Keine Datei: die Daten kommen aus den Tabellen (training-payload.ts).
    endpoint: "",
    ftpMeasured: extras?.ftpMeasured ?? num(m.ftp),
    ftpMeasuredDate: extras?.ftpMeasuredDate ?? null,
    eFTP: extras?.eFTP ?? null,
    ftpGoal: extras?.ftpGoal ?? num(m.ftpGoal),
    seasonStartFtp: extras?.seasonStartFtp ?? null,
    hrMax: num(m.hrMax),
    hrRest: num(m.hrRest),
    sports: profile?.sports ?? ["ride"],
    dataSources: extraSources.length > 0 ? extraSources : strings(m.dataSources),
    ...(extras?.bmr ? { bmr: extras.bmr } : {}),
    ...(extras?.generatedPlan ? { generatedPlan: true } : {}),
  };
}

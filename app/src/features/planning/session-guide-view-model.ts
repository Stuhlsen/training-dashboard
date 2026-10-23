/* ============================================================
   FEATURES/PLANNING/SESSION-GUIDE-VIEW-MODEL.TS — Trainings-Guide für die
   Planungskarte (Fahrplan 34, E3). Reine Aufbereitung: ruft
   core/session-guide.js auf und macht daraus Zielzeile, Abschnitte und
   Quellen-Items. Kein Guide (unbekannter Typ, Rekom) → null,
   dann rendert die UI nichts.
   ============================================================ */

import { buildSessionGuide, rpeCompareText, sessionGuideText } from "../../core/session-guide.js";
import { GUIDE_SOURCE_BY_KEY } from "../../core/session-guide-sources.js";
import { ZONE_SOURCE_STATUS } from "../../core/zone-sources.js";
import { resolveWeight, type NutritionWellnessDay } from "../nutrition/nutrition-day-model";
import type { PlanCard } from "../../api/types";
import type { SourceListItem } from "../nutrition/SourceList";

export interface SessionGuideContext {
  cadenceTarget: number | null;
  /** Nur gesetzt, wo der Ernährungs-Tab das Gewicht auch zeigt (eigene Ansicht). */
  weightKg: number | null;
  ftp: number | null;
  /** RPE der schon zugeordneten Fahrt (vergangene Karte), sonst weglassen. */
  actualRpe?: number | null;
}

export interface SessionGuideSectionView {
  id: string;
  title: string;
  text: string;
  hint: string | null;
}

export interface SessionGuideView {
  /** Zielzeile, immer sichtbar. */
  goal: string;
  /** z. B. "RPE 6–7". */
  rpeLabel: string;
  /** „Ziel 6–7 · gefahren 8" — nur mit gültigem Ist-RPE, sonst null. Kein Urteil. */
  rpeCompare: string | null;
  /** Eingeklappter Teil in fester Reihenfolge, ohne Ziel. */
  sections: SessionGuideSectionView[];
  sources: SourceListItem[];
}

const STATUS_TEXT: Readonly<Record<string, string>> = {
  [ZONE_SOURCE_STATUS.PRIMAER]: "Originalquelle gelesen",
  [ZONE_SOURCE_STATUS.SEKUNDAER]: "nur Zusammenfassung gelesen",
  [ZONE_SOURCE_STATUS.UNBELEGT]: "übernommene Wahl, nicht belegt",
};

function sourceItems(keys: readonly string[]): SourceListItem[] {
  const seen = new Set<string>();
  const items: SourceListItem[] = [];
  for (const key of keys) {
    const s = GUIDE_SOURCE_BY_KEY.get(key);
    if (!s || seen.has(key)) continue;
    seen.add(key);
    items.push({ key, title: s.title, link: s.link, url: s.url, status: STATUS_TEXT[s.status] });
  }
  return items;
}

/** Mit Hinweis dahinter muss der Satz enden (Fueling-Texte tragen keinen Punkt). */
const endSentence = (text: string, hint: string | null) =>
  hint && !/[.!?]$/.test(text) ? `${text}.` : text;

export function buildSessionGuideView(
  card: PlanCard,
  ctx: SessionGuideContext
): SessionGuideView | null {
  const guide = buildSessionGuide(card, ctx);
  if (!guide) return null;
  const { min, max } = guide.rpe;
  const rpeLabel = min === max ? `RPE ${min}` : `RPE ${min}–${max}`;
  const goal = guide.sections.find((s) => s.id === "ziel")?.text ?? "";
  const sections = guide.sections
    .filter((s) => s.id !== "ziel")
    .map((s) => {
      const hint = s.hint ?? null;
      return {
        id: s.id,
        title: s.id === "rpe" ? rpeLabel : s.title,
        text: endSentence(s.text, hint),
        hint,
      };
    });
  return {
    goal,
    rpeLabel,
    rpeCompare: rpeCompareText(guide.rpe, ctx.actualRpe),
    sections,
    sources: sourceItems(guide.sections.flatMap((s) => s.quelleKeys)),
  };
}

/** Gewicht für „Essen vorher": dieselbe Quelle wie der Ernährungs-Tab
 *  (Wellness ≤ 7 Tage, sonst Profil) und — wie dort — nur in der eigenen
 *  Ansicht. Trainer/Fremdblick bekommen die persönliche Gramm-Zahl nie. */
export function guideWeightKg(params: {
  isSelf: boolean;
  wellness: readonly NutritionWellnessDay[];
  profileWeightKg: number | null;
  todayISO: string;
}): number | null {
  if (!params.isSelf) return null;
  return resolveWeight(params.wellness, params.profileWeightKg, params.todayISO)?.weightKg ?? null;
}

/** Klartext-Guide für .zwo und intervals.icu-Push (Fahrplan 34, E5). Wird an
 *  der Aufrufstelle gebaut und als fertiger String durchgereicht, damit
 *  core/zwo-export.js rein bleibt und api/ nichts über den Guide weiß.
 *  Ohne Gewicht (kein Gramm-Wert im Export); abgesagte Karten und Karten ohne
 *  Guide ergeben "" — Export/Push bleiben dann unverändert. */
export function sessionGuideExportText(card: PlanCard, cadenceTarget: number | null): string {
  if (card.cancelled) return "";
  return sessionGuideText(buildSessionGuide(card, { cadenceTarget, weightKg: null }));
}

/* ============================================================
   FEATURES/PLANNING/TRAINER-GOALS-VIEW-MODEL.TS — Ziele in der Trainer-Ansicht
   (Fahrplan 43 E7, Z6 + Z8)

   Reine Logik ohne React/I/O. Der Trainer sieht Haupt- und Nebenziel mit Datum
   und den Ziel-Check, nur lesend. Gerechnet wird ausschließlich mit den
   Funktionen aus settings/goals-view-model.ts (groupGoals, describeGoal,
   pickCheckGoal, buildFtpCheck) — hier wird nichts nachgebaut.

   Z6: Der Trainer bekommt keine Gewichtswerte, auch nicht indirekt. Das gilt
   schon für die Eingabe: diese Funktion nimmt nur Ziele, die aktuelle FTP und
   die eFTP-Historie entgegen. Ernährungsdaten und Körperwerte kennt sie nicht
   und die Ausgabe hat nur feste Felder. Ein Ziel mit Gewichtsbezug zeigt über
   describeGoal() nie einen Zielwert.
   ============================================================ */

import type { Goal } from "../../api/types";
import {
  buildFtpCheck,
  describeGoal,
  groupGoals,
  pickCheckGoal,
  type FtpCheckView,
} from "../settings/goals-view-model";

export const TRAINER_GOALS_EMPTY_TEXT = "Dieser Athlet hat noch kein Haupt- oder Nebenziel gesetzt.";

export interface TrainerGoalCard {
  id: string;
  roleLabel: "Hauptziel" | "Nebenziel";
  title: string;
  /** Zieldatum (TT.MM.JJJJ) oder leer */
  dateText: string;
  /** Zielwert, z. B. „232 W“, sonst leer */
  valueText: string;
  /** Ziel-Check, nur beim geprüften FTP-Ziel */
  check: FtpCheckView | null;
}

export interface TrainerGoalsView {
  cards: TrainerGoalCard[];
  /** Ruhiger Text, wenn es weder Haupt- noch Nebenziel gibt, sonst null */
  emptyText: string | null;
}

export function buildTrainerGoalsView(input: {
  goals: readonly Goal[];
  current: number | null;
  history: Array<{ date: string; eftp: number }>;
  todayISO: string;
}): TrainerGoalsView {
  const { goals, current, history, todayISO } = input;
  const groups = groupGoals(goals);
  const checkGoal = pickCheckGoal(groups);

  const cards = [groups.main, groups.side]
    .filter((g): g is Goal => g != null)
    .map((g): TrainerGoalCard => {
      const d = describeGoal(g);
      return {
        id: g.id,
        roleLabel: g.role === "main" ? "Hauptziel" : "Nebenziel",
        title: d.title,
        dateText: d.dateText,
        valueText: d.valueText,
        check:
          checkGoal?.id === g.id ? buildFtpCheck({ goal: g, current, history, todayISO }) : null,
      };
    });

  return { cards, emptyText: cards.length === 0 ? TRAINER_GOALS_EMPTY_TEXT : null };
}

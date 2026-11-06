/* ============================================================
   FEATURES/SETTINGS/GOALSSECTION.TSX — Ziele (athletengated), Fahrplan 43 E4

   Ein Hauptziel und höchstens ein Nebenziel aus dem Katalog (core/goals.js),
   Datum optional, Zielwert nur wo der Katalog ihn vorsieht. Für das FTP-Ziel
   zeigt der Ziel-Check Trend, nötiges Tempo und Prognose aus der eigenen
   eFTP-Historie. Die Komponente rendert nur — Regeln, Validierung und Texte
   stehen in goals-view-model.ts (mit Tests).

   Schreiben darf nur der Athlet selbst (Z8): wer nicht schreiben darf, sieht
   keine Formulare. Die lesende Trainer-Ansicht steht in der Trainer-Leiste
   (features/planning/TrainerGoals.tsx).
   ============================================================ */

import { useMemo, useState } from "react";
import { useGoals, useReplaceGoal, useDeactivateGoal } from "../../api/hooks/useGoals";
import { useActiveNutritionGoal, useAddNutritionGoal } from "../../api/hooks/useNutritionGoals";
import { useProfileBasics } from "../../api/hooks/useProfile";
import { useSessionProfile } from "../../api/hooks/useSession";
import { useActiveAthlete } from "../../api/hooks/useActiveAthlete";
import { useAthleteSports } from "../../api/hooks/useAthleteSports";
import { useAthleteConfig } from "../../api/hooks/useAthleteConfig";
import { useRides } from "../../api/hooks/useRides";
import { useIsSelfAthlete } from "../../api/hooks/useWriteAuthorization";
import { useFtpHistoryEntries } from "../planning/useFtpHistoryEntries";
import { resolveMeasuredFtp } from "../planning/new-plan-dialog-view-model";
import { localISODate } from "../../core/format.js";
import { resolveWeight, type NutritionWellnessDay } from "../nutrition/nutrition-day-model";
import {
  buildLoseInput,
  endGoalWithNutrition,
  NUTRITION_PAUSED_NOTE,
  paceFieldFor,
  planOnEnd,
  planOnSave,
  saveGoalWithNutrition,
  setsDeficit,
} from "./goal-nutrition-sync";
import type { Goal, GoalKey, GoalRole } from "../../api/types";
import { FtpCheck } from "./FtpCheck";
import { OrientationNotice } from "./OrientationNotice";
import {
  buildFtpCheck,
  buildGoalInput,
  canEditGoals,
  catalogChoices,
  conflictHint,
  defaultRole,
  describeGoal,
  fieldsFor,
  formFromGoal,
  groupGoals,
  mergedEftpHistory,
  pickCheckGoal,
  replaceNotice,
  saveErrorMessage,
  replacementFor,
  type FtpCheckView,
  type GoalFormState,
} from "./goals-view-model";
import {
  SECTION_STYLE,
  SECTION_DESC_STYLE,
  HEADING_STYLE,
  LABEL_STYLE,
  INPUT_STYLE,
  LINK_BUTTON_STYLE,
  ERROR_STYLE,
} from "./section-styles";

type Ride = import("../../types.js").Ride;
type WellnessDay = import("../../types.js").WellnessDay;

const MUTED_STYLE = { color: "var(--ink-3)", fontSize: ".78rem", margin: "0 0 10px" } as const;

const NOTE_STYLE = {
  margin: 0,
  padding: "6px 0 6px 10px",
  borderLeft: "2px solid var(--warn)",
  color: "var(--ink-2)",
  fontFamily: "var(--font-body)",
  fontSize: ".78rem",
  lineHeight: 1.5,
} as const;

const INFO_STYLE = {
  margin: 0,
  color: "var(--ink-3)",
  fontFamily: "var(--font-body)",
  fontSize: ".74rem",
  lineHeight: 1.5,
} as const;

const GHOST_BUTTON_STYLE = {
  padding: "6px 14px",
  borderRadius: "var(--pill)",
  border: "1px solid var(--hair)",
  background: "transparent",
  color: "var(--ink-3)",
  font: "inherit",
  fontSize: ".72rem",
  cursor: "pointer",
} as const;

function emptyForm(role: GoalRole): GoalFormState {
  return { goalKey: "", role, targetValue: "", targetDate: "", freeText: "", pace: "", targetWeight: "" };
}

function GoalCard({
  goal,
  check,
  busy,
  onEnd,
  onEdit,
}: {
  goal: Goal;
  check?: FtpCheckView | null;
  busy: boolean;
  onEnd: (id: string) => void;
  /** Fehlt bei früheren Freitext-Zielen: die lassen sich nur beenden. */
  onEdit?: (goal: Goal) => void;
}) {
  const d = describeGoal(goal);
  const meta = [d.dateText, d.valueText].filter(Boolean).join(" · ");
  return (
    <li
      style={{
        listStyle: "none",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "10px 12px",
        border: "1px solid var(--hair)",
        borderRadius: "var(--radius-sm)",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          {d.roleLabel && <div style={{ ...LABEL_STYLE, marginBottom: 2 }}>{d.roleLabel}</div>}
          <div style={{ fontFamily: "var(--font-disp)", fontWeight: 600, fontSize: ".88rem", color: "var(--ink)", overflowWrap: "anywhere" }}>
            {d.title}
          </div>
          {meta && <div style={{ fontFamily: "var(--font-mono)", fontSize: ".65rem", color: "var(--ink-3)" }}>{meta}</div>}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {onEdit && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onEdit(goal)}
              aria-label={`Ziel bearbeiten: ${d.title}`}
              style={{ ...GHOST_BUTTON_STYLE, opacity: busy ? 0.6 : 1 }}
            >
              Bearbeiten
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => onEnd(goal.id)}
            aria-label={`Ziel beenden: ${d.title}`}
            style={{ ...GHOST_BUTTON_STYLE, opacity: busy ? 0.6 : 1 }}
          >
            Beenden
          </button>
        </div>
      </div>
      {d.notice && <p style={INFO_STYLE}>{d.notice}</p>}
      {check && <FtpCheck view={check} />}
    </li>
  );
}

export function GoalsSection() {
  const profile = useSessionProfile();
  const { goals, isLoading } = useGoals();
  const { replace, isPending: isSaving } = useReplaceGoal();
  const { deactivate, isPending: isEnding } = useDeactivateGoal();
  const { add: addNutritionGoal, isPending: isWritingNutrition } = useAddNutritionGoal();
  const { goal: nutritionGoal } = useActiveNutritionGoal();
  const { data: basics } = useProfileBasics();

  // Sportarten und eFTP-Daten: wie Hero/Analyse über den aktiven Athleten.
  // Ziele hängen am eingeloggten Profil — Sportfilter und Check nur anwenden,
  // wenn der angezeigte Athlet der eingeloggte Selbst ist.
  const { activeAthleteId } = useActiveAthlete();
  const { isSelf } = useIsSelfAthlete(activeAthleteId);
  const sports = useAthleteSports(activeAthleteId);
  const athleteCfg = useAthleteConfig(activeAthleteId);
  const { data: rideData } = useRides(activeAthleteId);
  const ftpHistoryEntries = useFtpHistoryEntries(activeAthleteId);

  const todayISO = localISODate();
  const groups = useMemo(() => groupGoals(goals), [goals]);

  const [open, setOpen] = useState(false);
  // Das Formular bearbeitet dieses Ziel; `null` = ein neues Ziel.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<GoalFormState>(() => emptyForm("main"));
  const [error, setError] = useState("");
  const [endError, setEndError] = useState("");

  const checkGoal = pickCheckGoal(groups);
  const rides = rideData?.rides as Ride[] | undefined;
  const wellness = rideData?.wellness as WellnessDay[] | undefined;
  const currentFtp = resolveMeasuredFtp(athleteCfg, ftpHistoryEntries, todayISO).ftpMeasured;
  const check = useMemo<FtpCheckView | null>(() => {
    if (!checkGoal || !isSelf) return null;
    return buildFtpCheck({
      goal: checkGoal,
      current: currentFtp,
      history: mergedEftpHistory(rides ?? [], wellness ?? []),
      todayISO,
    });
  }, [checkGoal, isSelf, currentFtp, rides, wellness, todayISO]);

  // Z8: wer nicht schreiben darf, sieht keine Formulare.
  if (!canEditGoals(profile)) return null;

  const choices = catalogChoices(isSelf ? sports : [], form.goalKey || null);
  const fields = fieldsFor(form.goalKey);
  const hint = conflictHint(groups, open ? { goalKey: form.goalKey, role: form.role } : null);
  const replacing = open && form.goalKey && !editingId ? replaceNotice(groups, form.role) : "";
  const busy = isSaving || isEnding || isWritingNutrition;
  // Fahrplan 43 E6: Tempo und Zielgewicht nur, wenn der Entwurf ein Defizit setzt
  // (Fett verlieren, und das Profil des Hauptziels lässt die Energie offen).
  const weightKg =
    resolveWeight((wellness ?? []) as unknown as NutritionWellnessDay[], basics?.weightKg ?? null, todayISO)?.weightKg ??
    null;
  const draft = form.goalKey ? { goalKey: form.goalKey, role: form.role } : null;
  const deficit = draft ? setsDeficit(groups, draft) : false;
  const paceField = deficit ? paceFieldFor(weightKg) : null;
  const deficitIsSideNote =
    open && form.goalKey === "fett_verlieren" && !deficit
      ? "Als Nebenziel hinter deinem Hauptziel bleibt die Ernährung bei „halten“. Es gibt kein Tempo und kein Defizit."
      : "";
  const isEmpty = !groups.main && !groups.side && groups.legacy.length === 0;

  const syncDeps = { replace, deactivate, addNutritionGoal };

  function patch(update: Partial<GoalFormState>) {
    setError("");
    setForm((f) => ({ ...f, ...update }));
  }

  function openForm() {
    setError("");
    setEditingId(null);
    setForm(emptyForm(defaultRole(groups)));
    setOpen(true);
  }

  // Bearbeiten nutzt den Ersetzen-Weg: Die Rolle bleibt fest, das alte Ziel wird
  // beendet und das geänderte neu angelegt. So bleibt der Verlauf erhalten.
  function openEdit(goal: Goal) {
    setError("");
    setEditingId(goal.id);
    setForm(formFromGoal(goal, nutritionGoal));
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const built = buildGoalInput(form, todayISO);
    if (!built.ok) {
      setError(built.message);
      return;
    }
    const old = replacementFor(groups, form.role);

    // Ernährung nachziehen (Fahrplan 43 E6): bei Defizit zuerst Tempo und Zielgewicht prüfen.
    // Ein zu hoher Wert wird abgelehnt, nie still geändert.
    let lose = null;
    if (built.input.goalKey && setsDeficit(groups, { goalKey: built.input.goalKey, role: form.role })) {
      const l = buildLoseInput({
        pace: form.pace ?? "",
        targetWeight: form.targetWeight ?? "",
        targetDate: form.targetDate,
        weightKg,
      });
      if (!l.ok) {
        setError(l.message);
        return;
      }
      lose = l.input;
    }
    const plan = planOnSave(groups, { goalKey: built.input.goalKey!, role: form.role }, lose);

    const outcome = await saveGoalWithNutrition(syncDeps, { oldGoalId: old?.id ?? null, goalInput: built.input, plan });
    if (!outcome.ok) {
      const base = outcome.stage === "goal" ? saveErrorMessage(outcome.message, old != null) : outcome.message;
      setError(outcome.nutritionPaused && outcome.stage === "goal" ? `${base} ${NUTRITION_PAUSED_NOTE}` : base);
      return;
    }
    setOpen(false);
  }

  async function handleEnd(goalId: string) {
    setEndError("");
    const outcome = await endGoalWithNutrition(syncDeps, { goalId, plan: planOnEnd(groups, goalId) });
    if (!outcome.ok) {
      setEndError(
        outcome.stage === "maintain"
          ? outcome.message
          : `Das Ziel konnte nicht beendet werden.${outcome.nutritionPaused ? ` ${NUTRITION_PAUSED_NOTE}` : ""}`,
      );
      return;
    }
    if (goalId === editingId) setOpen(false);
  }

  return (
    <div style={SECTION_STYLE}>
      <div style={HEADING_STYLE}>Ziele</div>
      <p style={SECTION_DESC_STYLE}>
        Wähle ein Hauptziel und höchstens ein Nebenziel. Das Datum ist optional. Ein FTP-Ziel erscheint im
        Hero-Tab als Saisonziel.
      </p>
      <div style={{ margin: "0 0 10px" }}>
        <OrientationNotice />
      </div>
      {isLoading && <p style={MUTED_STYLE}>Lädt …</p>}
      {!isLoading && isEmpty && <p style={MUTED_STYLE}>Noch kein Ziel gesetzt.</p>}

      {!isLoading && (groups.main || groups.side) && (
        <ul style={{ display: "flex", flexDirection: "column", gap: 8, margin: "0 0 10px", padding: 0 }}>
          {[groups.main, groups.side].map(
            (g) =>
              g && (
                <GoalCard
                  key={g.id}
                  goal={g}
                  check={checkGoal?.id === g.id ? check : null}
                  busy={busy}
                  onEnd={(id) => void handleEnd(id)}
                  onEdit={openEdit}
                />
              ),
          )}
        </ul>
      )}

      {!isLoading && groups.legacy.length > 0 && (
        <div style={{ margin: "0 0 10px" }}>
          <div style={{ ...LABEL_STYLE, marginBottom: 4 }}>Frühere Ziele</div>
          <p style={{ ...INFO_STYLE, marginBottom: 6 }}>
            Frühere Freitext-Ziele zählen nicht als Haupt- oder Nebenziel. Du kannst sie beenden.
          </p>
          <ul style={{ display: "flex", flexDirection: "column", gap: 8, margin: 0, padding: 0 }}>
            {groups.legacy.map((g) => (
              <GoalCard key={g.id} goal={g} busy={busy} onEnd={(id) => void handleEnd(id)} />
            ))}
          </ul>
        </div>
      )}

      {endError && (
        <div role="alert" style={{ ...ERROR_STYLE, marginBottom: 8 }}>
          {endError}
        </div>
      )}

      {hint && (
        <p role="note" style={{ ...NOTE_STYLE, marginBottom: 10 }}>
          {hint}
        </p>
      )}

      {!open && (
        <button type="button" onClick={openForm} style={LINK_BUTTON_STYLE}>
          + Ziel hinzufügen
        </button>
      )}

      {open && (
        <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
          {editingId && <div style={LABEL_STYLE}>{form.role === "main" ? "Hauptziel" : "Nebenziel"} bearbeiten</div>}
          <label style={LABEL_STYLE}>
            Ziel
            <select
              value={form.goalKey}
              onChange={(e) => patch({ goalKey: e.target.value as GoalKey | "" })}
              style={INPUT_STYLE}
            >
              <option value="">Bitte wählen</option>
              {choices.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          {!editingId && (
            <label style={LABEL_STYLE}>
              Rolle
              <select value={form.role} onChange={(e) => patch({ role: e.target.value as GoalRole })} style={INPUT_STYLE}>
                <option value="main">Hauptziel</option>
                <option value="side">Nebenziel</option>
              </select>
            </label>
          )}

          {fields.showFreeText && (
            <label style={LABEL_STYLE}>
              Beschreibung
              <input
                type="text"
                maxLength={80}
                value={form.freeText}
                onChange={(e) => patch({ freeText: e.target.value })}
                style={INPUT_STYLE}
              />
            </label>
          )}

          {fields.showValue && (
            <label style={LABEL_STYLE}>
              Zielwert ({fields.valueUnit})
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="1"
                required={fields.valueRequired}
                value={form.targetValue}
                onChange={(e) => patch({ targetValue: e.target.value })}
                style={INPUT_STYLE}
              />
            </label>
          )}

          <label style={LABEL_STYLE}>
            Zieldatum (optional)
            <input
              type="date"
              min={todayISO}
              value={form.targetDate}
              onChange={(e) => patch({ targetDate: e.target.value })}
              style={INPUT_STYLE}
            />
          </label>

          {paceField?.kind === "ok" && (
            <>
              <label style={LABEL_STYLE}>
                Tempo (kg pro Woche)
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.05"
                  min="0.05"
                  required
                  value={form.pace ?? ""}
                  onChange={(e) => patch({ pace: e.target.value })}
                  aria-describedby="goal-pace-hint"
                  style={INPUT_STYLE}
                />
              </label>
              <p id="goal-pace-hint" style={INFO_STYLE}>
                {paceField.text}
              </p>
              <label style={LABEL_STYLE}>
                Zielgewicht in kg (optional)
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="1"
                  value={form.targetWeight ?? ""}
                  onChange={(e) => patch({ targetWeight: e.target.value })}
                  style={INPUT_STYLE}
                />
              </label>
            </>
          )}
          {paceField?.kind === "no-weight" && <p style={INFO_STYLE}>{paceField.text}</p>}
          {deficitIsSideNote && <p style={INFO_STYLE}>{deficitIsSideNote}</p>}

          {fields.notice && <p style={INFO_STYLE}>{fields.notice}</p>}
          {replacing && <p style={INFO_STYLE}>{replacing}</p>}

          {error && (
            <div role="alert" style={ERROR_STYLE}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
            <button
              type="submit"
              disabled={busy}
              style={{
                padding: "9px 18px",
                borderRadius: "var(--pill)",
                border: "none",
                background: "var(--ss)",
                color: "#17110a",
                fontWeight: 600,
                cursor: busy ? "default" : "pointer",
                opacity: busy ? 0.7 : 1,
              }}
            >
              {isSaving ? "Speichern …" : "Speichern"}
            </button>
            <button type="button" onClick={() => setOpen(false)} style={LINK_BUTTON_STYLE}>
              Abbrechen
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

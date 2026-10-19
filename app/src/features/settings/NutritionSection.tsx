/* ============================================================
   FEATURES/SETTINGS/NUTRITIONSECTION.TSX — Ernährungsdaten
   (Intoleranzen, Ernährungsziel; Rückfrage nach dem biologischen
   Geschlecht nur bei divers / keine Angabe)
   Fahrplan 23 E5.

   Geschlecht, Größe und Gewicht werden NUR in ProfileBasicsSection
   erfragt (dort kein Duplikat) — die Ernährungs-Formeln leiten ihr
   m/f daraus ab (core/profile-sex.js). Sex und intolerances speichern
   sofort (wie Gender/UnitsSection), das Ernährungsziel wird über ein
   einfaches Formular gesetzt und legt eine neue Zeile an (append-only).
   ============================================================ */

import { useState } from "react";
import { useProfileBasics, useUpdateSex, useUpdateIntolerances } from "../../api/hooks/useProfile";
import { useActiveNutritionGoal, useAddNutritionGoal } from "../../api/hooks/useNutritionGoals";
import { ALLERGEN_TAXONOMY } from "../../core/nutrition-taxonomy.js";
import { BiologicalSexField } from "./BiologicalSexField";
import { SavedCheck } from "./SavedCheck";
import { fmtDate } from "../../core/format.js";
import {
  SECTION_STYLE,
  LABEL_STYLE,
  INPUT_STYLE,
  HEADING_STYLE,
  ERROR_STYLE,
} from "./section-styles";
import type { NutritionGoalInput } from "../../api/types";

export function NutritionSection() {
  const { data: basics, isLoading: basicsLoading } = useProfileBasics();
  const { update: saveSex, isPending: sexPending } = useUpdateSex();
  const { update: saveIntolerances, isPending: intolerancesPending } = useUpdateIntolerances();
  const { goal, isLoading: goalLoading } = useActiveNutritionGoal();
  const { add: saveGoal, isPending: goalPending } = useAddNutritionGoal();

  const [sexSaved, setSexSaved] = useState(false);
  const [intolerancesSaved, setIntolerancesSaved] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalType, setGoalType] = useState<NutritionGoalInput["goalType"]>("maintain");
  const [targetWeight, setTargetWeight] = useState("");
  const [pacePerWeek, setPacePerWeek] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [goalError, setGoalError] = useState("");

  async function handleSexChange(next: "m" | "f" | null) {
    const result = await saveSex(next);
    if (result.ok) {
      setSexSaved(true);
      setTimeout(() => setSexSaved(false), 1500);
    }
  }

  function handleIntoleranceToggle(key: string) {
    if (intolerancesPending) return;
    const current = basics?.intolerances ?? [];
    const next = current.includes(key)
      ? current.filter((k: string) => k !== key)
      : [...current, key];
    void saveIntolerances(next).then((result) => {
      if (result.ok) {
        setIntolerancesSaved(true);
        setTimeout(() => setIntolerancesSaved(false), 1500);
      }
    });
  }

  async function handleGoalSubmit(e: React.FormEvent) {
    e.preventDefault();
    setGoalError("");

    const input: NutritionGoalInput = {
      goalType,
      targetWeightKg: targetWeight ? Number(targetWeight) : null,
      pacePerWeekKg: pacePerWeek ? Number(pacePerWeek) : null,
      targetDate: targetDate || null,
    };

    const result = await saveGoal(input);
    if (!result.ok) {
      setGoalError(result.error?.message || "Konnte nicht gespeichert werden.");
      return;
    }
    setGoalOpen(false);
    setGoalType("maintain");
    setTargetWeight("");
    setPacePerWeek("");
    setTargetDate("");
  }

  if (basicsLoading || goalLoading) return null;

  return (
    <div style={SECTION_STYLE}>
      <div style={HEADING_STYLE}>Ernährung</div>
      <p style={{ fontSize: ".72rem", color: "var(--ink-3)", margin: "0 0 12px" }}>
        Diese Daten werden für die Berechnung der Nährstoffempfehlungen verwendet.
        Größe, Gewicht und Geschlecht stehen in den „Profil-Basisdaten".
      </p>

      {/* Nur bei divers / keine Angabe — sonst leitet die Formel aus dem Geschlecht der Basisdaten ab */}
      <BiologicalSexField
        gender={basics?.gender}
        sex={basics?.sex}
        onChange={(next) => void handleSexChange(next)}
        pending={sexPending}
        saved={sexSaved}
      />

      {/* Intoleranzen */}
      <div style={{ marginBottom: 16 }}>
        <label style={LABEL_STYLE}>Intoleranzen / Allergene</label>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 6,
          }}
        >
          {ALLERGEN_TAXONOMY.filter((e) => !e.isFreetext).map((entry) => {
            const checked = (basics?.intolerances ?? []).includes(entry.key);
            return (
              <label
                key={entry.key}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 10px",
                  borderRadius: "var(--radius-sm)",
                  border: `1px solid ${checked ? "var(--ss)" : "var(--hair)"}`,
                  background: checked ? "rgba(200,160,80,.1)" : "transparent",
                  cursor: intolerancesPending ? "not-allowed" : "pointer",
                  fontFamily: "var(--font-body)",
                  fontSize: ".78rem",
                  color: "var(--ink)",
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={intolerancesPending}
                  onChange={() => handleIntoleranceToggle(entry.key)}
                  style={{ accentColor: "var(--ss)", width: 14, height: 14 }}
                />
                {entry.label}
              </label>
            );
          })}
          {/* "Keine" Button als separater Aktions-Button,
              kein Checkbox-Chaos mit dem async Update */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 10px",
              borderRadius: "var(--radius-sm)",
              border: `1px solid ${!basics?.intolerances?.length ? "var(--ss)" : "var(--hair)"}`,
              background: !basics?.intolerances?.length ? "rgba(200,160,80,.1)" : "transparent",
              cursor: intolerancesPending ? "not-allowed" : "pointer",
              fontFamily: "var(--font-body)",
              fontSize: ".78rem",
              color: "var(--ink)",
            }}
            onClick={() => {
              if (intolerancesPending || !basics?.intolerances?.length) return;
              void saveIntolerances([]);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (intolerancesPending || !basics?.intolerances?.length) return;
                void saveIntolerances([]);
              }
            }}
          >
            {!basics?.intolerances?.length ? "✓ " : ""}Keine
          </div>
        </div>
        {intolerancesSaved && <SavedCheck />}
      </div>

      {/* Aktuelles Ernährungsziel */}
      <div>
        <label style={LABEL_STYLE}>Ernährungsziel</label>
        {goal && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "6px 8px",
              borderRadius: 8,
              border: "none",
              background: "transparent",
              textAlign: "left",
              marginBottom: 8,
            }}
          >
            <span style={{ fontFamily: "var(--font-mono)", fontSize: ".65rem", color: "var(--ink-3)" }}>
              {goal.goalType === "lose" && "Abnehmen"}
              {goal.goalType === "gain" && "Aufbauen"}
              {goal.goalType === "maintain" && "Halten"}
              {goal.targetWeightKg ? ` · ${goal.targetWeightKg} kg` : ""}
              {goal.pacePerWeekKg ? ` · ${goal.pacePerWeekKg} kg/Woche` : ""}
              {goal.targetDate ? ` · bis ${fmtDate(goal.targetDate)}` : ""}
            </span>
          </div>
        )}

        {!goalOpen && (
          <button
            type="button"
            onClick={() => setGoalOpen(true)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: ".62rem",
              color: "var(--ss)",
              padding: 0,
            }}
          >
            {goal ? "Neues Ziel setzen" : "Ziel setzen"}
          </button>
        )}

        {goalOpen && (
          <form
            onSubmit={(e) => void handleGoalSubmit(e)}
            style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}
          >
            <label style={LABEL_STYLE}>
              Zieltyp
              <select
                value={goalType}
                onChange={(e) => setGoalType(e.target.value as NutritionGoalInput["goalType"])}
                style={INPUT_STYLE}
              >
                <option value="maintain">Halten</option>
                <option value="lose">Abnehmen</option>
                <option value="gain">Aufbauen</option>
              </select>
            </label>

            <label style={LABEL_STYLE}>
              Zielgewicht (kg, optional)
              <input
                type="number"
                step="any"
                min={0.1}
                value={targetWeight}
                onChange={(e) => setTargetWeight(e.target.value)}
                style={INPUT_STYLE}
              />
            </label>

            {goalType !== "maintain" && (
              <label style={LABEL_STYLE}>
                Tempo (kg/Woche)
                <input
                  type="number"
                  step="any"
                  min={0.01}
                  required
                  value={pacePerWeek}
                  onChange={(e) => setPacePerWeek(e.target.value)}
                  style={INPUT_STYLE}
                />
              </label>
            )}

            <label style={LABEL_STYLE}>
              Zieldatum (optional)
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                style={INPUT_STYLE}
              />
            </label>

            {goalError && <div style={ERROR_STYLE}>{goalError}</div>}

            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <button
                type="submit"
                disabled={goalPending}
                style={{
                  alignSelf: "flex-start",
                  padding: "9px 18px",
                  borderRadius: "var(--pill)",
                  border: "none",
                  background: "var(--ss)",
                  color: "#17110a",
                  fontWeight: 600,
                  cursor: goalPending ? "default" : "pointer",
                  opacity: goalPending ? 0.7 : 1,
                }}
              >
                {goalPending ? "Speichern …" : "Speichern"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setGoalOpen(false);
                  setGoalError("");
                }}
                style={{
                  padding: "9px 18px",
                  borderRadius: "var(--pill)",
                  border: "1px solid var(--hair)",
                  background: "transparent",
                  color: "var(--ink-3)",
                  cursor: "pointer",
                }}
              >
                Abbrechen
              </button>
            </span>
          </form>
        )}
      </div>
    </div>
  );
}
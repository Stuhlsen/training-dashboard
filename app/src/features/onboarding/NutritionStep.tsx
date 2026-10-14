/* ============================================================
   FEATURES/ONBOARDING/NUTRITIONSTEP.TSX — Ernährungsschritt im
   Onboarding-Assistenten (Fahrplan 23 E5)

   Schritt erscheint zwischen `profile` (Profil-Basisdaten) und
   `intervals` (intervals.icu-Key). Nicht überspringbar — die
   Werte werden für die spätere Nährstoffberechnung gebraucht.

   Felder:
   - Körpergröße (editierbar, prefilled aus ProfileBasicsSection)
   - Geschlecht für Berechnung (m/f/Keine Angabe)
   - Intoleranzen (Multi-Select aus core/nutrition-taxonomy.js)
   - Optional: Ernährungsziel (append-only)

   Höhe wird hier editierbar angeboten (schreibt über updateHeightCm).
   ============================================================ */

import { useState } from "react";
import { useProfileBasics, useUpdateSex, useUpdateIntolerances, useUpdateHeightCm } from "../../api/hooks/useProfile";
import { useAddNutritionGoal } from "../../api/hooks/useNutritionGoals";
import { ALLERGEN_TAXONOMY } from "../../core/nutrition-taxonomy.js";
import {
  LABEL_STYLE,
  INPUT_STYLE,
  ERROR_STYLE,
} from "../settings/section-styles";
import type { NutritionGoalInput } from "../../api/types";

export interface NutritionStepProps {
  onComplete: () => void;
}

export function NutritionStep({ onComplete }: NutritionStepProps) {
  const { data: basics, isLoading } = useProfileBasics();
  const { update: saveSex, isPending: sexPending } = useUpdateSex();
  const { update: saveIntolerances, isPending: intolerancesPending } = useUpdateIntolerances();
  const { add: saveGoal, isPending: goalPending } = useAddNutritionGoal();
  const { update: saveHeightCm, isPending: heightPending } = useUpdateHeightCm();

  // Eingabe des Nutzers; null = noch nicht angefasst, dann gilt der geladene Wert
  const [heightEdit, setHeightEdit] = useState<string | null>(null);
  const heightText =
    heightEdit ?? (basics?.heightCm == null ? "" : String(basics.heightCm));
  const [heightError, setHeightError] = useState("");
  const [sexError, setSexError] = useState("");
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalType, setGoalType] = useState<NutritionGoalInput["goalType"]>("maintain");
  const [targetWeight, setTargetWeight] = useState("");
  const [pacePerWeek, setPacePerWeek] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [goalError, setGoalError] = useState("");

  async function handleHeightBlur(eventTargetValue: string) {
    setHeightError("");
    const raw = eventTargetValue.trim();
    if (raw === "") {
      setHeightError("Körpergröße ist erforderlich.");
      return;
    }
    const parsed = Number(raw);
    if (Number.isNaN(parsed) || parsed < 100 || parsed > 250) {
      setHeightError("Bitte eine gültige Größe zwischen 100 und 250 cm eingeben.");
      return;
    }
    // Sync state to the validated value for visual consistency
    setHeightEdit(raw);
    const result = await saveHeightCm(parsed);
    if (!result.ok) {
      setHeightError(result.error?.message || "Konnte nicht gespeichert werden.");
    }
  }

  async function handleSexChange(value: string) {
    setSexError("");
    const next = value === "" ? null : (value as "m" | "f");
    const result = await saveSex(next);
    if (!result.ok) {
      setSexError(result.error?.message || "Konnte nicht gespeichert werden.");
    }
  }

  function handleIntoleranceToggle(key: string) {
    if (intolerancesPending) return;
    const current = basics?.intolerances ?? [];
    const next = current.includes(key)
      ? current.filter((k: string) => k !== key)
      : [...current, key];
    void saveIntolerances(next);
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

  if (isLoading) return null;

  return (
    <div>
      <p style={{ fontSize: ".85rem", color: "var(--ink-2)", margin: "0 0 20px", lineHeight: 1.5 }}>
        Diese Angaben werden für die Berechnung der Nährstoffempfehlungen verwendet.
      </p>

      {/* Körpergröße (editierbar) */}
      <div style={{ marginBottom: 16 }}>
        <label style={LABEL_STYLE}>Körpergröße (cm)</label>
        <input
          type="text"
          inputMode="numeric"
          value={heightText}
          disabled={heightPending}
          onChange={(e) => setHeightEdit(e.target.value)}
          onBlur={(e) => void handleHeightBlur(e.currentTarget.value)}
          style={{ ...INPUT_STYLE }}
        />
        {heightError && <div style={ERROR_STYLE}>{heightError}</div>}
      </div>

      {/* Geschlecht für Berechnung */}
      <div style={{ marginBottom: 16 }}>
        <label style={LABEL_STYLE}>
          Geschlecht für die Berechnung der Mindestzufuhr (biologisch)
        </label>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, width: "100%" }}>
          <select
            value={basics?.sex ?? ""}
            onChange={(e) => void handleSexChange(e.target.value)}
            disabled={sexPending}
            style={{ ...INPUT_STYLE, flex: 1 }}
          >
            <option value="">Keine Angabe</option>
            <option value="m">Männlich</option>
            <option value="f">Weiblich</option>
          </select>
        </span>
        {sexError && <div style={ERROR_STYLE}>{sexError}</div>}
      </div>

      {/* Intoleranzen */}
      <div style={{ marginBottom: 16 }}>
        <label style={LABEL_STYLE}>Intoleranzen / Allergene</label>
        <p style={{ fontSize: ".72rem", color: "var(--ink-3)", margin: "0 0 8px" }}>
          Wählen Sie alle zutreffenden Einträge aus (Mehrfachauswahl).
        </p>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
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
          {/* "Keine" Option */}
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
      </div>

      {/* Ernährungsziel (optional) */}
      <div style={{ marginBottom: 16 }}>
        <label style={LABEL_STYLE}>Ernährungsziel (optional)</label>
        {!goalOpen && (
          <button
            type="button"
            onClick={() => setGoalOpen(true)}
            style={{
              display: "block",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: ".62rem",
              color: "var(--ss)",
              padding: "4px 0",
            }}
          >
            Ziel setzen
          </button>
        )}

        {goalOpen && (
          <form
            onSubmit={(e) => void handleGoalSubmit(e)}
            style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}
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

      {/* Weiter-Button (kein Skip — dieser Schritt ist Pflicht).
          Deaktiviert, solange die Höhe fehlt oder ein Fehler
          angezeigt wird (Höhe ist per Issue-Vorgabe Pflicht). */}
      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button
          type="button"
          onClick={onComplete}
          disabled={heightText.trim() === "" || heightError !== ""}
          style={{
            padding: "9px 18px",
            borderRadius: "var(--pill)",
            border: "none",
            background: heightText.trim() === "" || heightError !== "" ? "var(--hair)" : "var(--ss)",
            color: heightText.trim() === "" || heightError !== "" ? "var(--ink-3)" : "#17110a",
            fontWeight: 600,
            cursor: heightText.trim() === "" || heightError !== "" ? "default" : "pointer",
            opacity: heightText.trim() === "" || heightError !== "" ? 0.5 : 1,
          }}
        >
          Weiter
        </button>
      </div>
    </div>
  );
}
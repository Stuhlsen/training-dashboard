/* ============================================================
   FEATURES/SETTINGS/TRAININGTARGETSSECTION.TSX — dauerhafte Trainings-
   Vorgaben des eingeloggten Athleten (Fahrplan 11). Steht in der
   „Training"-Karte neben GoalsSection (datierte Ziele) — hier stehen
   Dauerwerte ohne Datum.

   Aktuell ein Feld: das Intervall-Kadenz-Ziel `T`. Es speist den
   Workout-Push zu intervals.icu, den .zwo-Export (Warmup `T-5`, Intervall
   `T`, Pause/Cooldown `T-10`) und die Kadenz-Anzeige im Analyse-Tab.
   Leeres Feld + Speichern setzt zurück auf den Standard (90 RPM).

   Formular-Muster wie SyncLocationSection.tsx (Hydrate-once, SavedCheck).
   ============================================================ */

import { useState } from "react";
import {
  useCadenceTarget,
  DEFAULT_CADENCE_TARGET_RPM,
  CADENCE_TARGET_MIN,
  CADENCE_TARGET_MAX,
} from "../../api/hooks/useCadenceTarget";
import { parseCadenceTargetInput } from "./cadence-target-input";
import { SavedCheck } from "./SavedCheck";
import { LABEL_STYLE, INPUT_STYLE, HEADING_STYLE, ERROR_STYLE, SECTION_STYLE } from "./section-styles";

export function TrainingTargetsSection() {
  const { rawTarget, isLoading, update, isPending } = useCadenceTarget();

  const [hydrated, setHydrated] = useState(false);
  const [cadence, setCadence] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Einmalig den geladenen Wert ins Formular übernehmen (Muster wie
  // SyncLocationSection), danach gehört der Feldinhalt dem Nutzer.
  if (!hydrated && !isLoading) {
    setHydrated(true);
    setCadence(rawTarget === null ? "" : String(rawTarget));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const parsed = parseCadenceTargetInput(cadence);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }

    const result = await update(parsed.value);
    if (!result.ok) {
      setError(result.error?.message || "Konnte nicht gespeichert werden.");
      return;
    }
    finishSaved();
  }

  function finishSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div style={SECTION_STYLE}>
      <div style={HEADING_STYLE}>Trainings-Ziele</div>
      <p style={{ fontSize: ".72rem", color: "var(--ink-3)", margin: "0 0 12px" }}>
        Dein Intervall-Kadenz-Ziel in Umdrehungen pro Minute. Wirkt im Workout-Push zu intervals.icu,
        im Zwift-/MyWhoosh-Export (Aufwärmen −5, Pausen −10) und in der Kadenz-Anzeige im Analyse-Tab.
        Feld leeren und speichern setzt zurück auf den Standard ({DEFAULT_CADENCE_TARGET_RPM}&nbsp;RPM).
      </p>
      <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={LABEL_STYLE}>
          Kadenz-Ziel (RPM)
          <input
            type="number"
            inputMode="numeric"
            step={1}
            min={CADENCE_TARGET_MIN}
            max={CADENCE_TARGET_MAX}
            value={cadence}
            onChange={(e) => setCadence(e.target.value)}
            placeholder={`z. B. ${DEFAULT_CADENCE_TARGET_RPM}`}
            style={INPUT_STYLE}
          />
        </label>
        {error && <div style={ERROR_STYLE}>{error}</div>}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <button
            type="submit"
            disabled={isPending}
            style={{
              alignSelf: "flex-start",
              padding: "9px 18px",
              borderRadius: "var(--pill)",
              border: "none",
              background: "var(--ss)",
              color: "#17110a",
              fontWeight: 600,
              cursor: isPending ? "default" : "pointer",
              opacity: isPending ? 0.7 : 1,
            }}
          >
            {isPending ? "Speichern …" : "Speichern"}
          </button>
          {saved && <SavedCheck />}
        </span>
      </form>
    </div>
  );
}

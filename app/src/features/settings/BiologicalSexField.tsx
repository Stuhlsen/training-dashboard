/* ============================================================
   FEATURES/SETTINGS/BIOLOGICALSEXFIELD.TSX — Rückfrage nach dem biologischen
   Geschlecht für die Ernährungs-Formeln

   Wird NUR gezeigt, wenn die Basisdaten-Angabe (`gender`) die Frage nicht
   schon beantwortet — also bei divers / keine Angabe
   (core/profile-sex.js::needsBiologicalSexQuestion). Männlich/weiblich
   leiten die Formeln direkt aus `gender` ab, dort gibt es nichts zu fragen.
   Geteilt von NutritionSection (Settings) und NutritionStep (Onboarding).
   ============================================================ */

import { needsBiologicalSexQuestion } from "../../core/profile-sex.js";
import { SavedCheck } from "./SavedCheck";
import { LABEL_STYLE, INPUT_STYLE, ERROR_STYLE } from "./section-styles";

interface BiologicalSexFieldProps {
  gender: string | null | undefined;
  sex: "m" | "f" | null | undefined;
  onChange: (next: "m" | "f" | null) => void;
  pending?: boolean;
  saved?: boolean;
  error?: string;
}

export function BiologicalSexField({
  gender,
  sex,
  onChange,
  pending = false,
  saved = false,
  error = "",
}: BiologicalSexFieldProps) {
  if (!needsBiologicalSexQuestion(gender)) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={LABEL_STYLE}>Biologisches Geschlecht für die Berechnung</label>
      <p style={{ fontSize: ".72rem", color: "var(--ink-3)", margin: "0 0 6px" }}>
        Die Formel für die Mindestzufuhr braucht einen biologischen Wert. Ohne Angabe rechnen wir
        vorsichtiger.
      </p>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, width: "100%" }}>
        <select
          value={sex ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : (e.target.value as "m" | "f"))}
          disabled={pending}
          style={{ ...INPUT_STYLE, flex: 1 }}
        >
          <option value="">Keine Angabe</option>
          <option value="m">Männlich</option>
          <option value="f">Weiblich</option>
        </select>
        {saved && <SavedCheck />}
      </span>
      {error && <div style={ERROR_STYLE}>{error}</div>}
    </div>
  );
}

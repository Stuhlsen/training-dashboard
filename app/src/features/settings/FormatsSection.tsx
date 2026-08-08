/* ============================================================
   FEATURES/SETTINGS/FORMATSSECTION.TSX — Trainingsformate (athletengated),
   Port von ui/settings-panel.js::buildFormatsSection()

   D2, docs/konzept-progressionssteuerung.md L1.1/L7: welche Formatfamilien
   für den Athleten aktiv sind. Die max-zwei-pro-Blockziel-Regel wird HIER
   geprüft (formats-view-model.ts), bevor useSetAthleteFormatActive()
   überhaupt aufgerufen wird — genau wie im Vanilla-Original.
   ============================================================ */

import { useState } from "react";
import { useAthleteFormats, useSetAthleteFormatActive } from "../../api/hooks/useAthleteFormats";
import { blockedByLimit } from "./formats-view-model";
import { ToggleSwitch } from "./ToggleSwitch";
import { SECTION_STYLE, HEADING_STYLE, ERROR_STYLE } from "./section-styles";

const EVIDENCE_GRADE_LABEL: Record<string, string> = { studienlage: "Studienlage", "coaching-konsens": "Coaching-Konsens" };

export function FormatsSection() {
  const { entries, isLoading } = useAthleteFormats();
  const { setActive, isPending } = useSetAthleteFormatActive();
  const [error, setError] = useState("");

  async function handleToggle(formatId: string, currentlyActive: boolean) {
    setError("");
    if (!currentlyActive) {
      const entry = entries.find((e) => e.format.id === formatId);
      const blocked = entry && blockedByLimit(entries, entry.format);
      if (blocked) {
        setError(blocked);
        return;
      }
    }
    const result = await setActive(formatId, !currentlyActive);
    if (!result.ok) setError("Änderung konnte nicht gespeichert werden.");
  }

  return (
    <div style={SECTION_STYLE}>
      <div style={HEADING_STYLE}>Trainingsformate</div>

      {isLoading && <p style={{ color: "var(--ink-3)", fontSize: ".78rem", margin: 0 }}>Lädt …</p>}

      {!isLoading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {entries.map(({ format, active }) => (
            <div key={format.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontFamily: "var(--font-body)", fontSize: ".8rem", color: "var(--ink)" }}>
                  {format.label}
                </span>
                <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: ".6rem", color: "var(--ink-3)" }}>
                  {EVIDENCE_GRADE_LABEL[format.evidenceGrade] ?? format.evidenceGrade}
                </span>
              </span>
              <ToggleSwitch
                on={active}
                disabled={isPending}
                onChange={() => void handleToggle(format.id, active)}
                label={format.label}
              />
            </div>
          ))}
        </div>
      )}

      {error && <div style={{ ...ERROR_STYLE, marginTop: 8 }}>{error}</div>}
    </div>
  );
}

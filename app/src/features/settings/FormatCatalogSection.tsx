/* ============================================================
   FEATURES/SETTINGS/FORMATCATALOGSECTION.TSX — Admin-Editor für
   session_formats (Fahrplan 8 E11, docs/fahrplan-8-plan-generator.md)

   Nur für `profile.isAdmin` gemountet (SettingsPage). Liste aller
   Katalogeinträge + ein Formular zum Anlegen/Bearbeiten. Die
   `axes.explicitSteps` werden als JSON-Text bearbeitet und vor dem
   Schreiben über format-catalog-view-model.ts::validateFormatDraft
   geprüft — der Adapter/RLS ist die zweite Grenze, nicht die erste.
   ============================================================ */

import { useState } from "react";
import {
  useSessionFormatCatalog,
  useSessionFormatMutations,
} from "../../api/hooks/useSessionFormatCatalog";
import {
  TARGET_SYSTEMS,
  CURRENCIES,
  EVIDENCE_GRADES,
  BLOCK_TARGET_SUGGESTIONS,
  emptyDraft,
  draftFromFormat,
  validateFormatDraft,
  type FormatDraft,
} from "./format-catalog-view-model";
import { SECTION_STYLE, LABEL_STYLE, INPUT_STYLE, LINK_BUTTON_STYLE, ERROR_STYLE } from "./section-styles";

const SELECT_STYLE = { ...INPUT_STYLE, appearance: "auto" as const };
const MONO_INPUT_STYLE = { ...INPUT_STYLE, fontFamily: "var(--font-mono)", fontSize: ".72rem" };

const PRIMARY_BUTTON_STYLE = {
  alignSelf: "flex-start" as const,
  padding: "9px 18px",
  borderRadius: "var(--pill)",
  border: "none",
  background: "var(--ss)",
  color: "#17110a",
  fontWeight: 600,
};

export function FormatCatalogSection() {
  const { formats, isLoading } = useSessionFormatCatalog();
  const { create, update, remove, isPending } = useSessionFormatMutations();

  const [draft, setDraft] = useState<FormatDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  function startNew() {
    setDraft(emptyDraft());
    setEditingId(null);
    setErrors([]);
  }

  function startEdit(id: string) {
    const found = formats.find((f) => f.id === id);
    if (!found) return;
    setDraft(
      draftFromFormat({
        id: found.id,
        label: found.label,
        targetSystem: found.targetSystem,
        currency: found.currency,
        evidenceGrade: found.evidenceGrade,
        blockTargets: found.blockTargets,
        axes: found.axes,
      }),
    );
    setEditingId(id);
    setErrors([]);
  }

  function cancel() {
    setDraft(null);
    setEditingId(null);
    setErrors([]);
  }

  function patch(part: Partial<FormatDraft>) {
    setDraft((d) => (d ? { ...d, ...part } : d));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const validated = validateFormatDraft(draft);
    if (!validated.ok) {
      setErrors(validated.errors);
      return;
    }
    setErrors([]);
    const result = editingId
      ? await update(editingId, validated.value)
      : await create(validated.value);
    if (!result.ok) {
      setErrors([result.error?.message ?? "Schreiben fehlgeschlagen."]);
      return;
    }
    cancel();
  }

  async function handleDelete(id: string) {
    if (!window.confirm(`Format "${id}" löschen? Zuordnungen (athlete_formats) verschwinden mit.`)) return;
    const result = await remove(id);
    if (!result.ok) setErrors([result.error?.message ?? "Löschen fehlgeschlagen."]);
    else if (editingId === id) cancel();
  }

  return (
    <div style={SECTION_STYLE}>
      {isLoading && <p style={{ color: "var(--ink-3)", fontSize: ".78rem", margin: 0 }}>Lädt …</p>}

      {!isLoading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          {formats.map((f) => (
            <div
              key={f.id}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontFamily: "var(--font-body)", fontSize: ".8rem", color: "var(--ink)" }}>
                  {f.label}
                </span>
                <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: ".6rem", color: "var(--ink-3)" }}>
                  {f.id} · {f.currency} · {(f.blockTargets as unknown[]).join(", ") || "kein Blockziel"}
                </span>
              </span>
              <span style={{ display: "flex", gap: 10, flexShrink: 0 }}>
                <button type="button" onClick={() => startEdit(f.id)} style={LINK_BUTTON_STYLE}>
                  Bearbeiten
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(f.id)}
                  style={{ ...LINK_BUTTON_STYLE, color: "var(--danger)" }}
                >
                  Löschen
                </button>
              </span>
            </div>
          ))}
          {formats.length === 0 && (
            <p style={{ color: "var(--ink-3)", fontSize: ".78rem", margin: 0 }}>Noch keine Formate im Katalog.</p>
          )}
        </div>
      )}

      {!draft && (
        <button type="button" onClick={startNew} style={LINK_BUTTON_STYLE}>
          + Format anlegen
        </button>
      )}

      {draft && (
        <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          <label style={LABEL_STYLE}>
            id (kebab-case, Primärschlüssel)
            <input
              type="text"
              required
              value={draft.id}
              disabled={!!editingId}
              onChange={(e) => patch({ id: e.target.value })}
              style={{ ...MONO_INPUT_STYLE, opacity: editingId ? 0.6 : 1 }}
            />
          </label>
          <label style={LABEL_STYLE}>
            label
            <input type="text" required value={draft.label} onChange={(e) => patch({ label: e.target.value })} style={INPUT_STYLE} />
          </label>
          <label style={LABEL_STYLE}>
            target_system
            <select value={draft.targetSystem} onChange={(e) => patch({ targetSystem: e.target.value })} style={SELECT_STYLE}>
              {TARGET_SYSTEMS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label style={LABEL_STYLE}>
            currency
            <select value={draft.currency} onChange={(e) => patch({ currency: e.target.value })} style={SELECT_STYLE}>
              {CURRENCIES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label style={LABEL_STYLE}>
            evidence_grade
            <select value={draft.evidenceGrade} onChange={(e) => patch({ evidenceGrade: e.target.value })} style={SELECT_STYLE}>
              {EVIDENCE_GRADES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label style={LABEL_STYLE}>
            block_targets (Komma-getrennt — z. B. {BLOCK_TARGET_SUGGESTIONS.join(", ")})
            <input
              type="text"
              value={draft.blockTargets}
              onChange={(e) => patch({ blockTargets: e.target.value })}
              style={INPUT_STYLE}
            />
          </label>
          <label style={LABEL_STYLE}>
            axes.explicitSteps (JSON-Array)
            <textarea
              value={draft.stepsJson}
              onChange={(e) => patch({ stepsJson: e.target.value })}
              rows={12}
              spellCheck={false}
              style={{ ...MONO_INPUT_STYLE, resize: "vertical", lineHeight: 1.4 }}
            />
          </label>

          {errors.length > 0 && (
            <ul style={{ ...ERROR_STYLE, margin: 0, paddingLeft: 16 }}>
              {errors.map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
            </ul>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="submit"
              disabled={isPending}
              style={{ ...PRIMARY_BUTTON_STYLE, cursor: isPending ? "default" : "pointer", opacity: isPending ? 0.7 : 1 }}
            >
              {isPending ? "Speichern …" : editingId ? "Änderungen speichern" : "Format anlegen"}
            </button>
            <button type="button" onClick={cancel} style={{ ...LINK_BUTTON_STYLE, color: "var(--ink-3)" }}>
              Abbrechen
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

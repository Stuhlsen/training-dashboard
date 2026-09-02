import { useEffect, useState } from "react";
import { GlassCard } from "../../components/GlassCard";
import { InfoTooltip } from "../../components/InfoTooltip";
import { KNOWN_PLAN_TYPES } from "../../core/plan-config.js";
import { addProposalArgs, replaceProposalArgs } from "../../core/proposal-payload.js";
import { useCreatePlanCard, useDeletePlanCard, useUpdatePlanCard } from "../../api/hooks/usePlanCards";
import { useCreateTrainerProposal } from "../../api/hooks/useProposals";
import type { PlanCard, PlanCardInput } from "../../api/types";
import type { WorkoutBlock, WorkoutBlockType } from "./planning-view-model";
import { asWorkoutBlocks } from "./planning-view-model";
import { isTrainerCardProposalMode, type SaveMode } from "./trainer-bar-view-model";

const TYP_OPTIONS: readonly string[] = KNOWN_PLAN_TYPES;

const TYPE_LABEL: Record<WorkoutBlockType, string> = {
  warmup: "WU",
  interval: "Intervall",
  cooldown: "CD",
};

interface PlanCardFormProps {
  athleteId: string;
  /** `null` = neue Karte anlegen, sonst bearbeiten. */
  editingCard: PlanCard | null;
  onClose: () => void;
  /** Etappe 7a: eingeloggter User ist Trainer DIESES Athleten (aus
   *  useTrainerContext) — zusammen mit `saveMode` bestimmt das, ob
   *  Anlegen/Bearbeiten einen `proposals`-Eintrag statt einer direkten
   *  Kartenänderung erzeugt (isTrainerCardProposalMode, T2: Neuanlage ist
   *  für den Trainer IMMER Vorschlag). */
  isTrainerSaving?: boolean;
  saveMode?: SaveMode;
}

const LABEL_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
  fontFamily: "var(--font-mono)",
  fontSize: ".64rem",
  textTransform: "uppercase",
  letterSpacing: ".06em",
  color: "var(--ink-3)",
};

const INPUT_STYLE: React.CSSProperties = {
  background: "rgba(255,255,255,.04)",
  border: "1px solid var(--hair)",
  borderRadius: "var(--radius-sm)",
  padding: "9px 11px",
  color: "var(--ink)",
  font: "inherit",
  fontSize: ".9rem",
};

let blockIdSeq = 0;
interface EditableBlock extends WorkoutBlock {
  key: number;
}

/** Anlegen/Bearbeiten-Dialog für eine Plankarte — ersetzt
 *  ui/plan-card-dialog.js. Editiert wie dort NUR das neue Workout-Format
 *  ({blocks:[{type,text}]}); eine bestehende Karte im alten, starren
 *  Zahlenformat bleibt beim Speichern unangetastet, solange kein Block
 *  hinzugefügt/entfernt wird (sonst würde ein reiner Titel-Fix eine
 *  bestehende, pushbare Workout-Struktur stillschweigend löschen). */
export function PlanCardForm({
  athleteId,
  editingCard,
  onClose,
  isTrainerSaving = false,
  saveMode = "proposal",
}: PlanCardFormProps) {
  const [title, setTitle] = useState(editingCard?.name ?? "");
  const [date, setDate] = useState(editingCard?.date ?? "");
  const [typ, setTyp] = useState(editingCard?.typ ?? TYP_OPTIONS[0]);
  const [tssPlanned, setTssPlanned] = useState(editingCard?.tssPlanned != null ? String(editingCard.tssPlanned) : "");
  const [km, setKm] = useState(editingCard?.km != null ? String(editingCard.km) : "");
  const [details, setDetails] = useState(editingCard?.details ?? "");
  const [blocks, setBlocks] = useState<EditableBlock[]>(() => {
    const existing = asWorkoutBlocks(editingCard?.workout);
    return existing ? existing.blocks.map((b) => ({ ...b, key: blockIdSeq++ })) : [];
  });
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [proposalReason, setProposalReason] = useState("");

  const { create, isPending: creating } = useCreatePlanCard(athleteId);
  const { update, isPending: updating } = useUpdatePlanCard(athleteId);
  const { remove, isPending: deleting } = useDeletePlanCard(athleteId);
  const { create: createProposal, isPending: creatingProposal } = useCreateTrainerProposal(athleteId);
  const pending = creating || updating || creatingProposal;

  // T2 (Trainer-Sicht-Konzept §3): Neuanlage ist für den Trainer IMMER
  // Vorschlag, unabhängig von saveMode — nur bei einer bestehenden Karte
  // entscheidet der Umschalter.
  const proposalMode = isTrainerCardProposalMode(isTrainerSaving, !!editingCard, saveMode);

  const hasLegacyWorkout = !!(editingCard?.workout && !asWorkoutBlocks(editingCard.workout));

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  }, [onClose]);

  function addBlock() {
    setBlocks((bs) => [...bs, { key: blockIdSeq++, type: "interval", text: "" }]);
  }

  function removeBlock(key: number) {
    setBlocks((bs) => bs.filter((b) => b.key !== key));
  }

  function updateBlock(key: number, patch: Partial<WorkoutBlock>) {
    setBlocks((bs) => bs.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const finalBlocks = blocks.filter((b) => b.text.trim()).map(({ type, text }) => ({ type, text: text.trim() }));
    // Kein neuer Block, aber die bestehende Karte trug ein Legacy-Workout:
    // das bleibt unangetastet (s. Kommentar oben). Sonst: neue Blöcke, oder
    // null wenn weder neue Blöcke noch ein zu erhaltendes Legacy-Workout da sind.
    const workout = finalBlocks.length ? { blocks: finalBlocks } : hasLegacyWorkout ? editingCard!.workout : null;

    const cardData: PlanCardInput = {
      date,
      name: title.trim(),
      typ,
      tssPlanned: tssPlanned ? Number(tssPlanned) : null,
      km: km ? Number(km) : null,
      details: details.trim() || null,
      workout,
    };

    const result = proposalMode
      ? await createProposal(
          editingCard
            ? replaceProposalArgs(editingCard, cardData, proposalReason.trim() || undefined)
            : addProposalArgs(cardData, proposalReason.trim() || undefined),
        )
      : editingCard
        ? await update(editingCard.id, cardData)
        : await create(cardData);
    if (!result.ok) {
      setError(result.error?.message || "Karte konnte nicht gespeichert werden.");
      return;
    }
    onClose();
  }

  async function handleDelete() {
    if (!editingCard) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setError("");
    const result = await remove(editingCard.id);
    if (!result.ok) {
      setConfirmingDelete(false);
      setError(result.error?.message || "Karte konnte nicht gelöscht werden.");
      return;
    }
    onClose();
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(7,9,14,.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <GlassCard
        variant="strong"
        radius="22px"
        style={{ width: "100%", maxWidth: 460, maxHeight: "90vh", overflowY: "auto", padding: "26px 24px" }}
      >
        <div style={{ fontFamily: "var(--font-disp)", fontWeight: 700, fontSize: "1rem", color: "var(--ink)" }}>
          {editingCard ? "Karte bearbeiten" : "Karte anlegen"}
          {proposalMode && " (als Vorschlag)"}
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <label style={{ ...LABEL_STYLE, flex: 2 }}>
              Titel
              <input
                type="text"
                required
                placeholder="z. B. Sweet-Spot 3×12"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={INPUT_STYLE}
              />
            </label>
            <label style={{ ...LABEL_STYLE, flex: 1 }}>
              Datum
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} style={INPUT_STYLE} />
            </label>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <label style={{ ...LABEL_STYLE, flex: 2 }}>
              Typ
              <select value={typ ?? ""} onChange={(e) => setTyp(e.target.value)} style={INPUT_STYLE}>
                {TYP_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ ...LABEL_STYLE, flex: 1 }}>
              <span>Ziel-<InfoTooltip termKey="tss">TSS</InfoTooltip></span>
              <input type="number" min={0} step={1} value={tssPlanned} onChange={(e) => setTssPlanned(e.target.value)} style={INPUT_STYLE} />
            </label>
            <label style={{ ...LABEL_STYLE, flex: 1 }}>
              km
              <input type="number" min={0} step={1} value={km} onChange={(e) => setKm(e.target.value)} style={INPUT_STYLE} />
            </label>
          </div>

          <label style={LABEL_STYLE}>
            Notiz
            <textarea
              rows={2}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              style={{ ...INPUT_STYLE, resize: "vertical", fontFamily: "var(--font-body)" }}
            />
          </label>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={LABEL_STYLE}>Workout-Blöcke</span>
              <button
                type="button"
                onClick={addBlock}
                style={{ border: "1px solid var(--hair)", background: "transparent", color: "var(--ink-2)", borderRadius: "var(--pill)", padding: "3px 10px", fontSize: ".72rem", cursor: "pointer" }}
              >
                + Block
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {blocks.map((b) => (
                <div key={b.key} style={{ display: "flex", gap: 6 }}>
                  <select
                    value={b.type}
                    onChange={(e) => updateBlock(b.key, { type: e.target.value as WorkoutBlockType })}
                    style={{ ...INPUT_STYLE, flex: "0 0 90px" }}
                  >
                    {(Object.keys(TYPE_LABEL) as WorkoutBlockType[]).map((t) => (
                      <option key={t} value={t}>
                        {TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="z. B. 4×8' SS 84–97%"
                    value={b.text}
                    onChange={(e) => updateBlock(b.key, { text: e.target.value })}
                    style={{ ...INPUT_STYLE, flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={() => removeBlock(b.key)}
                    title="Block entfernen"
                    style={{ border: "none", background: "transparent", color: "var(--ink-3)", cursor: "pointer", fontSize: "1rem" }}
                  >
                    🗑
                  </button>
                </div>
              ))}
            </div>
            {hasLegacyWorkout && (
              <div style={{ fontSize: ".74rem", color: "var(--ink-3)", marginTop: 6 }}>
                ℹ️ Bestehendes Workout im alten Format — hier nicht editierbar. Ein neuer Block ersetzt es beim Speichern.
              </div>
            )}
          </div>

          {proposalMode && (
            <label style={LABEL_STYLE}>
              Begründung (optional)
              <input
                type="text"
                value={proposalReason}
                onChange={(e) => setProposalReason(e.target.value)}
                style={INPUT_STYLE}
              />
            </label>
          )}

          {editingCard?.pushedExternalId && (
            <div style={{ fontSize: ".76rem", color: "var(--gold)" }}>
              ⚠️ Bereits auf Wahoo gepusht — dort bleibt das Event bestehen, ggf. manuell entfernen.
            </div>
          )}

          {error && <div style={{ color: "var(--danger)", fontFamily: "var(--font-mono)", fontSize: ".7rem" }}>{error}</div>}

          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            {editingCard && !isTrainerSaving && (
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleDelete()}
                style={{
                  padding: "10px 14px",
                  borderRadius: "var(--pill)",
                  border: "1px solid var(--hair)",
                  background: "transparent",
                  color: "var(--danger)",
                  cursor: "pointer",
                  fontSize: ".82rem",
                }}
              >
                {confirmingDelete ? "🗑 Wirklich löschen?" : "🗑 Löschen"}
              </button>
            )}
            <button
              type="submit"
              disabled={pending}
              style={{
                flex: 1,
                padding: "10px 0",
                borderRadius: "var(--pill)",
                border: "none",
                background: "var(--ss)",
                color: "#17110a",
                fontWeight: 600,
                cursor: pending ? "default" : "pointer",
                opacity: pending ? 0.7 : 1,
              }}
            >
              {pending ? "Speichern …" : proposalMode ? "Als Vorschlag speichern" : "Speichern"}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: "10px 0",
                borderRadius: "var(--pill)",
                border: "1px solid var(--hair)",
                background: "transparent",
                color: "var(--ink-3)",
                cursor: "pointer",
              }}
            >
              Abbrechen
            </button>
          </div>
        </form>
      </GlassCard>
    </div>
  );
}

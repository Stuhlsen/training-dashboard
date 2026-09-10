import { useEffect, useState } from "react";
import { GlassCard } from "../../components/GlassCard";
import { InfoTooltip } from "../../components/InfoTooltip";
import { addProposalArgs, replaceProposalArgs } from "../../core/proposal-payload.js";
import { useCreatePlanCard, useDeletePlanCard, useUpdatePlanCard } from "../../api/hooks/usePlanCards";
import { useCreateTrainerProposal } from "../../api/hooks/useProposals";
import { useEffectiveSport } from "../../api/hooks/useActiveSport";
import type { PlanCard, PlanCardInput } from "../../api/types";
import type { WorkoutBlock, WorkoutBlockType } from "./planning-view-model";
import { asWorkoutBlocks } from "./planning-view-model";
import {
  formatPaceSec,
  paceSecOf,
  parsePaceInput,
  planTypesForSport,
  showSportPicker,
  workoutForSave,
  type PlanFormSport,
} from "./plan-card-form-view-model";
import { isTrainerCardProposalMode, type SaveMode } from "./trainer-bar-view-model";

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
  // Sport-Picker nur bei Athleten mit > 1 Sportart (Fahrplan 12 E3/G20) —
  // Athlet 1/2/4 sehen ihn nie, `sport` bleibt für sie fest "ride". Eine
  // bestehende Schwimm-Karte hat in Phase 2 keinen Formularpfad: Picker aus,
  // `sport` beim Speichern unverändert durchreichen (kein stiller Verlust).
  const isSwimCard = editingCard?.sport === "swim";
  const pickerVisible = showSportPicker(athleteId) && !isSwimCard;
  const { effectiveSport } = useEffectiveSport(athleteId);
  const initialSport: PlanFormSport =
    editingCard?.sport === "run"
      ? "run"
      : editingCard?.sport === "ride"
        ? "ride"
        : pickerVisible && effectiveSport === "run"
          ? "run"
          : "ride";

  const [sport, setSport] = useState<PlanFormSport>(initialSport);
  const [title, setTitle] = useState(editingCard?.name ?? "");
  const [date, setDate] = useState(editingCard?.date ?? "");
  const [typ, setTyp] = useState(editingCard?.typ ?? planTypesForSport(initialSport)[0]);
  const [tssPlanned, setTssPlanned] = useState(editingCard?.tssPlanned != null ? String(editingCard.tssPlanned) : "");
  const [km, setKm] = useState(editingCard?.km != null ? String(editingCard.km) : "");
  const [details, setDetails] = useState(editingCard?.details ?? "");
  const [paceInput, setPaceInput] = useState(() => {
    const p = paceSecOf(editingCard);
    return p != null ? formatPaceSec(p) : "";
  });
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

  // „Legacy" heißt: WEDER Block-Form ({blocks:[…]}) NOCH die Lauf-Pace-Form
  // ({paceSec}) — nur das alte, starre Zahlenformat. Sonst würde eine reine
  // Pace-Laufkarte fälschlich als „altes Format, hier nicht editierbar"
  // markiert und beim Speichern eingefroren.
  const hasLegacyWorkout = !!(
    editingCard?.workout &&
    !asWorkoutBlocks(editingCard.workout) &&
    paceSecOf(editingCard) == null
  );

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

  /** Sportwechsel: Typenliste umstellen und einen Typ der falschen Sportart
   *  auf den ersten der neuen Liste zurücksetzen. */
  function handleSportChange(next: PlanFormSport) {
    setSport(next);
    const options = planTypesForSport(next);
    if (!typ || !options.includes(typ)) setTyp(options[0]);
  }

  const paceTrimmed = paceInput.trim();
  const paceError = sport === "run" && paceTrimmed !== "" && parsePaceInput(paceTrimmed) === null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (paceError) {
      setError("Ziel-Pace bitte als mm:ss angeben (z. B. 4:30).");
      return;
    }

    const finalBlocks = blocks.filter((b) => b.text.trim()).map(({ type, text }) => ({ type, text: text.trim() }));
    // Schwimm-Karte behält ihren Sport (kein Formularpfad in Phase 2), sonst
    // steuert ihn der Picker (bzw. "ride" für Ein-Sport-Athleten).
    const sportToSave = isSwimCard ? "swim" : sport;
    const paceSec = sport === "run" ? parsePaceInput(paceTrimmed) : null;
    // workoutForSave() liefert für Rad exakt das bisherige Verhalten
    // ({ blocks } bzw. null), für Lauf zusätzlich `paceSec`. Kein neuer Block
    // und die bestehende Karte trug ein Legacy-Workout ⇒ das bleibt
    // unangetastet (s. Kommentar oben). `workout_structure` wird hier nie
    // erzeugt (bei Lauf IMMER null).
    const workout = workoutForSave(sport, finalBlocks, paceSec) ?? (hasLegacyWorkout ? editingCard!.workout : null);

    const cardData: PlanCardInput = {
      date,
      name: title.trim(),
      typ,
      tssPlanned: tssPlanned ? Number(tssPlanned) : null,
      km: km ? Number(km) : null,
      details: details.trim() || null,
      workout,
      sport: sportToSave,
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

          {pickerVisible && (
            <label style={LABEL_STYLE}>
              Sportart
              <select
                value={sport}
                onChange={(e) => handleSportChange(e.target.value as PlanFormSport)}
                style={INPUT_STYLE}
              >
                <option value="ride">Rad</option>
                <option value="run">Lauf</option>
              </select>
            </label>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <label style={{ ...LABEL_STYLE, flex: 2 }}>
              Typ
              <select value={typ ?? ""} onChange={(e) => setTyp(e.target.value)} style={INPUT_STYLE}>
                {planTypesForSport(sport).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ ...LABEL_STYLE, flex: 1 }}>
              {sport === "run" ? (
                <span>Ziel-TRIMP</span>
              ) : (
                <span>Ziel-<InfoTooltip termKey="tss">TSS</InfoTooltip></span>
              )}
              <input type="number" min={0} step={1} value={tssPlanned} onChange={(e) => setTssPlanned(e.target.value)} style={INPUT_STYLE} />
            </label>
            <label style={{ ...LABEL_STYLE, flex: 1 }}>
              km
              <input type="number" min={0} step={1} value={km} onChange={(e) => setKm(e.target.value)} style={INPUT_STYLE} />
            </label>
          </div>

          {sport === "run" && (
            <label style={LABEL_STYLE}>
              Ziel-Pace (min/km)
              <input
                type="text"
                inputMode="numeric"
                placeholder="z. B. 4:30"
                value={paceInput}
                onChange={(e) => setPaceInput(e.target.value)}
                style={{ ...INPUT_STYLE, borderColor: paceError ? "var(--danger)" : "var(--hair)" }}
              />
              {paceError && (
                <span style={{ color: "var(--danger)", fontFamily: "var(--font-mono)", fontSize: ".7rem" }}>
                  Format mm:ss, z. B. 4:30
                </span>
              )}
            </label>
          )}

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
              disabled={pending || paceError}
              style={{
                flex: 1,
                padding: "10px 0",
                borderRadius: "var(--pill)",
                border: "none",
                background: "var(--ss)",
                color: "#17110a",
                fontWeight: 600,
                cursor: pending || paceError ? "default" : "pointer",
                opacity: pending || paceError ? 0.7 : 1,
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

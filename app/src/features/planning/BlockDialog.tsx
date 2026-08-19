/* ============================================================
   FEATURES/PLANNING/BLOCKDIALOG.TSX — Blockstart-Dialog zur Familienwahl
   (Etappe 7d, Port von ui/block-dialog.js, E2 in
   docs/konzept-progressionssteuerung.md L9)

   Erscheint NUR beim Übergang in einen neuen Block, und nur wenn für das
   Blockziel mehr als eine Familie zulässig+aktiv ist (useBlockTransition)
   — bewusst KEIN Steuerelement im Export-Panel (L9: falsche Granularität,
   die Familie darf sich innerhalb eines Blocks gerade nicht ändern).

   `BlockDialogGate` ist der Einstieg, den PlanningPage rendert (Muster wie
   ProposalBanner: immer gemountet, entscheidet selbst über Sichtbarkeit).
   Session-Guard (`dismissedKeys`, hier als State statt Vanillas Modul-Set):
   verhindert, dass der Dialog bei jedem Re-Render erneut aufploppt, solange
   keine Entscheidung getroffen wurde — ein Seiten-Reload zeigt ihn wieder,
   das ist gewollt (kein dauerhaft unterdrücktes Signal, kein DB-Schreiben
   vor einer echten Entscheidung).
   ============================================================ */

import { useState } from "react";
import { GlassCard } from "../../components/GlassCard";
import { useEscapeToClose } from "../../hooks/useEscapeToClose";
import { useIsSelfAthlete } from "../../api/hooks/useWriteAuthorization";
import { useBlockTransition, useRecordBlockStart, type BlockTransition } from "../../api/hooks/useBlockTransition";
import { stepAt, formatSummary } from "../../core/ladder.js";
import { TARGET_SYSTEM_LABEL, EVIDENCE_GRADE_LABEL, defaultCandidate } from "./block-dialog-view-model";
import type { SessionFormat } from "../../api/supabase/session-formats";
import type { PlanCard as PlanCardT } from "../../api/types";

const OPTION_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  alignItems: "flex-start",
  textAlign: "left",
  padding: "12px 14px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--hair)",
  background: "rgba(255,255,255,.03)",
  color: "var(--ink)",
  font: "inherit",
  cursor: "pointer",
  width: "100%",
  boxSizing: "border-box",
};

const OPTION_ACTIVE_STYLE: React.CSSProperties = {
  ...OPTION_STYLE,
  borderColor: "var(--ss)",
  background: "rgba(224,138,60,.08)",
};

const ROW_BTN_STYLE: React.CSSProperties = {
  border: "1px solid var(--hair)",
  borderRadius: "var(--pill)",
  padding: "8px 16px",
  background: "transparent",
  color: "var(--ink-2)",
  font: "inherit",
  fontSize: ".82rem",
  cursor: "pointer",
};

const PRIMARY_BTN_STYLE: React.CSSProperties = {
  ...ROW_BTN_STYLE,
  background: "var(--ss)",
  borderColor: "var(--ss)",
  color: "#17110a",
  fontWeight: 600,
};

function BlockDialogOption({
  format,
  active,
  onSelect,
}: {
  format: SessionFormat;
  active: boolean;
  onSelect: () => void;
}) {
  const firstStep = stepAt(format, 1);
  const sample = formatSummary(format, firstStep, 1);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      style={active ? OPTION_ACTIVE_STYLE : OPTION_STYLE}
    >
      <span style={{ fontSize: ".9rem", fontWeight: 600 }}>{format.label}</span>
      <span style={{ fontSize: ".78rem", color: "var(--ink-3)" }}>
        {TARGET_SYSTEM_LABEL[format.targetSystem] ?? format.targetSystem}
      </span>
      <span style={{ fontSize: ".74rem", color: "var(--ink-3)" }}>
        {EVIDENCE_GRADE_LABEL[format.evidenceGrade] ?? format.evidenceGrade}
      </span>
      <span style={{ fontSize: ".76rem", color: "var(--ink-2)" }}>{sample}</span>
    </button>
  );
}

function BlockDialog({
  candidates,
  onClose,
  onConfirm,
}: {
  candidates: SessionFormat[];
  onClose: () => void;
  onConfirm: (formatId: string) => Promise<void>;
}) {
  const [selectedFormatId, setSelectedFormatId] = useState(defaultCandidate(candidates)?.id ?? null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEscapeToClose(onClose);

  async function handleConfirm() {
    if (!selectedFormatId) return;
    setError("");
    setSaving(true);
    try {
      await onConfirm(selectedFormatId);
    } catch {
      setError("Konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(7,9,14,.75)",
        backdropFilter: "blur(3px)",
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
        style={{ width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", padding: "26px 24px" }}
      >
        <div style={{ fontFamily: "var(--font-disp)", fontWeight: 700, fontSize: "1rem", color: "var(--ink)" }}>
          Neuer Trainingsblock — welches Format?
        </div>
        <p style={{ margin: "8px 0 14px", fontSize: ".82rem", color: "var(--ink-3)" }}>
          Für diesen Block sind mehrere Familien zulässig. Die Wahl gilt für den gesamten Block — ein Wechsel
          mittendrin setzt die Leiterposition zurück.
        </p>

        <div role="radiogroup" aria-label="Trainingsformat für diesen Block" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {candidates.map((format) => (
            <BlockDialogOption
              key={format.id}
              format={format}
              active={format.id === selectedFormatId}
              onSelect={() => setSelectedFormatId(format.id)}
            />
          ))}
        </div>

        {error && <div style={{ color: "var(--danger)", fontSize: ".8rem", marginTop: 12 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 20 }}>
          <span style={{ fontSize: ".74rem", color: "var(--ink-3)" }}>Gilt für den ganzen Block</span>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" style={ROW_BTN_STYLE} onClick={onClose}>
              Später entscheiden
            </button>
            <button
              type="button"
              style={PRIMARY_BTN_STYLE}
              disabled={!selectedFormatId || saving}
              onClick={() => void handleConfirm()}
            >
              {saving ? "⏳ …" : "Übernehmen"}
            </button>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

function sessionKeyOf(athleteId: string, transition: BlockTransition): string | null {
  return transition.shouldPrompt && transition.blockTarget ? `${athleteId}:${transition.blockTarget}` : null;
}

/** Einstieg für PlanningPage — immer gemountet, zeigt sich selbst nur an,
 *  wenn ein Blockwechsel ansteht UND der eingeloggte User der Athlet
 *  selbst ist (nie für einen Trainer, der einen fremden Plan betrachtet). */
export function BlockDialogGate({ athleteId, cards }: { athleteId: string; cards: PlanCardT[] }) {
  const { isSelf } = useIsSelfAthlete(athleteId);
  const { transition } = useBlockTransition(athleteId, cards);
  const recordBlockStart = useRecordBlockStart(athleteId);

  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set());
  const [openKey, setOpenKey] = useState<string | null>(null);

  const sessionKey = isSelf ? sessionKeyOf(athleteId, transition) : null;

  // Render-Phase-State-Anpassung (Muster wie PlanningPage::deltaBanner) statt
  // Effekt: sobald ein neuer, noch nicht gesehener Blockwechsel erkannt
  // wird, sofort als "gesehen" markieren (Schritt 3-Guard, s. Kopfkommentar)
  // und öffnen — beides in einem Zug, damit kein Zwischenrender den Dialog
  // kurz offen ohne Dismiss-Eintrag zeigt.
  if (sessionKey && !dismissedKeys.has(sessionKey) && openKey !== sessionKey) {
    setDismissedKeys((prev) => new Set(prev).add(sessionKey));
    setOpenKey(sessionKey);
  }

  if (openKey !== sessionKey || !transition.candidates?.length) return null;

  return (
    <BlockDialog
      candidates={transition.candidates}
      onClose={() => setOpenKey(null)}
      onConfirm={async (formatId) => {
        const result = await recordBlockStart(formatId);
        if (result.ok) setOpenKey(null);
        else throw new Error(result.error?.message);
      }}
    />
  );
}

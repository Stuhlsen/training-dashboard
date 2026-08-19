/* ============================================================
   FEATURES/PLANNING/IMPORTDIALOG.TSX — Claude-Vorschläge importieren
   (Etappe 7c, Port von ui/import-dialog.js)

   Textfeld (komplette Claude-Antwort) + Datei-Upload — Upload befüllt nur
   dasselbe Textfeld, ein Eingabepfad (Export/Import-Workflow-Konzept §3).
   "Prüfen" ruft usePreviewClaudeImport() (bereits in Etappe 7b/hier
   entstanden, kennt core/proposal-import-parser.js/core/proposal-
   validator.js nicht direkt — Schichtenregel) und zeigt eine Vorschau-Liste
   mit Status pro Vorschlag — diese Vorschau IST die Bestätigung vor dem
   Insert (Konzept §4, kein zweiter Sicherheits-Dialog). Teilerfolg:
   "Importieren" übernimmt nur die validen Einträge; die bestehende
   ProposalList/ProposalBanner-Review-UI aus 7b übernimmt danach den Rest.
   ============================================================ */

import { useRef, useState } from "react";
import { GlassCard } from "../../components/GlassCard";
import { useEscapeToClose } from "../../hooks/useEscapeToClose";
import { usePreviewClaudeImport, useImportClaudeProposals, type RawImportProposal } from "../../api/hooks/useProposals";

interface ImportDialogProps {
  athleteId: string;
  onClose: () => void;
}

interface PreviewRow {
  proposal: RawImportProposal;
  valid: boolean;
  errors: string[];
}

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

const TEXTAREA_STYLE: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "rgba(255,255,255,.04)",
  border: "1px solid var(--hair)",
  borderRadius: "var(--radius-sm)",
  padding: "10px 12px",
  color: "var(--ink)",
  font: "inherit",
  fontSize: ".84rem",
  resize: "vertical",
};

function describeImportProposal(p: RawImportProposal): string {
  const date = (p.payload?.plan_date as string | undefined) || "–";
  const title = (p.payload?.title as string | undefined) || "–";
  if (p.op === "add") return `Neu anlegen: ${title} (${date})`;
  if (p.op === "move") return `Verschieben nach ${date}`;
  if (p.op === "cancel") return "Ausfallen lassen";
  return `Ersetzen: ${title} (${date})`;
}

export function ImportDialog({ athleteId, onClose }: ImportDialogProps) {
  const [text, setText] = useState("");
  const [results, setResults] = useState<PreviewRow[] | null>(null);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewClaudeImport = usePreviewClaudeImport(athleteId);
  const { importProposals } = useImportClaudeProposals(athleteId);

  useEscapeToClose(onClose);

  function handleTextChange(next: string) {
    setText(next);
    setResults(null);
    setError("");
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => handleTextChange(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  function runCheck() {
    setError("");
    const result = previewClaudeImport(text);
    if (!result.ok) {
      setResults(null);
      setError(result.error?.message || "Prüfung fehlgeschlagen.");
      return;
    }
    setResults(result.results);
  }

  async function handleImport() {
    if (!results) return;
    const valid = results.filter((r) => r.valid).map((r) => r.proposal);
    setImporting(true);
    const result = await importProposals(valid);
    setImporting(false);
    if (!result.ok) {
      setError(result.error?.message || "Import fehlgeschlagen.");
      return;
    }
    onClose();
  }

  const validCount = results?.filter((r) => r.valid).length ?? 0;
  const importLabel = importing
    ? "⏳ …"
    : results
      ? `${validCount} von ${results.length} importieren`
      : "Importieren";

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
        style={{ width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", padding: "26px 24px" }}
      >
        <div style={{ fontFamily: "var(--font-disp)", fontWeight: 700, fontSize: "1rem", color: "var(--ink)" }}>
          Vorschläge importieren
        </div>
        <p style={{ margin: "8px 0 14px", fontSize: ".82rem", color: "var(--ink-3)" }}>
          Claudes komplette Antwort einfügen (Text + JSON-Block) oder als Datei hochladen.
        </p>

        <textarea
          rows={10}
          placeholder="Claudes Antwort hier einfügen …"
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          style={{ ...TEXTAREA_STYLE, fontFamily: "var(--font-mono)" }}
        />

        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.txt"
          style={{ marginTop: 10, fontSize: ".8rem", color: "var(--ink-3)" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />

        {error && <div style={{ color: "var(--danger)", fontSize: ".8rem", marginTop: 12 }}>{error}</div>}

        {results && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
            {!results.length && (
              <p style={{ color: "var(--ink-3)", fontSize: ".84rem", margin: 0 }}>
                Keine Vorschläge in der Antwort — Claude schlägt keine Änderung vor.
              </p>
            )}
            {results.map((r, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: "var(--radius-sm)",
                  background: "rgba(255,255,255,.03)",
                  border: `1px solid ${r.valid ? "var(--hair)" : "var(--danger)"}`,
                }}
              >
                <span aria-hidden="true">{r.valid ? "✅" : "❌"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: ".84rem", color: "var(--ink)" }}>
                    {r.proposal?.op ?? "?"} · {describeImportProposal(r.proposal)}
                  </div>
                  {r.proposal?.reason && (
                    <div style={{ fontSize: ".74rem", color: "var(--ink-3)", marginTop: 2 }}>{r.proposal.reason}</div>
                  )}
                  {!r.valid && (
                    <ul style={{ margin: "4px 0 0", paddingLeft: 18, color: "var(--danger)", fontSize: ".74rem" }}>
                      {r.errors.map((e, j) => (
                        <li key={j}>{e}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 20 }}>
          <button type="button" style={ROW_BTN_STYLE} onClick={runCheck} disabled={!text.trim()}>
            Prüfen
          </button>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              style={PRIMARY_BTN_STYLE}
              disabled={!results || validCount === 0 || importing}
              onClick={() => void handleImport()}
            >
              {importLabel}
            </button>
            <button type="button" style={ROW_BTN_STYLE} onClick={onClose}>
              Schließen
            </button>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

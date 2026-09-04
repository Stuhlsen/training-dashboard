/* ============================================================
   FEATURES/PLANNING/FTPRESCALEDIALOG.TSX — „FTP-Test erledigt — künftige
   Watt-Ziele anpassen?" (Fahrplan 8 E12, Entscheidung 24)

   Halbautomatischer Nachlauf nach einem gefahrenen FTP-Testtag: der Athlet
   tippt das Testergebnis ein, der Dialog rechnet nur `workout.watts` der
   künftigen Karten neu (`pct`/Struktur/TSS bleiben) und schreibt sie per
   `useRescaleFuturePlanWatts` sequenziell zurück.

   Overlay-/Sperr-Muster wie ShiftPlanDialog.tsx (`useEscapeToClose`,
   Klick-daneben, `submitting`/`locked`-Guards für Teil-Fehler). Reine
   Vorschau-Logik in ftp-rescale-dialog-view-model.ts.
   ============================================================ */

import { useState } from "react";
import { GlassCard } from "../../components/GlassCard";
import { useEscapeToClose } from "../../hooks/useEscapeToClose";
import { usePlanCards, useRescaleFuturePlanWatts } from "../../api/hooks/usePlanCards";
import { fmtDate, localISODate } from "../../core/format.js";
import { rescalePreviewRows } from "./ftp-rescale-dialog-view-model";

interface FtpRescaleDialogProps {
  athleteId: string;
  testDateISO: string;
  onClose: () => void;
}

const FTP_MIN = 80;
const FTP_MAX = 500;

const BTN_STYLE: React.CSSProperties = {
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
  ...BTN_STYLE,
  background: "var(--ss)",
  borderColor: "var(--ss)",
  color: "#17110a",
  fontWeight: 600,
};

const band = (b: [number, number] | null) => (b ? `${b[0]}–${b[1]} W` : "—");

export function FtpRescaleDialog({ athleteId, testDateISO, onClose }: FtpRescaleDialogProps) {
  const { data: cards } = usePlanCards(athleteId);
  const { rescale, isPending } = useRescaleFuturePlanWatts(athleteId);

  const [ftpText, setFtpText] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Ein Teil ist geschrieben, dann brach etwas ab: kein erneuter Versuch aus
  // diesem Dialog (der würde bereits umgerechnete Karten erneut anfassen).
  const [locked, setLocked] = useState(false);

  useEscapeToClose(onClose);

  const ftp = Number(ftpText);
  const ftpValid = ftpText.trim() !== "" && Number.isFinite(ftp) && ftp >= FTP_MIN && ftp <= FTP_MAX;
  const preview = rescalePreviewRows({
    cards: cards ?? [],
    newFtp: ftpValid ? ftp : NaN,
    todayISO: localISODate(),
  });
  const canApply = ftpValid && preview.affectedCount > 0 && !submitting && !locked && !isPending;

  async function handleApply() {
    if (!canApply) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await rescale(ftp);
      if (result.ok) {
        onClose();
        return;
      }
      setError(result.error?.message || "Umrechnung fehlgeschlagen.");
      if ((result as { updated?: number }).updated) setLocked(true);
    } finally {
      setSubmitting(false);
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
      <GlassCard variant="strong" radius="22px" style={{ width: "100%", maxWidth: 460, padding: "26px 24px" }}>
        <div style={{ fontFamily: "var(--font-disp)", fontWeight: 700, fontSize: "1rem", color: "var(--ink)" }}>
          Watt-Ziele nach FTP-Test anpassen
        </div>
        <p style={{ margin: "8px 0 16px", fontSize: ".82rem", color: "var(--ink-3)" }}>
          FTP-Test am {fmtDate(testDateISO)} erledigt. Neue FTP eintragen — die künftigen Einheiten
          bekommen daraus neu berechnete Watt-Ziele. Prozent-Ziele und Aufbau-Struktur bleiben
          unverändert.
        </p>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".82rem", color: "var(--ink-2)" }}>
          <input
            type="number"
            min={FTP_MIN}
            max={FTP_MAX}
            inputMode="numeric"
            value={ftpText}
            placeholder="z. B. 265"
            disabled={locked}
            onChange={(e) => setFtpText(e.target.value)}
            style={{
              width: 88,
              background: "rgba(255,255,255,.04)",
              border: "1px solid var(--hair)",
              borderRadius: "var(--radius-sm)",
              padding: "6px 8px",
              color: "var(--ink)",
              font: "inherit",
            }}
          />
          Watt neue FTP
        </label>

        <div style={{ marginTop: 16, fontSize: ".82rem", color: "var(--ink-2)", minHeight: 40 }}>
          {ftpValid ? (
            preview.affectedCount > 0 ? (
              <>
                <strong>{preview.affectedCount}</strong> künftige Einheit
                {preview.affectedCount === 1 ? "" : "en"} bekommen neue Watt-Ziele:
                <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "var(--ink-3)" }}>
                  {preview.rows.map((r, i) => (
                    <li key={i}>
                      {r.name}: {band(r.from)} → <strong style={{ color: "var(--ink-2)" }}>{band(r.to)}</strong>
                    </li>
                  ))}
                  {preview.affectedCount > preview.rows.length && (
                    <li>… und {preview.affectedCount - preview.rows.length} weitere</li>
                  )}
                </ul>
              </>
            ) : (
              <span style={{ color: "var(--ink-3)" }}>Keine künftige Einheit mit Watt-Ziel — nichts anzupassen.</span>
            )
          ) : (
            <span style={{ color: "var(--ink-3)" }}>
              FTP zwischen {FTP_MIN} und {FTP_MAX} W eingeben.
            </span>
          )}
        </div>

        {error && <div style={{ color: "var(--danger)", fontSize: ".8rem", marginTop: 8 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button type="button" style={BTN_STYLE} onClick={onClose} disabled={submitting}>
            {locked ? "Schließen & Plan prüfen" : "Abbrechen"}
          </button>
          {!locked && (
            <button
              type="button"
              style={PRIMARY_BTN_STYLE}
              disabled={!canApply}
              onClick={() => void handleApply()}
            >
              {submitting || isPending ? "⏳ …" : "Übernehmen"}
            </button>
          )}
        </div>
      </GlassCard>
    </div>
  );
}

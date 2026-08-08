/* ============================================================
   FEATURES/SETTINGS/FTPHISTORYSECTION.TSX — FTP-Historie (athletengated),
   Port von ui/settings-panel.js::buildFtpHistorySection()

   v1 (wie Vanilla): nur anlegen, keine Korrektur/Löschung bestehender
   Einträge — RLS erlaubt einem Athleten ohnehin nur Insert. Nur
   "ramp-test" als Quelle wählbar (Kommentar im Adapter-Hook).
   ============================================================ */

import { useState } from "react";
import { useFtpHistory, useSaveFtpEntry } from "../../api/hooks/useFtpHistory";
import { currentFtpEntry } from "../../core/ftp-history.js";
import { fmtDate, localISODate } from "../../core/format.js";
import { SECTION_STYLE, LABEL_STYLE, INPUT_STYLE, LINK_BUTTON_STYLE, HEADING_STYLE, ERROR_STYLE } from "./section-styles";
import type { FtpHistoryEntry } from "../../api/supabase/ftp-history";

const FTP_SOURCE_LABEL: Record<string, string> = { "ramp-test": "Ramp-Test", schaetzung: "Schätzung" };

export function FtpHistorySection() {
  const { entries, isLoading } = useFtpHistory();
  const { save, isPending } = useSaveFtpEntry();

  const [open, setOpen] = useState(false);
  const [ftpWatt, setFtpWatt] = useState("");
  const [validFrom, setValidFrom] = useState(localISODate());
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const current = currentFtpEntry(entries) as FtpHistoryEntry | null;
  // Neueste zuerst — entries kommt aufsteigend sortiert aus useFtpHistory().
  const sorted = [...entries].reverse();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const result = await save({ ftpWatt: Number(ftpWatt), validFrom, note: note || null });
    if (!result.ok) {
      // Häufigster Fall: unique(profile_id, valid_from) — zweiter Eintrag
      // für denselben Tag. Rohfehler ist zu technisch für den Athleten.
      setError(
        result.error?.message?.includes("ftp_history_profile_id_valid_from_key")
          ? "Für dieses Datum gibt es bereits einen Eintrag."
          : result.error?.message || "FTP-Eintrag konnte nicht gespeichert werden.",
      );
      return;
    }
    setFtpWatt("");
    setValidFrom(localISODate());
    setNote("");
    setOpen(false);
  }

  return (
    <div style={SECTION_STYLE}>
      <div style={HEADING_STYLE}>FTP-Historie</div>

      {isLoading && <p style={{ color: "var(--ink-3)", fontSize: ".78rem", margin: "0 0 10px" }}>Lädt …</p>}

      {!isLoading && sorted.length === 0 && (
        <p style={{ fontFamily: "var(--font-mono)", fontSize: ".65rem", color: "var(--ink-3)", margin: "0 0 10px" }}>
          Noch keine Einträge — bisher gilt die im Profil hinterlegte FTP.
        </p>
      )}

      {!isLoading && sorted.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
          {sorted.map((entry) => (
            <div key={entry.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: ".65rem", color: "var(--ink-3)" }}>
                ab {fmtDate(entry.validFrom)} · {FTP_SOURCE_LABEL[entry.source] ?? entry.source}
                {entry.id === current?.id ? " · aktuell" : ""}
              </span>
              <span style={{ fontFamily: "var(--font-disp)", fontWeight: 600, fontSize: ".8rem", color: "var(--ss)" }}>
                {entry.ftpWatt} W
              </span>
            </div>
          ))}
        </div>
      )}

      {!open && (
        <button type="button" onClick={() => setOpen(true)} style={LINK_BUTTON_STYLE}>
          + FTP eintragen
        </button>
      )}

      {open && (
        <form
          onSubmit={(e) => void handleSubmit(e)}
          style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}
        >
          <label style={LABEL_STYLE}>
            FTP (Watt), per Ramp-Test gemessen
            <input
              type="number"
              min={1}
              step={1}
              required
              value={ftpWatt}
              onChange={(e) => setFtpWatt(e.target.value)}
              style={INPUT_STYLE}
            />
          </label>
          <label style={LABEL_STYLE}>
            Gültig ab
            <input
              type="date"
              required
              max={localISODate()}
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
              style={INPUT_STYLE}
            />
          </label>
          <label style={LABEL_STYLE}>
            Notiz (optional)
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} style={INPUT_STYLE} />
          </label>
          {error && <div style={ERROR_STYLE}>{error}</div>}
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
        </form>
      )}
    </div>
  );
}

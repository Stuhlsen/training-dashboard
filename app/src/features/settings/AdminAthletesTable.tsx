/* ============================================================
   FEATURES/SETTINGS/ADMINATHLETESTABLE.TSX — Admin-Athletenübersicht
   (Fahrplan 17 E6, V4)

   Nur für `profile.isAdmin` gemountet (SettingsPage, neben
   InviteAthleteSection in derselben Karte). Lädt einmalig GET
   /admin/athletes (admin-api, Fahrplan 17 E5) und zeigt Anzeigename,
   E-Mail, Passwort-Status, letzten Login und "zuletzt geändert" als
   schlichte Tabelle — macht sichtbar, wer nach einer Einladung noch ohne
   gesetztes Passwort hängt (die Lücke, die diesen Fahrplan ausgelöst hat).
   ============================================================ */

import { useEffect, useState } from "react";
import { fetchAdminAthletes } from "../../api/admin-athletes";
import type { AdminAthleteRow, ResultError } from "../../api/types";
import { HEADING_STYLE, ERROR_STYLE } from "./section-styles";

const TABLE_STYLE = {
  width: "100%",
  borderCollapse: "collapse" as const,
  fontSize: ".78rem",
};

const TH_STYLE = {
  textAlign: "left" as const,
  fontFamily: "var(--font-mono)",
  fontSize: ".6rem",
  textTransform: "uppercase" as const,
  letterSpacing: ".06em",
  color: "var(--ink-3)",
  padding: "6px 10px 6px 0",
  borderBottom: "1px solid var(--hair)",
};

const TD_STYLE = {
  padding: "8px 10px 8px 0",
  borderBottom: "1px solid var(--hair)",
  color: "var(--ink)",
};

function fmtTimestamp(iso: string | null): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function translateError(error: ResultError): string {
  switch (error.code) {
    case "NETWORK":
      return "admin-api gerade nicht erreichbar — später erneut versuchen.";
    case "TOKEN_INVALID":
      return "Sitzung abgelaufen — bitte neu einloggen.";
    default:
      return error.message || "Laden fehlgeschlagen.";
  }
}

export function AdminAthletesTable() {
  const [rows, setRows] = useState<AdminAthleteRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAdminAthletes().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setError(translateError(result.error));
        return;
      }
      setRows(result.athletes);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={HEADING_STYLE}>Athleten</h3>
      {error && <p style={ERROR_STYLE}>{error}</p>}
      {!error && rows === null && (
        <p style={{ color: "var(--ink-3)", fontSize: ".78rem", margin: 0 }}>Lädt …</p>
      )}
      {rows && rows.length === 0 && (
        <p style={{ color: "var(--ink-3)", fontSize: ".78rem", margin: 0 }}>Noch keine Athleten.</p>
      )}
      {rows && rows.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={TABLE_STYLE}>
            <thead>
              <tr>
                <th style={TH_STYLE}>Anzeigename</th>
                <th style={TH_STYLE}>E-Mail</th>
                <th style={TH_STYLE}>Passwort</th>
                <th style={TH_STYLE}>Letzter Login</th>
                <th style={TH_STYLE}>Zuletzt geändert</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td style={TD_STYLE}>{row.displayName ?? "–"}</td>
                  <td style={TD_STYLE}>{row.email ?? "–"}</td>
                  <td style={{ ...TD_STYLE, color: row.hasPassword ? "var(--ink)" : "var(--danger)" }}>
                    {row.hasPassword ? "gesetzt" : "fehlt"}
                  </td>
                  <td style={TD_STYLE}>{fmtTimestamp(row.lastSignInAt)}</td>
                  <td style={TD_STYLE}>
                    {row.lastChangedAt
                      ? `${fmtTimestamp(row.lastChangedAt)}${row.lastChangedArea ? ` (${row.lastChangedArea})` : ""}`
                      : "–"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

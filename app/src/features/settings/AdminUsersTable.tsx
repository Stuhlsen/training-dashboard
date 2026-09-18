/* ============================================================
   FEATURES/SETTINGS/ADMINUSERSTABLE.TSX — Admin-Nutzerverwaltung
   (Fahrplan 17 E6, erweitert Fahrplan 18 E2 — ersetzt AdminAthletesTable.tsx)

   Nur für `profile.isAdmin` gemountet (SettingsPage, neben
   InviteAthleteSection in derselben Karte). Lädt GET /admin/users
   (admin-api, alle Rollen statt nur Athleten seit Fahrplan 18) und zeigt
   Anzeigename, E-Mail, Rolle, Passwort-Status, Sperr-Status, letzten Login
   und "zuletzt geändert". Je Zeile drei Aktionen gegen admin-api:
   Sperren/Entsperren (reversibel, kein Bestätigungsschritt), Löschen (Ziel-
   E-Mail eintippen, serverseitig geprüft — Muster wie „Account löschen" in
   AccountDeletionSection.tsx, dort ohne E-Mail-Eingabe weil es nur den
   eigenen Account betrifft), Link erneut senden (Invite- oder Recovery-Link
   as Fall des jeweiligen `hasPassword`-Stands, kein SMTP im Stack — Link
   wird wie beim Einladen selbst kopiert und verschickt).
   ============================================================ */

import { useCallback, useEffect, useState } from "react";
import { banUser, deleteUser, fetchAdminUsers, resendUserLink, unbanUser } from "../../api/admin-athletes";
import { useAuthUserId } from "../../api/hooks/useSession";
import type { AdminUserRow, ResultError } from "../../api/types";
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
  verticalAlign: "top" as const,
};

const ACTION_BUTTON_STYLE = {
  padding: "5px 12px",
  borderRadius: "var(--pill)",
  border: "1px solid var(--hair)",
  background: "transparent",
  color: "var(--ink)",
  fontSize: ".68rem",
  cursor: "pointer",
};

const DANGER_BUTTON_STYLE = {
  ...ACTION_BUTTON_STYLE,
  border: "1px solid var(--danger)",
  color: "var(--danger)",
};

const PRIMARY_DANGER_BUTTON_STYLE = {
  ...ACTION_BUTTON_STYLE,
  border: "none",
  background: "var(--danger)",
  color: "#2a0d0a",
  fontWeight: 600,
};

const LINK_BOX_STYLE = {
  display: "block",
  wordBreak: "break-all" as const,
  fontFamily: "var(--font-mono)",
  fontSize: ".68rem",
  color: "var(--ink)",
  background: "rgba(255,255,255,.04)",
  border: "1px solid var(--hair)",
  borderRadius: "var(--radius-sm)",
  padding: "6px 8px",
  marginTop: 6,
};

const ROW_ERROR_STYLE = { ...ERROR_STYLE, marginTop: 6 };

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

function roleLabel(row: AdminUserRow): string {
  const base = row.role === "coach" ? "Trainer" : "Athlet";
  return row.isAdmin ? `${base} · Admin` : base;
}

// bannedUntil steht bei einer aktiven Sperre praktisch in der Ferne
// (ban_duration "876000h", s. admin-api/users.js) — ein bloßes "gesetzt
// oder nicht" reicht, kein Dauer-Feld (Fahrplan 18 Nicht-Ziele).
function isBanned(row: AdminUserRow): boolean {
  return row.bannedUntil !== null;
}

function translateError(error: ResultError): string {
  switch (error.code) {
    case "NETWORK":
      return "admin-api gerade nicht erreichbar — später erneut versuchen.";
    case "TOKEN_INVALID":
      return "Sitzung abgelaufen — bitte neu einloggen.";
    default:
      return error.message || "Aktion fehlgeschlagen.";
  }
}

export function AdminUsersTable() {
  const ownUserId = useAuthUserId();
  const [rows, setRows] = useState<AdminUserRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null);
  const [resendResult, setResendResult] = useState<{ id: string; link: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteEmail, setDeleteEmail] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  const applyLoadResult = useCallback((result: Awaited<ReturnType<typeof fetchAdminUsers>>) => {
    if (!result.ok) {
      setLoadError(translateError(result.error));
      return;
    }
    setLoadError(null);
    setRows(result.users);
  }, []);

  // Fuer die Button-Handler (nach ban/unban/delete neu laden) — nicht direkt
  // im Mount-Effekt aufgerufen, s. Kommentar dort.
  const reload = useCallback(async () => {
    applyLoadResult(await fetchAdminUsers());
  }, [applyLoadResult]);

  useEffect(() => {
    // Bewusst kein reload() hier: eslint(react-hooks/set-state-in-effect)
    // erkennt darin einen synchronen setState-Aufruf im Effekt-Body. Der
    // .then()-Callback laeuft dagegen als eigener Mikrotask.
    let cancelled = false;
    fetchAdminUsers().then((result) => {
      if (!cancelled) applyLoadResult(result);
    });
    return () => {
      cancelled = true;
    };
  }, [applyLoadResult]);

  function closeAllPanels() {
    setResendResult(null);
    setDeleteConfirmId(null);
    setDeleteEmail("");
    setActionError(null);
  }

  async function handleBanToggle(row: AdminUserRow) {
    closeAllPanels();
    setBusyId(row.id);
    const result = isBanned(row) ? await unbanUser(row.id) : await banUser(row.id);
    setBusyId(null);
    if (!result.ok) {
      setActionError({ id: row.id, message: translateError(result.error) });
      return;
    }
    await reload();
  }

  function startDelete(row: AdminUserRow) {
    closeAllPanels();
    setDeleteConfirmId(row.id);
  }

  async function handleDeleteConfirm(row: AdminUserRow) {
    setDeleteBusy(true);
    const result = await deleteUser(row.id, deleteEmail.trim());
    setDeleteBusy(false);
    if (!result.ok) {
      setActionError({ id: row.id, message: translateError(result.error) });
      return;
    }
    setDeleteConfirmId(null);
    setDeleteEmail("");
    await reload();
  }

  async function handleResend(row: AdminUserRow) {
    closeAllPanels();
    setBusyId(row.id);
    const result = await resendUserLink(row.id);
    setBusyId(null);
    if (!result.ok) {
      setActionError({ id: row.id, message: translateError(result.error) });
      return;
    }
    const url = new URL("/onboarding/accept", window.location.origin);
    url.searchParams.set("token_hash", result.hashedToken);
    url.searchParams.set("type", result.type);
    setResendResult({ id: row.id, link: url.toString() });
  }

  async function handleCopy(id: string, link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(id);
    } catch {
      setActionError({ id, message: "Kopieren fehlgeschlagen — Link von Hand markieren." });
    }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={HEADING_STYLE}>Nutzer</h3>
      {loadError && <p style={ERROR_STYLE}>{loadError}</p>}
      {!loadError && rows === null && (
        <p style={{ color: "var(--ink-3)", fontSize: ".78rem", margin: 0 }}>Lädt …</p>
      )}
      {rows && rows.length === 0 && (
        <p style={{ color: "var(--ink-3)", fontSize: ".78rem", margin: 0 }}>Noch keine Nutzer.</p>
      )}
      {rows && rows.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={TABLE_STYLE}>
            <thead>
              <tr>
                <th style={TH_STYLE}>Anzeigename</th>
                <th style={TH_STYLE}>E-Mail</th>
                <th style={TH_STYLE}>Rolle</th>
                <th style={TH_STYLE}>Passwort</th>
                <th style={TH_STYLE}>Status</th>
                <th style={TH_STYLE}>Letzter Login</th>
                <th style={TH_STYLE}>Zuletzt geändert</th>
                <th style={TH_STYLE}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const banned = isBanned(row);
                const busy = busyId === row.id;
                const isSelf = ownUserId !== null && row.id === ownUserId;
                return (
                  <tr key={row.id}>
                    <td style={TD_STYLE}>{row.displayName ?? "–"}</td>
                    <td style={TD_STYLE}>{row.email ?? "–"}</td>
                    <td style={TD_STYLE}>{roleLabel(row)}</td>
                    <td style={{ ...TD_STYLE, color: row.hasPassword ? "var(--ink)" : "var(--danger)" }}>
                      {row.hasPassword ? "gesetzt" : "fehlt"}
                    </td>
                    <td style={{ ...TD_STYLE, color: banned ? "var(--danger)" : "var(--z1)" }}>
                      {banned ? "gesperrt" : "aktiv"}
                    </td>
                    <td style={TD_STYLE}>{fmtTimestamp(row.lastSignInAt)}</td>
                    <td style={TD_STYLE}>
                      {row.lastChangedAt
                        ? `${fmtTimestamp(row.lastChangedAt)}${row.lastChangedArea ? ` (${row.lastChangedArea})` : ""}`
                        : "–"}
                    </td>
                    <td style={TD_STYLE}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        <button
                          type="button"
                          disabled={busy || (isSelf && !banned)}
                          title={isSelf && !banned ? "Eigenen Account nicht selbst sperren" : undefined}
                          onClick={() => void handleBanToggle(row)}
                          style={{
                            ...(banned ? ACTION_BUTTON_STYLE : DANGER_BUTTON_STYLE),
                            opacity: busy || (isSelf && !banned) ? 0.6 : 1,
                            cursor: busy || (isSelf && !banned) ? "default" : "pointer",
                          }}
                        >
                          {banned ? "Entsperren" : "Sperren"}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleResend(row)}
                          style={{ ...ACTION_BUTTON_STYLE, opacity: busy ? 0.6 : 1, cursor: busy ? "default" : "pointer" }}
                        >
                          Link erneut senden
                        </button>
                        <button
                          type="button"
                          disabled={busy || isSelf}
                          title={isSelf ? "Eigenen Account nicht selbst löschen" : undefined}
                          onClick={() => startDelete(row)}
                          style={{
                            ...DANGER_BUTTON_STYLE,
                            opacity: busy || isSelf ? 0.6 : 1,
                            cursor: busy || isSelf ? "default" : "pointer",
                          }}
                        >
                          Löschen
                        </button>
                      </div>

                      {actionError?.id === row.id && <div style={ROW_ERROR_STYLE}>{actionError.message}</div>}

                      {resendResult?.id === row.id && (
                        <div>
                          <code style={LINK_BOX_STYLE}>{resendResult.link}</code>
                          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                            <button
                              type="button"
                              onClick={() => void handleCopy(row.id, resendResult.link)}
                              style={ACTION_BUTTON_STYLE}
                            >
                              {copiedId === row.id ? "Kopiert ✓" : "Link kopieren"}
                            </button>
                            <button type="button" onClick={closeAllPanels} style={ACTION_BUTTON_STYLE}>
                              Schließen
                            </button>
                          </div>
                        </div>
                      )}

                      {deleteConfirmId === row.id && (
                        <div
                          style={{
                            marginTop: 8,
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                            minWidth: 220,
                          }}
                        >
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: ".62rem", color: "var(--danger)" }}>
                            Zum Bestätigen die E-Mail eintippen: {row.email ?? "–"}
                          </span>
                          <input
                            type="email"
                            value={deleteEmail}
                            onChange={(e) => setDeleteEmail(e.target.value)}
                            style={{
                              background: "rgba(255,255,255,.04)",
                              border: "1px solid var(--hair)",
                              borderRadius: "var(--radius-sm)",
                              padding: "6px 8px",
                              color: "var(--ink)",
                              font: "inherit",
                              fontSize: ".78rem",
                            }}
                          />
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              type="button"
                              disabled={deleteBusy}
                              onClick={() => void handleDeleteConfirm(row)}
                              style={{
                                ...PRIMARY_DANGER_BUTTON_STYLE,
                                opacity: deleteBusy ? 0.7 : 1,
                                cursor: deleteBusy ? "default" : "pointer",
                              }}
                            >
                              {deleteBusy ? "Wird gelöscht …" : "Ja, endgültig löschen"}
                            </button>
                            <button
                              type="button"
                              onClick={closeAllPanels}
                              style={ACTION_BUTTON_STYLE}
                            >
                              Abbrechen
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

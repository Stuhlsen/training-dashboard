/* Tests: AdminUsersTable (Fahrplan 29 V3) — Verifizieren / Verifizierung entziehen:
 * Label, Aktion mit anschließendem Neuladen, Rückfrage beim Entzug, Fehleranzeige.
 * admin-api-Wrapper und Hooks sind gemockt; die Ban-/Löschen-Abläufe sind nicht Thema. */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminUserRow } from "../../api/types";

const fetchAdminUsersMock = vi.fn();
const verifyMock = vi.fn();
const unverifyMock = vi.fn();

vi.mock("../../api/admin-athletes", () => ({
  fetchAdminUsers: (...a: unknown[]) => fetchAdminUsersMock(...a),
  verifyAuthor: (...a: unknown[]) => verifyMock(...a),
  unverifyAuthor: (...a: unknown[]) => unverifyMock(...a),
  banUser: vi.fn(),
  unbanUser: vi.fn(),
  deleteUser: vi.fn(),
  resendUserLink: vi.fn(),
}));
vi.mock("../../api/hooks/useSession", () => ({ useAuthUserId: () => "admin-1" }));
vi.mock("../../hooks/useStreamerMode", () => ({ useStreamerMode: () => ({ enabled: false }) }));

const { AdminUsersTable } = await import("./AdminUsersTable");

function user(id: string, name: string, extra: Partial<AdminUserRow> = {}): AdminUserRow {
  return {
    id,
    email: `${name.toLowerCase()}@example.test`,
    displayName: name,
    role: "athlete",
    isAdmin: false,
    isVerifiedAuthor: false,
    hasPassword: true,
    bannedUntil: null,
    lastSignInAt: null,
    lastChangedAt: null,
    lastChangedArea: null,
    ...extra,
  };
}

const rowOf = (name: string) => screen.getByText(name).closest("tr") as HTMLElement;

beforeEach(() => {
  fetchAdminUsersMock.mockReset();
  verifyMock.mockReset();
  unverifyMock.mockReset();
  fetchAdminUsersMock.mockResolvedValue({ ok: true, users: [user("u1", "Anna"), user("u2", "Ben", { isVerifiedAuthor: true })] });
  verifyMock.mockResolvedValue({ ok: true, isVerifiedAuthor: true });
  unverifyMock.mockResolvedValue({ ok: true, isVerifiedAuthor: false });
});
afterEach(cleanup);

describe("AdminUsersTable — Verifizierte Autoren", () => {
  it("zeigt in der Rollenspalte, wer verifiziert ist", async () => {
    render(<AdminUsersTable />);
    await screen.findByText("Anna");
    expect(within(rowOf("Ben")).getByText("Athlet · Verifiziert")).toBeTruthy();
    expect(within(rowOf("Anna")).getByText("Athlet")).toBeTruthy();
  });

  it("bietet je Zeile 'Verifizieren' bzw. 'Verifizierung entziehen' an", async () => {
    render(<AdminUsersTable />);
    await screen.findByText("Anna");
    expect(within(rowOf("Anna")).getByRole("button", { name: "Anna verifizieren" }).textContent).toBe("Verifizieren");
    expect(within(rowOf("Ben")).getByRole("button", { name: "Verifizierung für Ben entziehen" }).textContent).toBe(
      "Verifizierung entziehen",
    );
  });

  it("'Verifizieren' ruft den Server mit der Nutzer-ID und lädt die Liste neu", async () => {
    render(<AdminUsersTable />);
    await screen.findByText("Anna");
    fetchAdminUsersMock.mockResolvedValue({
      ok: true,
      users: [user("u1", "Anna", { isVerifiedAuthor: true }), user("u2", "Ben", { isVerifiedAuthor: true })],
    });
    fireEvent.click(within(rowOf("Anna")).getByRole("button", { name: "Anna verifizieren" }));
    await waitFor(() => expect(verifyMock).toHaveBeenCalledWith("u1"));
    expect(await within(rowOf("Anna")).findByText("Athlet · Verifiziert")).toBeTruthy();
    expect(fetchAdminUsersMock).toHaveBeenCalledTimes(2);
  });

  it("der Entzug fragt zuerst nach und ändert noch nichts", async () => {
    render(<AdminUsersTable />);
    await screen.findByText("Anna");
    fireEvent.click(within(rowOf("Ben")).getByRole("button", { name: "Verifizierung für Ben entziehen" }));
    const group = screen.getByRole("group", { name: "Entzug bestätigen" });
    expect(group.textContent).toMatch(/Bereits freigegebene Rezepte bleiben freigegeben/);
    expect(unverifyMock).not.toHaveBeenCalled();
  });

  it("'Abbrechen' schließt die Rückfrage ohne Entzug", async () => {
    render(<AdminUsersTable />);
    await screen.findByText("Anna");
    fireEvent.click(within(rowOf("Ben")).getByRole("button", { name: "Verifizierung für Ben entziehen" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Entzug bestätigen" })).getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("group", { name: "Entzug bestätigen" })).toBeNull();
    expect(unverifyMock).not.toHaveBeenCalled();
  });

  it("'Ja, entziehen' ruft den Server und lädt die Liste neu", async () => {
    render(<AdminUsersTable />);
    await screen.findByText("Anna");
    fetchAdminUsersMock.mockResolvedValue({ ok: true, users: [user("u1", "Anna"), user("u2", "Ben")] });
    fireEvent.click(within(rowOf("Ben")).getByRole("button", { name: "Verifizierung für Ben entziehen" }));
    fireEvent.click(screen.getByRole("button", { name: "Ja, entziehen" }));
    await waitFor(() => expect(unverifyMock).toHaveBeenCalledWith("u2"));
    await waitFor(() => expect(within(rowOf("Ben")).queryByText("Athlet · Verifiziert")).toBeNull());
    expect(screen.queryByRole("group", { name: "Entzug bestätigen" })).toBeNull();
  });

  it("zeigt einen Serverfehler an der Zeile und lässt den Stand unverändert", async () => {
    verifyMock.mockResolvedValue({ ok: false, error: { code: "NETWORK", message: "x" } });
    render(<AdminUsersTable />);
    await screen.findByText("Anna");
    fireEvent.click(within(rowOf("Anna")).getByRole("button", { name: "Anna verifizieren" }));
    expect(await screen.findByText(/admin-api gerade nicht erreichbar/)).toBeTruthy();
    expect(within(rowOf("Anna")).queryByText("Athlet · Verifiziert")).toBeNull();
    expect(fetchAdminUsersMock).toHaveBeenCalledTimes(1);
  });

  it("ein Fehler beim Entzug lässt die Verifizierung stehen und meldet ihn", async () => {
    unverifyMock.mockResolvedValue({ ok: false, error: { code: "NETWORK", message: "Audit-Log nicht schreibbar" } });
    render(<AdminUsersTable />);
    await screen.findByText("Anna");
    fireEvent.click(within(rowOf("Ben")).getByRole("button", { name: "Verifizierung für Ben entziehen" }));
    fireEvent.click(screen.getByRole("button", { name: "Ja, entziehen" }));
    expect(await screen.findByText(/admin-api gerade nicht erreichbar/)).toBeTruthy();
    expect(within(rowOf("Ben")).getByText("Athlet · Verifiziert")).toBeTruthy();
  });

  it("ein Trainer-Konto kann ebenfalls verifiziert werden und zeigt die Rolle weiter an", async () => {
    fetchAdminUsersMock.mockResolvedValue({
      ok: true,
      users: [user("u3", "Cora", { role: "coach", isAdmin: true, isVerifiedAuthor: true })],
    });
    render(<AdminUsersTable />);
    expect(await screen.findByText("Trainer · Admin · Verifiziert")).toBeTruthy();
  });
});

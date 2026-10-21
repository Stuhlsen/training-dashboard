/* Tests: OnboardingGate bei fehlschlagendem Profil-Read (Live-Fund).
   Echter useProfileBasics + echter QueryClient, nur der Adapter
   getProfileBasics ist gemockt. Vorher: Fehler → Seite wieder aufbauen →
   Abruf neu → Lade-Bildschirm → Seite abbauen … endlos (dutzende 406/s). */

import { useState, type ReactNode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session, User } from "@supabase/supabase-js";
import { AuthContext, type AuthContextValue } from "../../api/auth/AuthContextValue";
import { createQueryClient } from "../../api/queryClient";
import { useProfileBasics } from "../../api/hooks/useProfile";

const getProfileBasics = vi.hoisted(() => vi.fn());
vi.mock("../../api/supabase/profiles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/supabase/profiles")>()),
  getProfileBasics,
}));
vi.mock("./OnboardingWizard", () => ({ OnboardingWizard: () => <p>Assistent</p> }));

const { OnboardingGate } = await import("./OnboardingGate");

afterEach(() => {
  cleanup();
  getProfileBasics.mockReset();
});

const USER = { id: "user-gone" } as User;

/** Auth wie im echten Provider: signOut setzt die Session auf null. */
function TestAuth({ children, signOutSpy }: { children: ReactNode; signOutSpy: () => void }) {
  const [session, setSession] = useState<Session | null>({ user: USER } as Session);
  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    loading: false,
    signIn: async () => ({ ok: false, error: { code: "UNKNOWN", message: "nicht im Test" } }),
    signOut: async () => {
      signOutSpy();
      setSession(null);
      return { ok: true };
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Wie die Hero-Seite: liest selbst auch die Profil-Grunddaten. */
function Page() {
  useProfileBasics();
  return <p>Seite</p>;
}

function Login() {
  const notice = (useLocation().state as { notice?: string } | null)?.notice ?? "–";
  return <p>Login {notice}</p>;
}

function renderGate(signOutSpy = vi.fn()) {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <TestAuth signOutSpy={signOutSpy}>
        <MemoryRouter initialEntries={["/app"]}>
          <Routes>
            <Route path="/app/login" element={<Login />} />
            <Route path="/app" element={<OnboardingGate />}>
              <Route index element={<Page />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </TestAuth>
    </QueryClientProvider>,
  );
  return signOutSpy;
}

const settle = () => new Promise((r) => setTimeout(r, 150));

describe("OnboardingGate — Profil-Read schlägt fehl", () => {
  it("Login ohne Profil (NO_DATA): abmelden, Login-Seite mit Hinweis, keine Abruf-Schleife", async () => {
    getProfileBasics.mockResolvedValue({ ok: false, error: { code: "NO_DATA", message: "kein Profil" } });
    const signOut = renderGate();

    expect(await screen.findByText("Login account-missing")).toBeTruthy();
    expect(signOut).toHaveBeenCalledTimes(1);
    await settle();
    expect(getProfileBasics.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it("anderer Fehler: Seite bleibt offen (fail open) und lädt nicht endlos neu", async () => {
    getProfileBasics.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "Netz weg" } });
    const signOut = renderGate();

    expect(await screen.findByText("Seite")).toBeTruthy();
    await settle();
    await waitFor(() => expect(screen.getByText("Seite")).toBeTruthy());
    expect(getProfileBasics.mock.calls.length).toBeLessThanOrEqual(3);
    expect(signOut).not.toHaveBeenCalled();
  });
});

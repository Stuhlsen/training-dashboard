/* Tests: Hinweis auf der Login-Seite nach einem Login ohne Profil
   (OnboardingGate leitet mit state.notice hierher). */

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { AuthContext, type AuthContextValue } from "../../api/auth/AuthContextValue";
import { LoginPage } from "./LoginPage";
import { ACCOUNT_MISSING_NOTICE } from "./login-notice";

afterEach(cleanup);

const LOGGED_OUT: AuthContextValue = {
  session: null,
  user: null,
  loading: false,
  signIn: async () => ({ ok: false, error: { code: "UNKNOWN", message: "nicht im Test" } }),
  signOut: async () => ({ ok: true }),
};

function renderLogin(state?: unknown) {
  render(
    <AuthContext.Provider value={LOGGED_OUT}>
      <MemoryRouter initialEntries={[{ pathname: "/app/login", state }]}>
        <LoginPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("LoginPage — Hinweis bei Login ohne Profil", () => {
  it("zeigt den Hinweis genau einmal", () => {
    renderLogin({ notice: ACCOUNT_MISSING_NOTICE });
    expect(screen.getAllByText(/Du wurdest abgemeldet. Bitte melde dich neu an./)).toHaveLength(1);
  });

  it("ohne notice kein Hinweis", () => {
    renderLogin();
    expect(screen.queryByText(/Du wurdest abgemeldet/)).toBeNull();
  });
});

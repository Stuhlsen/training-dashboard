import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { EnvBadge } from "./EnvBadge";

function setLocation(hostname: string, port = "") {
  vi.stubGlobal("location", { hostname, port } as Location);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete window.__RUNTIME_CONFIG__;
});

describe("EnvBadge", () => {
  it('zeigt im Demo-Modus "Demo" in der entwarnenden Farbe', () => {
    setLocation("localhost", "5173");
    window.__RUNTIME_CONFIG__ = { env: "demo", supabaseUrl: "http://localhost:8000", supabaseAnonKey: "k" };
    render(<EnvBadge />);
    const badge = screen.getByTestId("env-badge");
    expect(badge.textContent).toBe("Demo");
    expect(badge.style.color).toBe("var(--ok)");
  });

  it('zeigt "dev" auf localhost ohne Laufzeit-Config (Warnfarbe)', () => {
    setLocation("localhost");
    render(<EnvBadge />);
    const badge = screen.getByTestId("env-badge");
    expect(badge.textContent).toBe("dev");
    expect(badge.style.color).toBe("var(--warn)");
  });

  it("bleibt in Prod unsichtbar", () => {
    setLocation("localhost", "8080");
    window.__RUNTIME_CONFIG__ = { env: "prod", supabaseUrl: "https://x.example.com", supabaseAnonKey: "k" };
    render(<EnvBadge />);
    expect(screen.queryByTestId("env-badge")).toBeNull();
  });
});

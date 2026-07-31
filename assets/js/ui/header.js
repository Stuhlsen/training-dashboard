import { onSessionChange, signOut, isSupabaseConfigured } from "../state/session.js";
import { openModal } from "./auth-modal.js";
import { openPanel } from "./settings-panel.js";
import { el } from "./dom.js";

const LOGIN_BTN_STYLE = `
  display: inline-flex; align-items: center; gap: 6px;
  border: 1px solid var(--border-light); border-radius: 999px;
  background: transparent; padding: 6px 14px; cursor: pointer;
  font-family: var(--font-disp); font-size: 0.75rem; color: var(--dim);
`;
const SETTINGS_BTN_STYLE = `
  display: inline-flex; align-items: center; justify-content: center;
  background: transparent; border: none; cursor: pointer;
  color: var(--dim); font-size: 1.05rem; padding: 4px;
`;
const LOGOUT_BTN_STYLE = `
  display: inline-flex; align-items: center; gap: 5px;
  background: transparent; border: none; cursor: pointer;
  font-family: var(--font-mono); font-size: 0.62rem; color: var(--dim2);
`;

function renderLoggedOut(wrap) {
  wrap.innerHTML = `
    <button id="topbar-login-btn" style="${LOGIN_BTN_STYLE}">
      <i class="ti ti-user"></i> Anmelden
    </button>
  `;
  wrap.querySelector("#topbar-login-btn").addEventListener("click", openModal);
}

function renderLoggedIn(wrap, user) {
  wrap.innerHTML = `
    <div style="display:flex; align-items:center; gap:12px;">
      <span style="font-family: var(--font-mono); font-size: 0.68rem; color: var(--dim);">
        eingeloggt als <span id="topbar-username" style="font-family: var(--font-disp); color: var(--accent);"></span>
      </span>
      <button id="topbar-settings-btn" title="Einstellungen" style="${SETTINGS_BTN_STYLE}">
        <i class="ti ti-settings"></i>
      </button>
      <button id="topbar-logout-btn" style="${LOGOUT_BTN_STYLE}">
        <i class="ti ti-logout"></i> Abmelden
      </button>
    </div>
  `;
  // displayName ist nutzergesteuert (öffentlich lesbar) → textContent statt
  // innerHTML-Interpolation, um Stored-XSS über den Anzeigenamen auszuschließen.
  wrap.querySelector("#topbar-username").textContent = user.displayName || "";

  const settingsBtn = wrap.querySelector("#topbar-settings-btn");
  settingsBtn.addEventListener("mouseenter", () => (settingsBtn.style.color = "var(--accent)"));
  settingsBtn.addEventListener("mouseleave", () => (settingsBtn.style.color = "var(--dim)"));
  settingsBtn.addEventListener("click", openPanel);

  wrap.querySelector("#topbar-logout-btn").addEventListener("click", () => signOut());
}

function render(user) {
  const wrap = el("topbar-auth");
  if (!wrap) return;
  // Kein Supabase-Host (z.B. dashboard-prod vor Phase-1-Merge) → Auth-UI
  // bleibt unsichtbar statt einen dauerhaft fehlschlagenden Login anzubieten.
  if (!isSupabaseConfigured) {
    wrap.innerHTML = "";
    return;
  }
  if (user) renderLoggedIn(wrap, user);
  else renderLoggedOut(wrap);
}

// Kein sofortiges render(getSession()) hier: initSession() (app.js) läuft
// erst nach renderAll() und currentUser ist bis dahin immer null — ein
// sofortiger Render würde bei bereits eingeloggten Rückkehrern kurz
// "Anmelden" zeigen und dann auf "eingeloggt als …" umspringen. Der Topbar-
// Container bleibt leer, bis onSessionChange den ersten echten Zustand liefert.
onSessionChange(render);

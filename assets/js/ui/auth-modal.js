import { signIn } from "../data-access/supabase/auth.js";

let overlay = null;
let errorEl = null;
let emailInput = null;
let passwordInput = null;

function build() {
  overlay = document.createElement("div");
  overlay.id = "auth-modal-overlay";
  overlay.style.cssText = `
    position: fixed; inset: 0; background: rgba(7,9,14,0.75);
    display: flex; align-items: center; justify-content: center;
    z-index: 1000;
  `;

  const modal = document.createElement("div");
  modal.style.cssText = `
    background: #141924; border: 1px solid rgba(255,255,255,0.18);
    border-radius: 22px; padding: 26px 24px; width: 100%; max-width: 320px;
  `;

  modal.innerHTML = `
    <div style="font-family: var(--font-disp); font-weight: 700; font-size: 1rem; color: var(--text);">
      Anmelden
    </div>
    <div style="font-family: var(--font-mono); font-size: 0.64rem; text-transform: uppercase; color: var(--dim2); margin-top: 4px;">
      Training Dashboard
    </div>
    <form id="auth-modal-form" style="margin-top: 18px; display: flex; flex-direction: column; gap: 12px;">
      <label style="display: flex; flex-direction: column; gap: 6px;">
        <span style="font-family: var(--font-mono); font-size: 0.64rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--dim);">E-Mail</span>
        <input type="email" id="auth-modal-email" autocomplete="email" required
          style="background: rgba(255,255,255,0.05); border: 1px solid var(--border); border-radius: 12px; color: var(--text); font-family: var(--font-body); font-size: 0.85rem; padding: 9px 12px;">
      </label>
      <label style="display: flex; flex-direction: column; gap: 6px;">
        <span style="font-family: var(--font-mono); font-size: 0.64rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--dim);">Passwort</span>
        <input type="password" id="auth-modal-password" autocomplete="current-password" required
          style="background: rgba(255,255,255,0.05); border: 1px solid var(--border); border-radius: 12px; color: var(--text); font-family: var(--font-body); font-size: 0.85rem; padding: 9px 12px;">
      </label>
      <div id="auth-modal-error" style="color: var(--red); font-family: var(--font-mono); font-size: 0.75rem; min-height: 1em;"></div>
      <div style="display: flex; gap: 10px; margin-top: 4px;">
        <button type="submit" class="btn-primary" style="flex: 1;">Anmelden</button>
        <button type="button" id="auth-modal-cancel"
          style="flex: 1; background: transparent; border: 1px solid var(--border); border-radius: 999px; color: var(--dim); font-family: var(--font-body); cursor: pointer;">
          Abbrechen
        </button>
      </div>
    </form>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  errorEl = modal.querySelector("#auth-modal-error");
  emailInput = modal.querySelector("#auth-modal-email");
  passwordInput = modal.querySelector("#auth-modal-password");

  modal.querySelectorAll("input").forEach((input) => {
    input.addEventListener("focus", () => {
      input.style.borderColor = "var(--accent)";
    });
    input.addEventListener("blur", () => {
      input.style.borderColor = "var(--border)";
    });
  });

  modal.querySelector("#auth-modal-cancel").addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });

  modal.querySelector("#auth-modal-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.textContent = "";
    const { user, error } = await signIn(emailInput.value, passwordInput.value);
    if (error) {
      errorEl.textContent = error;
      return;
    }
    if (user) closeModal();
  });
}

function onKeydown(e) {
  if (e.key === "Escape") closeModal();
}

export function openModal() {
  if (!overlay) build();
  errorEl.textContent = "";
  passwordInput.value = "";
  overlay.style.display = "flex";
  document.addEventListener("keydown", onKeydown);
  emailInput.focus();
}

export function closeModal() {
  if (!overlay) return;
  overlay.style.display = "none";
  document.removeEventListener("keydown", onKeydown);
}

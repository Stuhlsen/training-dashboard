/* ============================================================
   UI/NAV.JS — Tab-Navigation & Chart-Gruppen-Toggle
   Ersetzt window._activateTab und die früheren Inline-onclick-
   Handler in index.html (mit ES-Modulen nicht mehr möglich).
   ============================================================ */

import { el } from "./dom.js";

let validTabs = [];

/** Aktiviert einen Tab (mit Fallback auf den ersten gültigen)
 *  @param {string} tabId */
export function activateTab(tabId) {
  if (!validTabs.includes(tabId)) tabId = validTabs[0];
  document
    .querySelectorAll(".tab-btn")
    .forEach((b) => b.classList.toggle("active", b.dataset.tab === tabId));
  document.querySelectorAll(".tab-content").forEach((s) => s.classList.add("hidden"));
  const target = el("tab-" + tabId);
  if (target) target.classList.remove("hidden");
  history.replaceState(null, "", "#" + tabId);
}

/** Registriert Klick-Handler auf allen Tab-Buttons */
export function initTabs() {
  const btns = document.querySelectorAll(".tab-btn");
  validTabs = Array.from(btns).map((b) => b.dataset.tab);
  btns.forEach((btn) => {
    btn.addEventListener("click", () => activateTab(btn.dataset.tab));
  });
}

/** Auf-/Zuklappen der Chart-Gruppen im Charts-Tab
 *  (früher: onclick="toggleChartGroup(this)" in index.html) */
export function initChartGroupToggles() {
  document.querySelectorAll(".chart-group-header").forEach((header) => {
    header.addEventListener("click", () => {
      const body = header.nextElementSibling;
      const icon = header.querySelector(".toggle-icon");
      const isOpen = body.classList.contains("open");
      body.classList.toggle("open");
      if (icon) icon.style.transform = isOpen ? "" : "rotate(180deg)";
    });
  });
}

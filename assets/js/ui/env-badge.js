/* ============================================================
   UI/ENV-BADGE.JS — Umgebungsmarkierung im Header (C5.4)

   Zeigt eine dezente Badge im Topbar, wenn NICHT prod — dev und prod
   starten mit identischen Zugangsdaten (config.js ist der einzige
   Unterschied), und es wird regelmäßig mit echten Daten in dev getestet.

   Bewusst NICHT reaktiv über onSessionChange wie ui/header.js: die
   Umgebung ist hostnamebasiert und ändert sich nie während einer Session,
   einmaliges Rendern beim Modul-Laden reicht.
   ============================================================ */

import { getEnvironment } from "../state/session.js";
import { el } from "./dom.js";

function render() {
  const wrap = el("topbar-env-badge");
  if (!wrap) return;
  const env = getEnvironment();
  if (env === "prod") {
    wrap.innerHTML = "";
    return;
  }
  const label = document.createElement("span");
  label.className = "tag tag-env";
  label.textContent = env.toUpperCase();
  wrap.innerHTML = "";
  wrap.appendChild(label);
}

render();

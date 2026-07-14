import {
  getSession,
  onSessionChange,
  isAthlete,
  updateDisplayName,
  updateWellbeingPublic,
} from "../state/session.js";
import { getGoals, saveGoal, deactivateGoal } from "../state/goals.js";
import { CONFIG } from "../state/config.js";
import { Data } from "../state/data.js";
import { fmtDate } from "../core/format.js";
import { log } from "./log.js";

let panel = null;
let isOpen = false;

function initials(name) {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

/** Zeigt kurz ein ✓ neben `anchor`, verschwindet nach 1.5s */
function flashSaved(anchor) {
  if (!anchor) return;
  const check = document.createElement("span");
  check.textContent = "✓";
  check.style.cssText =
    "color: var(--green); margin-left: 6px; font-family: var(--font-mono); font-size: 0.75rem;";
  anchor.appendChild(check);
  setTimeout(() => check.remove(), 1500);
}

function buildProfileSection(user) {
  const section = document.createElement("div");
  section.style.cssText = "padding: 18px 16px; border-bottom: 1px solid var(--border);";

  section.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
      <div id="settings-avatar" style="flex-shrink:0; width:34px; height:34px; border-radius:50%;
        background: var(--accent-dim); border: 1px solid rgba(224,138,60,0.3); color: var(--accent);
        display:flex; align-items:center; justify-content:center;
        font-family: var(--font-disp); font-weight:700; font-size:0.75rem;"></div>
      <div style="flex:1; min-width:0;">
        <label style="display:block; font-family: var(--font-mono); font-size:0.62rem;
          text-transform:uppercase; letter-spacing:0.06em; color: var(--dim); margin-bottom:4px;">Name</label>
        <span id="settings-name-feedback" style="display:inline-flex; align-items:center; width:100%;">
          <input id="settings-name-input" type="text" style="width:100%; background: rgba(255,255,255,0.05);
            border:1px solid var(--border); border-radius:8px; color: var(--text);
            font-family: var(--font-body); font-size:0.82rem; padding: 5px 8px;">
        </span>
      </div>
    </div>
    ${
      isAthlete()
        ? `<div style="display:flex; align-items:center; justify-content:space-between;">
            <span style="font-family: var(--font-mono); font-size:0.65rem; color: var(--dim);">Befinden öffentlich</span>
            <button id="settings-wellbeing-toggle" type="button" style="width:36px; height:20px; border-radius:999px;
              border:none; cursor:pointer; position:relative; background: rgba(255,255,255,0.10); transition: background 0.15s;">
              <span style="position:absolute; top:2px; left:2px; width:16px; height:16px; border-radius:50%;
                background:#fff; transition: transform 0.15s;"></span>
            </button>
          </div>`
        : ""
    }
  `;

  section.querySelector("#settings-avatar").textContent = initials(user.displayName);

  const nameInput = section.querySelector("#settings-name-input");
  nameInput.value = user.displayName || "";
  nameInput.addEventListener("blur", async () => {
    const name = nameInput.value.trim();
    if (!name || name === user.displayName) return;
    const result = await updateDisplayName(name);
    if (!result.error) flashSaved(section.querySelector("#settings-name-feedback"));
  });

  if (isAthlete()) {
    let wellbeingOn = !!user.wellbeingPublic;
    const toggle = section.querySelector("#settings-wellbeing-toggle");
    const knob = toggle.querySelector("span");
    const applyToggleState = () => {
      toggle.style.background = wellbeingOn ? "var(--accent)" : "rgba(255,255,255,0.10)";
      knob.style.transform = wellbeingOn ? "translateX(16px)" : "translateX(0)";
    };
    applyToggleState();
    toggle.addEventListener("click", async () => {
      wellbeingOn = !wellbeingOn;
      applyToggleState();
      await updateWellbeingPublic(wellbeingOn);
    });
  }

  return section;
}

function goalUnitLabel(kind) {
  return kind === "ftp" || kind === "watt" ? "W" : "";
}

async function buildGoalsSection() {
  const section = document.createElement("div");
  section.style.cssText = "padding: 18px 16px; border-bottom: 1px solid var(--border);";

  const list = document.createElement("div");
  list.style.cssText = "display:flex; flex-direction:column; gap:8px; margin-bottom:10px;";

  async function renderList() {
    list.innerHTML = "";
    const result = await getGoals();
    if (!result.ok) {
      log.warn("Ziele konnten nicht geladen werden:", result.error);
      const errEl = document.createElement("div");
      errEl.textContent = "Ziele konnten nicht geladen werden.";
      errEl.style.cssText = "font-family: var(--font-mono); font-size:0.65rem; color: var(--red);";
      list.appendChild(errEl);
      return;
    }
    for (const goal of result.goals) {
      const item = document.createElement("div");
      item.style.cssText =
        "display:flex; align-items:center; justify-content:space-between; cursor:pointer; padding:6px 8px; border-radius:8px;";
      item.title = "Klicken zum Deaktivieren";
      item.innerHTML = `
        <span style="font-family: var(--font-mono); font-size:0.65rem; color: var(--dim);"></span>
        <span style="font-family: var(--font-disp); font-weight:600; font-size:0.8rem; color: var(--accent);"></span>
      `;
      item.children[0].textContent = goal.kind + (goal.targetDate ? ` · ${fmtDate(goal.targetDate)}` : "");
      item.children[1].textContent = goal.targetValue != null ? `${goal.targetValue}${goalUnitLabel(goal.kind)}` : "";
      item.addEventListener("mouseenter", () => (item.style.background = "rgba(255,255,255,0.04)"));
      item.addEventListener("mouseleave", () => (item.style.background = "transparent"));
      item.addEventListener("click", async () => {
        await deactivateGoal(goal.id);
        renderList();
      });
      list.appendChild(item);
    }
  }

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.textContent = "+ Ziel hinzufügen";
  addBtn.style.cssText =
    "background:none; border:none; cursor:pointer; font-family: var(--font-mono); font-size:0.62rem; color: var(--accent); padding:0;";

  const form = document.createElement("form");
  form.style.cssText = "display:none; flex-direction:column; gap:8px; margin-top:10px;";
  const inputStyle =
    "width:100%; background: rgba(255,255,255,0.05); border:1px solid var(--border); border-radius:8px; color: var(--text); font-family: var(--font-body); font-size:0.8rem; padding: 5px 8px;";
  form.innerHTML = `
    <input name="kind" type="text" placeholder="Art (z. B. FTP)" required style="${inputStyle}">
    <input name="targetValue" type="number" placeholder="Zielwert" step="any" style="${inputStyle}">
    <input name="targetDate" type="date" style="${inputStyle}">
    <input name="note" type="text" placeholder="Notiz (optional)" style="${inputStyle}">
    <button type="submit" class="btn-primary" style="align-self:flex-start;">Speichern</button>
  `;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const result = await saveGoal({
      kind: fd.get("kind"),
      targetValue: fd.get("targetValue") ? Number(fd.get("targetValue")) : null,
      targetDate: fd.get("targetDate") || null,
      note: fd.get("note") || null,
    });
    if (!result.error) {
      form.reset();
      form.style.display = "none";
      addBtn.style.display = "";
      renderList();
    }
  });

  addBtn.addEventListener("click", () => {
    form.style.display = "flex";
    addBtn.style.display = "none";
  });

  section.appendChild(list);
  section.appendChild(addBtn);
  section.appendChild(form);
  await renderList();
  return section;
}

/** Letztes Datum über alle Fahrten/Wellness-Einträge des aktiven Athleten —
 *  window.__dashboardData aus dem Briefing existiert nicht im Datenmodell,
 *  daher Näherung über den vorhandenen Data-Store statt pro Quelle exakt. */
function latestDataDate() {
  const dates = [
    ...Data.rides.map((r) => r.dateISO),
    ...Data.wellness.map((w) => w.dateISO),
  ].filter(Boolean);
  if (!dates.length) return null;
  return dates.reduce((a, b) => (a > b ? a : b));
}

function buildDataSourcesSection() {
  const section = document.createElement("div");
  section.style.cssText = "padding: 18px 16px;";

  // Es gibt keine Verknüpfung zwischen dem Supabase-Login und einer
  // CONFIG.athletes-ID — diese Sektion zeigt zwangsläufig die Quellen des
  // gerade im Dashboard angezeigten Athleten (Athleten-Toggle), nicht
  // zwingend die des eingeloggten Users. Label macht das explizit, statt
  // "meine Datenquellen" zu suggerieren.
  const ac = CONFIG.athleteConfig(Data.activeAthleteId);
  const athleteName = CONFIG.athletes.find((a) => a.id === Data.activeAthleteId)?.name || "";
  const sources = ac?.dataSources || [];
  const lastDate = latestDataDate();

  section.innerHTML = `
    <div style="font-family: var(--font-mono); font-size:0.62rem; text-transform:uppercase;
      letter-spacing:0.06em; color: var(--dim); margin-bottom:10px;"></div>
  `;
  section.firstElementChild.textContent = `Datenquellen · ${athleteName}`;
  const list = document.createElement("div");
  list.style.cssText = "display:flex; flex-direction:column; gap:8px;";
  for (const src of sources) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex; align-items:center; gap:8px;";
    row.innerHTML = `
      <span style="width:6px; height:6px; border-radius:50%; background: var(--green); flex-shrink:0;"></span>
      <span style="font-family: var(--font-body); font-size:0.8rem; color: var(--text);"></span>
      <span style="font-family: var(--font-mono); font-size:0.62rem; color: var(--dim2); margin-left:auto;"></span>
    `;
    row.children[1].textContent = src;
    row.children[2].textContent = lastDate ? fmtDate(lastDate) : "–";
    list.appendChild(row);
  }
  section.appendChild(list);
  return section;
}

async function buildPanelContent(user) {
  const content = document.createElement("div");
  content.appendChild(buildProfileSection(user));
  if (isAthlete()) {
    content.appendChild(await buildGoalsSection());
    content.appendChild(buildDataSourcesSection());
  }
  return content;
}

function build() {
  panel = document.createElement("div");
  panel.id = "settings-panel";
  panel.style.cssText = `
    position: fixed; right: 0; top: 0; height: 100vh; width: 260px;
    background: #141924; border-left: 1px solid rgba(255,255,255,0.18);
    transform: translateX(100%); transition: transform 0.2s ease;
    overflow-y: auto; z-index: 999;
  `;
  document.body.appendChild(panel);
}

function onKeydown(e) {
  if (e.key === "Escape") closePanel();
}

export async function openPanel() {
  const user = getSession();
  if (!user) return;
  if (!panel) build();
  panel.innerHTML = "";
  panel.appendChild(await buildPanelContent(user));
  panel.style.transform = "translateX(0)";
  isOpen = true;
  document.addEventListener("keydown", onKeydown);
}

export function closePanel() {
  if (!panel) return;
  panel.style.transform = "translateX(100%)";
  isOpen = false;
  document.removeEventListener("keydown", onKeydown);
}

onSessionChange((user) => {
  if (!user && isOpen) closePanel();
});

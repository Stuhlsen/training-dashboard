import {
  getSession,
  onSessionChange,
  isAthlete,
  updateDisplayName,
  updateWellbeingPublic,
  updatePassword,
} from "../state/session.js";
import { getGoals, saveGoal, deactivateGoal } from "../state/goals.js";
import { getFtpHistory, saveFtpEntry } from "../state/ftp-history.js";
import { getSessionFormats, getAthleteFormats, setAthleteFormatActive } from "../state/formats.js";
import { CONFIG } from "../state/config.js";
import { Data } from "../state/data.js";
import { fmtDate, localISODate } from "../core/format.js";
import { currentFtpEntry } from "../core/ftp-history.js";
import { log } from "./log.js";
import { openDialog as openCheckinDialog } from "./checkin-dialog.js";

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
          <input id="settings-name-input" type="text" class="glass-input">
        </span>
      </div>
    </div>
    ${
      isAthlete()
        ? `<div style="display:flex; flex-direction:column; gap:10px;">
            <button type="button" id="settings-open-checkin" style="align-self:flex-start; background:none;
              border:none; cursor:pointer; font-family: var(--font-mono); font-size:0.62rem; color: var(--accent); padding:0;">
              Befinden anpassen
            </button>
            <div style="display:flex; align-items:center; justify-content:space-between;">
              <span style="font-family: var(--font-mono); font-size:0.65rem; color: var(--dim);">Befinden öffentlich</span>
              <button id="settings-wellbeing-toggle" type="button" style="width:36px; height:20px; border-radius:999px;
                border:none; cursor:pointer; position:relative; background: rgba(255,255,255,0.10); transition: background 0.15s;">
                <span style="position:absolute; top:2px; left:2px; width:16px; height:16px; border-radius:50%;
                  background:#fff; transition: transform 0.15s;"></span>
              </button>
            </div>
          </div>`
        : ""
    }
  `;

  section.querySelector("#settings-avatar").textContent = initials(user.displayName);

  const nameInput = section.querySelector("#settings-name-input");
  nameInput.value = user.displayName || "";
  nameInput.addEventListener("blur", async () => {
    const name = nameInput.value.trim();
    if (!name) {
      // Leeres Feld ist kein gültiger Name — zurücksetzen statt visuell leer
      // stehen zu lassen, während der Server noch den alten Namen hat.
      nameInput.value = user.displayName || "";
      return;
    }
    if (name === user.displayName) return;
    const result = await updateDisplayName(name);
    if (result.ok) flashSaved(section.querySelector("#settings-name-feedback"));
  });

  if (isAthlete()) {
    section.querySelector("#settings-open-checkin").addEventListener("click", () => {
      closePanel();
      openCheckinDialog();
    });

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
  form.innerHTML = `
    <input name="kind" type="text" placeholder="Art (z. B. FTP)" required class="glass-input">
    <input name="targetValue" type="number" placeholder="Zielwert" step="any" class="glass-input">
    <input name="targetDate" type="date" class="glass-input">
    <input name="note" type="text" placeholder="Notiz (optional)" class="glass-input">
    <div id="settings-goal-error" style="font-family: var(--font-mono); font-size:0.62rem; color: var(--red); min-height:1em;"></div>
    <button type="submit" class="btn-primary" style="align-self:flex-start;">Speichern</button>
  `;
  const goalErrorEl = form.querySelector("#settings-goal-error");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    goalErrorEl.textContent = "";
    const fd = new FormData(form);
    const result = await saveGoal({
      kind: fd.get("kind"),
      targetValue: fd.get("targetValue") ? Number(fd.get("targetValue")) : null,
      targetDate: fd.get("targetDate") || null,
      note: fd.get("note") || null,
    });
    if (!result.ok) {
      goalErrorEl.textContent = "Ziel konnte nicht gespeichert werden.";
      return;
    }
    form.reset();
    form.style.display = "none";
    addBtn.style.display = "";
    renderList();
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

const FTP_SOURCE_LABEL = { "ramp-test": "Ramp-Test", schaetzung: "Schätzung" };

/** v1 (Auftrag "FTP als gepflegte, zeitpunktbezogene Historie", Schritt 4):
 *  nur anlegen, keine Korrektur/Löschung bestehender Einträge — RLS
 *  (Migration 0009) würde ein Update/Delete durch den Athleten ohnehin
 *  nicht erlauben, s. dortige Policies. */
async function buildFtpHistorySection() {
  const section = document.createElement("div");
  section.style.cssText = "padding: 18px 16px; border-bottom: 1px solid var(--border);";

  const heading = document.createElement("div");
  heading.textContent = "FTP-Historie";
  heading.style.cssText =
    "font-family: var(--font-mono); font-size:0.62rem; text-transform:uppercase; letter-spacing:0.06em; color: var(--dim); margin-bottom:10px;";

  const list = document.createElement("div");
  list.style.cssText = "display:flex; flex-direction:column; gap:8px; margin-bottom:10px;";

  async function renderList() {
    list.innerHTML = "";
    const result = await getFtpHistory();
    if (!result.ok) {
      log.warn("FTP-Historie konnte nicht geladen werden:", result.error);
      const errEl = document.createElement("div");
      errEl.textContent = "FTP-Historie konnte nicht geladen werden.";
      errEl.style.cssText = "font-family: var(--font-mono); font-size:0.65rem; color: var(--red);";
      list.appendChild(errEl);
      return;
    }
    if (!result.entries.length) {
      const emptyEl = document.createElement("div");
      emptyEl.textContent = "Noch keine Einträge — bisher gilt die im Profil hinterlegte FTP.";
      emptyEl.style.cssText = "font-family: var(--font-mono); font-size:0.65rem; color: var(--dim);";
      list.appendChild(emptyEl);
      return;
    }
    const current = currentFtpEntry(result.entries);
    // Neueste zuerst — die Liste kommt aufsteigend sortiert aus getFtpHistory().
    for (const entry of [...result.entries].reverse()) {
      const item = document.createElement("div");
      item.style.cssText = "display:flex; align-items:center; justify-content:space-between; padding:6px 8px;";
      item.innerHTML = `
        <span style="font-family: var(--font-mono); font-size:0.65rem; color: var(--dim);"></span>
        <span style="font-family: var(--font-disp); font-weight:600; font-size:0.8rem; color: var(--accent);"></span>
      `;
      const sourceLabel = FTP_SOURCE_LABEL[entry.source] || entry.source;
      item.children[0].textContent =
        `ab ${fmtDate(entry.validFrom)} · ${sourceLabel}` + (entry.id === current?.id ? " · aktuell" : "");
      item.children[1].textContent = `${entry.ftpWatt} W`;
      list.appendChild(item);
    }
  }

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.textContent = "+ FTP eintragen";
  addBtn.style.cssText =
    "background:none; border:none; cursor:pointer; font-family: var(--font-mono); font-size:0.62rem; color: var(--accent); padding:0;";

  const form = document.createElement("form");
  form.style.cssText = "display:none; flex-direction:column; gap:8px; margin-top:10px;";
  // Kein source-Auswahlfeld: dieses Formular ist ausschließlich für real
  // per Ramp-Test gemessene Werte (30.07.2026, auf Wunsch) — eFTP-artige
  // Schätzungen liefert bereits intervals.icu laufend, eine zweite,
  // manuell einzutragende "Schätzung" hier würde beide Konzepte vermischen.
  // DB-Constraint (Migration 0009) erlaubt "schaetzung" weiterhin, falls
  // später doch gebraucht — das hier ist eine reine UI-Einschränkung.
  form.innerHTML = `
    <input name="ftpWatt" type="number" placeholder="FTP (Watt), per Ramp-Test gemessen" min="1" step="1" required class="glass-input">
    <input name="validFrom" type="date" required class="glass-input">
    <input name="note" type="text" placeholder="Notiz (optional)" class="glass-input">
    <div id="settings-ftp-error" style="font-family: var(--font-mono); font-size:0.62rem; color: var(--red); min-height:1em;"></div>
    <button type="submit" class="btn-primary" style="align-self:flex-start;">Speichern</button>
  `;
  // Zukunftsdaten sind zwar keine RLS-Schranke (Migration 0009 prüft das
  // nicht serverseitig), aber inhaltlich sinnlos — clientseitige Schranke
  // reicht für diese private, nur-vom-Athleten-selbst-genutzte Eingabe.
  form.querySelector('input[name="validFrom"]').max = localISODate();
  form.querySelector('input[name="validFrom"]').value = localISODate();

  const ftpErrorEl = form.querySelector("#settings-ftp-error");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    ftpErrorEl.textContent = "";
    const fd = new FormData(form);
    const result = await saveFtpEntry({
      ftpWatt: Number(fd.get("ftpWatt")),
      validFrom: fd.get("validFrom"),
      source: "ramp-test",
      note: fd.get("note") || null,
    });
    if (!result.ok) {
      // Häufigster Fall: unique(profile_id, valid_from) aus Migration 0009 —
      // zweiter Eintrag für denselben Tag. Postgres' Rohfehler ("duplicate
      // key value violates unique constraint …") live im Formular gesehen —
      // zu technisch für den Athleten, deshalb hier gezielt abgefangen statt
      // 1:1 durchgereicht.
      ftpErrorEl.textContent = result.error?.message?.includes("ftp_history_profile_id_valid_from_key")
        ? "Für dieses Datum gibt es bereits einen Eintrag."
        : result.error?.message || "FTP-Eintrag konnte nicht gespeichert werden.";
      return;
    }
    form.reset();
    form.querySelector('input[name="validFrom"]').value = localISODate();
    form.style.display = "none";
    addBtn.style.display = "";
    renderList();
  });

  addBtn.addEventListener("click", () => {
    form.style.display = "flex";
    addBtn.style.display = "none";
  });

  section.appendChild(heading);
  section.appendChild(list);
  section.appendChild(addBtn);
  section.appendChild(form);
  await renderList();
  return section;
}

const EVIDENCE_GRADE_LABEL = { studienlage: "Studienlage", "coaching-konsens": "Coaching-Konsens" };

/** Familienauswahl (D2, docs/konzept-progressionssteuerung.md L1.1/L7):
 *  welche Formatfamilien für den Athleten aktiv sind. Max. zwei aktive
 *  Familien pro Blockziel (L1.1) — clientseitig geprüft, weil session_
 *  formats.block_targets die Zuordnung Format→Blockziel trägt und die
 *  RLS-Ebene keine Kreuzprüfung über mehrere Zeilen kennt. Kein Seed in
 *  Migration 0014 (Architekturentscheidung Fenster D) — Alex setzt die
 *  L7-Startbelegung hier selbst, nach Freigabe im Abschlussbericht. */
async function buildFormatsSection() {
  const section = document.createElement("div");
  section.style.cssText = "padding: 18px 16px; border-bottom: 1px solid var(--border);";

  const heading = document.createElement("div");
  heading.textContent = "Trainingsformate";
  heading.style.cssText =
    "font-family: var(--font-mono); font-size:0.62rem; text-transform:uppercase; letter-spacing:0.06em; color: var(--dim); margin-bottom:10px;";

  const list = document.createElement("div");
  list.style.cssText = "display:flex; flex-direction:column; gap:10px;";

  const errorEl = document.createElement("div");
  errorEl.style.cssText = "font-family: var(--font-mono); font-size:0.62rem; color: var(--red); min-height:1em; margin-top:8px;";

  const [catalogResult, athleteFormatsResult] = await Promise.all([getSessionFormats(), getAthleteFormats()]);
  if (!catalogResult.ok || !athleteFormatsResult.ok) {
    const errEl = document.createElement("div");
    errEl.textContent = "Trainingsformate konnten nicht geladen werden.";
    errEl.style.cssText = "font-family: var(--font-mono); font-size:0.65rem; color: var(--red);";
    section.appendChild(heading);
    section.appendChild(errEl);
    return section;
  }

  const formats = catalogResult.formats;
  // active-Status als Map(id -> boolean), Default false für Formate ohne
  // athlete_formats-Zeile (noch nie gewählt).
  const activeById = new Map(formats.map((f) => [f.id, false]));
  for (const af of athleteFormatsResult.athleteFormats) activeById.set(af.formatId, af.active);

  /** Zählt aktive Familien, die sich mind. ein Blockziel mit `format` teilen
   *  (ohne `format` selbst) — L1.1: max. zwei pro Blockziel. */
  function activeSiblingCount(format) {
    let count = 0;
    for (const other of formats) {
      if (other.id === format.id || !activeById.get(other.id)) continue;
      if (other.blockTargets.some((bt) => format.blockTargets.includes(bt))) count++;
    }
    return count;
  }

  for (const format of formats) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex; align-items:center; justify-content:space-between; gap:8px;";
    row.innerHTML = `
      <span style="min-width:0;">
        <span style="display:block; font-family: var(--font-body); font-size:0.8rem; color: var(--text);"></span>
        <span style="display:block; font-family: var(--font-mono); font-size:0.6rem; color: var(--dim2);"></span>
      </span>
      <button type="button" style="width:36px; height:20px; border-radius:999px; flex-shrink:0;
        border:none; cursor:pointer; position:relative; background: rgba(255,255,255,0.10); transition: background 0.15s;">
        <span style="position:absolute; top:2px; left:2px; width:16px; height:16px; border-radius:50%;
          background:#fff; transition: transform 0.15s;"></span>
      </button>
    `;
    row.children[0].children[0].textContent = format.label;
    row.children[0].children[1].textContent = EVIDENCE_GRADE_LABEL[format.evidenceGrade] ?? format.evidenceGrade;

    const toggle = row.children[1];
    const knob = toggle.querySelector("span");
    const applyToggleState = () => {
      const on = activeById.get(format.id);
      toggle.style.background = on ? "var(--accent)" : "rgba(255,255,255,0.10)";
      knob.style.transform = on ? "translateX(16px)" : "translateX(0)";
    };
    applyToggleState();

    toggle.addEventListener("click", async () => {
      errorEl.textContent = "";
      const turningOn = !activeById.get(format.id);
      // L1.1: max. zwei aktive Familien pro Blockziel — nur beim Einschalten
      // relevant, Ausschalten ist immer erlaubt.
      if (turningOn && format.blockTargets.length && activeSiblingCount(format) >= 2) {
        errorEl.textContent = `Für "${format.blockTargets.join(", ")}" sind bereits zwei Familien aktiv — zuerst eine deaktivieren.`;
        return;
      }
      activeById.set(format.id, turningOn);
      applyToggleState();
      const result = await setAthleteFormatActive(format.id, turningOn);
      if (!result.ok) {
        // Rollback bei Schreibfehler — sonst zeigt der Toggle einen Zustand,
        // der serverseitig nicht ankam.
        activeById.set(format.id, !turningOn);
        applyToggleState();
        errorEl.textContent = "Änderung konnte nicht gespeichert werden.";
      }
    });

    list.appendChild(row);
  }

  section.appendChild(heading);
  section.appendChild(list);
  section.appendChild(errorEl);
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

/** Passwortänderung — für ALLE Rollen (C5.3), kein isAthlete()-Gate wie bei
 *  Goals/FTP-Historie/Datenquellen unten. Ein Login-Passwort ist kein
 *  Anzeige-Setting wie der bisherige Trainer-Beschränkungs-Präzedenzfall
 *  ("nur Display-Name"). Re-Authentifizierung passiert serverseitig in
 *  data-access/supabase/auth.js::updatePassword() (C5.2) — hier nur die
 *  Formularfelder/Fehleranzeige. */
function buildPasswordSection() {
  const section = document.createElement("div");
  section.style.cssText = "padding: 18px 16px; border-bottom: 1px solid var(--border);";

  const heading = document.createElement("div");
  heading.textContent = "Passwort";
  heading.style.cssText =
    "font-family: var(--font-mono); font-size:0.62rem; text-transform:uppercase; letter-spacing:0.06em; color: var(--dim); margin-bottom:10px;";

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.textContent = "Passwort ändern";
  toggleBtn.style.cssText =
    "background:none; border:none; cursor:pointer; font-family: var(--font-mono); font-size:0.62rem; color: var(--accent); padding:0;";

  const form = document.createElement("form");
  form.style.cssText = "display:none; flex-direction:column; gap:8px; margin-top:10px;";
  form.innerHTML = `
    <input name="currentPassword" type="password" autocomplete="current-password" placeholder="Aktuelles Passwort" required class="glass-input">
    <input name="newPassword" type="password" autocomplete="new-password" placeholder="Neues Passwort" minlength="6" required class="glass-input">
    <input name="confirmPassword" type="password" autocomplete="new-password" placeholder="Neues Passwort wiederholen" minlength="6" required class="glass-input">
    <div id="settings-password-error" style="font-family: var(--font-mono); font-size:0.62rem; color: var(--red); min-height:1em;"></div>
    <button type="submit" class="btn-primary" style="align-self:flex-start;">Speichern</button>
  `;

  const errorEl = form.querySelector("#settings-password-error");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.textContent = "";
    const fd = new FormData(form);
    const newPassword = fd.get("newPassword");
    // Vor dem Netzwerk-Roundtrip prüfen (spart einen unnötigen Re-Auth-
    // Versuch bei einem simplen Tippfehler im zweiten Feld).
    if (newPassword !== fd.get("confirmPassword")) {
      errorEl.textContent = "Neue Passwörter stimmen nicht überein.";
      return;
    }
    const result = await updatePassword(fd.get("currentPassword"), newPassword);
    if (!result.ok) {
      errorEl.textContent = result.error?.message || "Passwort konnte nicht geändert werden.";
      return;
    }
    form.reset();
    form.style.display = "none";
    toggleBtn.style.display = "";
    flashSaved(toggleBtn);
  });

  toggleBtn.addEventListener("click", () => {
    form.style.display = "flex";
    toggleBtn.style.display = "none";
  });

  section.appendChild(heading);
  section.appendChild(toggleBtn);
  section.appendChild(form);
  return section;
}

async function buildPanelContent(user) {
  const content = document.createElement("div");
  content.appendChild(buildProfileSection(user));
  content.appendChild(buildPasswordSection());
  if (isAthlete()) {
    content.appendChild(await buildGoalsSection());
    content.appendChild(await buildFtpHistorySection());
    content.appendChild(await buildFormatsSection());
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

/* ============================================================
   UI/PANELS.JS — Übersicht-Panels: Tagesform-Ampel,
   Wochenrückblick, Bestwerte-Wand
   Rendering only — Berechnung in core/readiness.js,
   core/weekreview.js, core/records.js.
   ============================================================ */

import { fmt, fmtDuration, fmtDate } from "../core/format.js";
import { el } from "./dom.js";
import { activateTab } from "./nav.js";

const LEVEL = {
  green: { color: "var(--z1)", label: "Bereit" },
  yellow: { color: "var(--gold)", label: "Angeschlagen" },
  red: { color: "var(--thr)", label: "Erholung nötig" },
};

const STATUS_ICON = { ok: "●", caution: "●", alert: "●", nodata: "○" };
const STATUS_COLOR = {
  ok: "var(--z1)",
  caution: "var(--gold)",
  alert: "var(--thr)",
  nodata: "var(--dim2)",
};

const CONFIDENCE_BADGE = { vorhanden: "", ausstehend: "⏳", veraltet: "⚠" };

/** Footer-Link zur Status-Briefing-Karte (Analyse-Tab) — dieselbe
 *  buildBriefing()-Berechnung wie dort, nicht bloß visuell ähnlich. */
function briefingLinkHtml(briefing) {
  if (!briefing) return "";
  const color = LEVEL[briefing.level]?.color || "var(--dim)";
  return `<button type="button" class="readiness-briefing-link" style="color:${color}">Status-Briefing: ${briefing.headline} →</button>`;
}

function wireBriefingLink(wrap) {
  wrap.querySelector(".readiness-briefing-link")?.addEventListener("click", () => activateTab("analysis"));
}

/* ── Tagesform-Ampel ─────────────────────────────────────────── */
export function renderReadiness(containerId, assessment, briefing = null) {
  const wrap = el(containerId);
  if (!wrap) return;
  if (!assessment) {
    wrap.innerHTML = `
      <div class="panel-card">
        <div class="panel-title">Tagesform</div>
        <p class="panel-empty">Noch zu wenig Wellness-Historie für eine belastbare Baseline (braucht ~6 Wochen intervals.icu-Daten).</p>
        ${briefingLinkHtml(briefing)}
      </div>`;
    wireBriefingLink(wrap);
    return;
  }

  const lv = LEVEL[assessment.level];
  wrap.innerHTML = `
    <div class="panel-card">
      <div class="panel-title">Tagesform <span class="panel-meta">7 Tage vs. 42-Tage-Baseline</span></div>
      <div class="readiness-head">
        <span class="readiness-dot" style="background:${lv.color}; box-shadow: 0 0 14px ${lv.color}"></span>
        <div>
          <div class="readiness-level" style="color:${lv.color}">${lv.label}</div>
          <div class="readiness-reco">${assessment.recommendation}</div>
        </div>
      </div>
      <div class="readiness-metrics">
        ${assessment.metrics
          .map(
            (m) => `
          <div class="readiness-metric" title="z = ${m.z != null ? m.z : "–"} · Konfidenz: ${m.confidence}${m.daysSinceLastValue != null ? ` (${m.daysSinceLastValue}d)` : ""}">
            <span class="rm-status" style="color:${STATUS_COLOR[m.status]}">${STATUS_ICON[m.status]}</span>
            <span class="rm-label">${m.label}</span>
            <span class="rm-val">${m.recent != null ? m.recent : "–"}${CONFIDENCE_BADGE[m.confidence] ? ` ${CONFIDENCE_BADGE[m.confidence]}` : ""}</span>
            <span class="rm-base">Ø ${m.baseline != null ? m.baseline : "–"}</span>
          </div>`
          )
          .join("")}
      </div>
      ${assessment.basisNote ? `<div class="readiness-basis">${assessment.basisNote}</div>` : ""}
      ${assessment.staleWarning ? `<div class="readiness-stale-warning">⚠ ${assessment.staleWarning}</div>` : ""}
      ${briefingLinkHtml(briefing)}
    </div>`;
  wireBriefingLink(wrap);
}

/* ── Wochenrückblick ─────────────────────────────────────────── */
export function renderWeekReview(containerId, review) {
  const wrap = el(containerId);
  if (!wrap) return;
  if (!review) {
    wrap.innerHTML = `
      <div class="panel-card">
        <div class="panel-title">Wochenrückblick</div>
        <p class="panel-empty">Letzte Woche keine Fahrten erfasst — der Rückblick erscheint nach der nächsten Trainingswoche.</p>
      </div>`;
    return;
  }

  const range = `${fmtDate(review.from)} – ${fmtDate(review.to)}`;
  const planHtml = review.plan
    ? `<span class="wr-chip" style="color:${review.plan.done >= review.plan.planned ? "var(--z1)" : "var(--gold)"}">Plan ${review.plan.done}/${review.plan.planned} ✓</span>`
    : "";
  const bestHtml = review.best
    ? `<div class="wr-highlight">⚡ Stärkste Einheit: <b>${review.best.name}</b>${review.best.np ? ` · NP ${review.best.np} W` : ""}${review.best.km ? ` · ${fmt(review.best.km)} km` : ""}</div>`
    : "";
  const weatherHtml = review.weatherNote
    ? `<div class="wr-highlight">🌤️ ${review.weatherNote}</div>`
    : "";

  wrap.innerHTML = `
    <div class="panel-card">
      <div class="panel-title">Wochenrückblick <span class="panel-meta">${range}</span></div>
      <div class="wr-stats">
        <span class="wr-chip"><b>${fmt(review.km)}</b> km</span>
        <span class="wr-chip"><b>${review.rides}</b> Fahrten</span>
        <span class="wr-chip"><b>${fmtDuration(review.min)}</b></span>
        <span class="wr-chip"><b>${review.tss}</b> TSS</span>
        ${planHtml}
      </div>
      ${bestHtml}
      ${weatherHtml}
    </div>`;
}

/* ── Bestwerte-Wand ──────────────────────────────────────────── */
export function renderRecords(containerId, records) {
  const wrap = el(containerId);
  if (!wrap) return;
  if (!records || !records.length) {
    wrap.innerHTML = "";
    return;
  }

  wrap.innerHTML = records
    .map((r) => {
      const prev = r.history.length ? r.history[r.history.length - 1] : null;
      const valStr =
        r.unit === "min"
          ? fmtDuration(r.value)
          : `${fmt(r.value, r.unit === "km/h" ? 1 : 0)} ${r.unit}`;
      return `
      <div class="record-card">
        <div class="record-icon">${r.icon}</div>
        <div class="record-body">
          <div class="record-value">${valStr}</div>
          <div class="record-label">${r.label}</div>
          <div class="record-meta">${fmtDate(r.date)}${r.key === "weekKm" ? ` · ${r.name}` : ""}</div>
          ${
            prev
              ? `<div class="record-prev">löste ${r.unit === "min" ? fmtDuration(prev.value) : fmt(prev.value, r.unit === "km/h" ? 1 : 0) + " " + r.unit} ab (${fmtDate(prev.date)})</div>`
              : `<div class="record-prev record-first">Erster Eintrag</div>`
          }
        </div>
      </div>`;
    })
    .join("");
}

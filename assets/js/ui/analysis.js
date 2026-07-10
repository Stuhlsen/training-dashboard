/* ============================================================
   UI/ANALYSIS.JS — Analyse-Tab (Entscheidungs-Ansicht)
   Sektionen in Trainer-Fragereihenfolge:
   1 Status-Briefing · 2 Belastung & Erholung · 3 Intensitäts-
   verteilung · 4 Aerobe Entwicklung · 5 Leistungsdiagnostik ·
   6 Regeneration & Körper (datengetrieben) · 7 Konsistenz &
   Adhärenz · 8 Periodisierungs-Erfüllung (nur eigener Plan)

   Berechnung liegt komplett in core/* — hier nur Rendering.
   Plan-Toggle filtert die verlaufs-/bestandsbezogenen Sektionen
   (KPIs, Verteilung, Aerob, Bestwerte); zeitpunktbezogene
   Sektionen (Briefing, Load, Körper, Konsistenz, Periodisierung)
   nutzen immer den vollen Datensatz.
   ============================================================ */

import { isoWeekKey } from "../core/aggregate.js";
import { buildConsistency } from "../core/adherence.js";
import {
  availability,
  weightTrend,
  wattsPerKg,
  energyView,
  estimateBMR,
  hydrationSeries,
  MIN_POINTS,
} from "../core/body.js";
import { buildBriefing } from "../core/briefing.js";
import { cadenceCoach } from "../core/cadence.js";
import {
  efficiencyTrend,
  decouplingTrend,
  DECOUPLING_STABLE,
  DECOUPLING_MIN_POINTS,
} from "../core/efficiency.js";
import { fmt, fmtInt, fmtDate } from "../core/format.js";
import {
  eftpHistory,
  eftpHistoryFromWellness,
  mergeEftpHistories,
  forecastFtp,
  dateForTarget,
} from "../core/ftp-forecast.js";
import { nextPlannedSession } from "../core/ftp-progress.js";
import { buildLoadGuard, describeWeek } from "../core/loadguard.js";
import { phaseCompliance } from "../core/periodization.js";
import { assessReadiness } from "../core/readiness.js";
import { recordProgression } from "../core/records.js";
import { avg, maxVal, sum } from "../core/stats.js";
import {
  overallZoneShares,
  overallBandsFromIF,
  distributionShape,
  LOW_INTENSITY_TARGET,
} from "../core/zones.js";
import { CONFIG } from "../state/config.js";
import { Data } from "../state/data.js";
import { el } from "./dom.js";

/** Lokales ISO-Datum (kein UTC-Versatz) */
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const LEVEL_COLOR = {
  green: "var(--z1, #4a9a6e)",
  yellow: "var(--ss, #e08a3c)",
  red: "var(--thr, #d94f4f)",
};
const RISK_COLOR = {
  ok: "var(--z1, #4a9a6e)",
  caution: "var(--ss, #e08a3c)",
  high: "var(--thr, #d94f4f)",
};

export const Analysis = {
  _allRides: [],
  _toggleInit: false,

  render(rides) {
    this._allRides = [...rides].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    const ownPlan = rides.some((r) => r.week);
    const today = todayISO();

    const toggle = el("plan-toggle");
    if (toggle) toggle.classList.toggle("hidden", !ownPlan);
    if (ownPlan && !this._toggleInit) {
      this._initToggle();
      this._toggleInit = true;
    }

    // Zeitpunkt-/verlaufsbezogene Sektionen: immer voller Datensatz
    this._renderBriefing(ownPlan, today);
    this._renderLoad(ownPlan);
    this._renderBody(today);
    this._renderConsistency(ownPlan, today);
    this._renderPeriodization(ownPlan);
    this._renderPower(ownPlan);

    // Plan-filterbare Sektionen
    this._renderForPlan(ownPlan ? "all" : "none", ownPlan);
  },

  _initToggle() {
    const btns = document.querySelectorAll(".plan-btn");
    btns.forEach((btn) => {
      btn.addEventListener("click", () => {
        btns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this._renderForPlan(btn.dataset.plan, true);
      });
    });
  },

  _renderForPlan(plan, ownPlan) {
    const rides =
      plan === "all" || plan === "none"
        ? this._allRides
        : this._allRides.filter((r) => (r.plan || "Plan 1") === plan);
    this._renderKPIs(rides, plan, ownPlan);
    this._renderZones(rides, ownPlan);
    this._renderTypDistribution(rides);
    this._renderAerobic(rides, ownPlan);
    this._renderComparison(ownPlan);
  },

  /* ── Wochen-Helfer (wie app.js) ───────────────────────────── */
  _weekFns(ownPlan) {
    const weekKeyFn = ownPlan ? (r) => r.week : (r) => (r.dateISO ? isoWeekKey(r.dateISO) : null);
    const weekSortFn = ownPlan
      ? (a, b) => CONFIG.weekIndex(a) - CONFIG.weekIndex(b)
      : (a, b) => a.localeCompare(b);
    return { weekKeyFn, weekSortFn };
  },

  /* ── KPI Hero ─────────────────────────────────────────────── */
  _renderKPIs(rides, plan, ownPlan) {
    const totalKm = Math.round(sum(rides, "km"));
    const totalMin = Math.round(sum(rides, "min"));
    const totalH = (totalMin / 60).toFixed(0);
    const avgKm = rides.length ? fmt(totalKm / rides.length) : "–";
    const maxCTL = fmtInt(
      maxVal(
        rides.filter((r) => r.ctl != null),
        "ctl"
      )
    );
    const avgHF = fmtInt(
      avg(
        rides.filter((r) => r.hf),
        "hf"
      )
    );
    const avgKad = fmtInt(
      avg(
        rides.filter((r) => r.kad),
        "kad"
      )
    );
    const ftpVal = Data.ftpValue();
    const totalTSS = Math.round(
      sum(
        rides.filter((r) => r.tss),
        "tss"
      )
    );
    const lastTSB = rides.filter((r) => r.tsb != null).slice(-1)[0]?.tsb;

    const plan1Rides = this._allRides.filter((r) => (r.plan || "Plan 1") === "Plan 1");
    const plan2Rides = this._allRides.filter((r) => r.plan === "Plan 2");

    const kpis = [
      {
        v: rides.length,
        l: "Fahrten",
        sub: plan === "all" && ownPlan ? `${plan1Rides.length} P1 · ${plan2Rides.length} P2` : null,
      },
      { v: totalKm.toLocaleString("de") + " km", l: "Distanz", sub: `Ø ${avgKm} km/Fahrt` },
      { v: totalH + " h", l: "Trainingszeit", sub: `${totalMin.toLocaleString("de")} min gesamt` },
      { v: ftpVal ? ftpVal + "W" : "–", l: "FTP (gemessen)", sub: null, color: "var(--accent)" },
      {
        v: maxCTL,
        l: "Peak CTL",
        sub: lastTSB != null ? `TSB heute: ${lastTSB > 0 ? "+" : ""}${fmt(lastTSB)}` : null,
      },
      { v: avgHF + " bpm", l: "Ø Herzfrequenz", sub: null },
      {
        v: avgKad + " RPM",
        l: "Ø Kadenz",
        sub: ownPlan ? `Ziel: ${CONFIG.cadenceTarget}+ RPM` : null,
      },
      { v: totalTSS.toLocaleString("de"), l: "Gesamt TSS", sub: null },
    ];

    el("analysis-kpis").innerHTML = kpis
      .map(
        (k) => `
      <div class="analysis-kpi">
        <div class="analysis-kpi-val"${k.color ? ` style="color:${k.color}"` : ""}>${k.v}</div>
        <div class="analysis-kpi-lbl">${k.l}</div>
        ${k.sub ? `<div class="analysis-kpi-sub">${k.sub}</div>` : ""}
      </div>`
      )
      .join("");
  },

  /* ── 1 · Status-Briefing ──────────────────────────────────── */
  _renderBriefing(ownPlan, today) {
    const box = el("analysis-briefing");
    if (!box) return;

    const readiness = assessReadiness(Data.wellness, today);
    const withTsb = this._allRides.filter((r) => r.tsb != null);
    const tsb = withTsb.length ? withTsb[withTsb.length - 1].tsb : null;

    const { weekKeyFn, weekSortFn } = this._weekFns(ownPlan);
    const guard = buildLoadGuard(this._allRides, weekKeyFn, weekSortFn);
    const loadRisk = guard.length ? guard[guard.length - 1].risk : null;

    let nextSession = null;
    if (ownPlan && Data.plannedSessions?.length) {
      const doneDates = new Set(this._allRides.map((r) => r.dateISO));
      nextSession = nextPlannedSession(Data.plannedSessions, Data.adjustments, doneDates, today);
    }

    const b = buildBriefing({ readiness, tsb, loadRisk, nextSession });
    const dot = (status) =>
      status === "alert"
        ? "var(--thr, #d94f4f)"
        : status === "caution"
          ? "var(--ss, #e08a3c)"
          : status === "nodata"
            ? "var(--dim2, #6b7280)"
            : "var(--z1, #4a9a6e)";

    box.innerHTML = `
      <div class="briefing-head">
        <span class="briefing-dot" style="background:${LEVEL_COLOR[b.level]}"></span>
        <span class="briefing-headline">${b.headline}</span>
      </div>
      <p class="briefing-reco">${b.recommendation}</p>
      <div class="briefing-signals">
        ${b.signals
          .map(
            (s) => `
          <div class="briefing-signal">
            <span class="briefing-dot small" style="background:${dot(s.status)}"></span>
            <span>${s.text}</span>
          </div>`
          )
          .join("")}
      </div>
      ${b.degraded ? `<p class="analysis-note">Ohne HRV-Baseline (zu wenig Wellness-Historie) — Status nur aus Belastungssignalen.</p>` : ""}`;
  },

  /* ── 2 · Belastung & Erholung ─────────────────────────────── */
  _renderLoad(ownPlan) {
    const box = el("analysis-load");
    if (!box) return;

    const { weekKeyFn, weekSortFn } = this._weekFns(ownPlan);
    const guard = buildLoadGuard(this._allRides, weekKeyFn, weekSortFn);
    if (!guard.length) {
      box.innerHTML = `<p class="analysis-empty">Noch keine Wochenlast-Daten.</p>`;
      return;
    }

    const rows = guard.slice(-8);
    box.innerHTML = `
      <div class="load-table">
        <div class="load-row load-head">
          <span>Woche</span><span>Last</span><span>Ramp</span><span>Monot.</span><span>Strain</span><span>Einordnung</span>
        </div>
        ${rows
          .map((r) => {
            const d = describeWeek(r);
            return `
          <div class="load-row">
            <span class="load-week">${r.week}</span>
            <span>${r.total || "–"}</span>
            <span>${r.ramp != null ? (r.ramp > 0 ? "+" : "") + r.ramp : "–"}</span>
            <span>${r.monotony ?? "–"}</span>
            <span>${r.strain ?? "–"}</span>
            <span class="load-desc"><span class="load-chip" style="color:${RISK_COLOR[r.risk]}">${d.label}</span><span class="load-detail">${d.detail}</span></span>
          </div>`;
          })
          .join("")}
      </div>`;
  },

  /* ── 3 · Intensitätsverteilung ────────────────────────────── */
  _renderZones(rides, ownPlan) {
    const box = el("analysis-zones");
    if (!box) return;

    const zoneBased = overallZoneShares(rides);
    const dist = zoneBased || overallBandsFromIF(rides);
    if (!dist) {
      box.innerHTML = `<p class="analysis-empty">Keine Zonen- oder Intensitätsdaten verfügbar — Zeit-in-Zone erscheint nach dem nächsten Daten-Sync.</p>`;
      return;
    }

    // Aussagekraft prüfen: die IF-Näherung deckt nur Fahrten mit Leistungs-
    // daten ab. Bei den Grundlagenfahrten fehlt NP/FTP oft ganz, wodurch die
    // Näherung zu den harten Einheiten kippt. Deshalb NUR bei ausreichender
    // Abdeckung ein Formurteil ("polarisiert"/…) zeigen — sonst ehrlich sein.
    const pct = (v) => Math.round(v * 100);
    const coverage = rides.length ? dist.nRides / rides.length : 0;
    const representative = dist.source === "zoneTimes" || coverage >= 0.6;

    const sourceLabel =
      dist.source === "zoneTimes"
        ? `Zeit in Zone (intervals.icu) · ${dist.nRides} Fahrten · ${dist.hours} h`
        : `Näherung über Intensitätsfaktor · nur ${dist.nRides}/${rides.length} Fahrten mit Leistungsdaten · ${dist.hours} h`;

    const verdict = representative
      ? (() => {
          const s = distributionShape(dist.shares);
          return `<p class="zone-shape"><strong>${s.shape.charAt(0).toUpperCase() + s.shape.slice(1)}</strong> — ${s.note}</p>`;
        })()
      : `<p class="analysis-note">Für ein belastbares Verteilungs-Urteil fehlen noch Zeit-in-Zone-Daten (aktuell nur ${dist.nRides} von ${rides.length} Fahrten mit Leistungswerten). Das Band unten ist eine grobe Vorschau über die kraftbasierten Fahrten — es unterschätzt den Grundlagenanteil, weil vielen lockeren Einheiten NP/FTP fehlt.</p>`;

    box.innerHTML = `
      <div class="zone-bar">
        <div class="zone-seg" style="width:${pct(dist.shares.low)}%; background:var(--z2, #4a7fa8)" title="Niedrig"></div>
        <div class="zone-seg" style="width:${pct(dist.shares.mid)}%; background:var(--ss, #e08a3c)" title="Mittel"></div>
        <div class="zone-seg" style="width:${pct(dist.shares.high)}%; background:var(--vo2, #a24ad0)" title="Hoch"></div>
      </div>
      <div class="zone-legend">
        <span><i style="background:var(--z2, #4a7fa8)"></i>Niedrig ${pct(dist.shares.low)}%</span>
        <span><i style="background:var(--ss, #e08a3c)"></i>Mittel ${pct(dist.shares.mid)}%</span>
        <span><i style="background:var(--vo2, #a24ad0)"></i>Hoch ${pct(dist.shares.high)}%</span>
        <span class="zone-target">Richtwert: ≥${Math.round(LOW_INTENSITY_TARGET * 100)}% niedrig</span>
      </div>
      ${verdict}
      <p class="analysis-note">${sourceLabel}${ownPlan ? " · Phasen-Soll siehe Periodisierungs-Erfüllung" : ""}</p>`;
  },

  /* ── 3b · Trainingstyp-Verteilung (bestehend) ─────────────── */
  _renderTypDistribution(rides) {
    const typColors = {
      "Z2 Lang": "#4a7fa8",
      "Z2 Dauer": "#4a7fa8",
      "Z1 Recovery": "#4a9a6e",
      "Sweet Spot": "#e08a3c",
      Schwelle: "#d94f4f",
      VO2max: "#a24ad0",
      Gruppenfahrt: "#c9a84c",
      Etappe: "#c9a84c",
      Ausserplanmaessig: "#6b7280",
      Freestyle: "#6b7280",
      "FTP-Test": "#c9a84c",
    };

    const typMap = {};
    for (const r of rides) {
      const t = r.typ || "Sonstige";
      if (!typMap[t]) typMap[t] = { count: 0, km: 0, min: 0 };
      typMap[t].count++;
      typMap[t].km += r.km || 0;
      typMap[t].min += r.min || 0;
    }

    const totalKm = sum(rides, "km");
    const sorted = Object.entries(typMap).sort((a, b) => b[1].km - a[1].km);

    el("typ-distribution").innerHTML = `
      <div class="typ-dist-bars">
        ${sorted
          .map(([typ, d]) => {
            const pct = totalKm > 0 ? (d.km / totalKm) * 100 : 0;
            const col = typColors[typ] || "#6b7280";
            return `
            <div class="typ-dist-row">
              <span class="typ-dist-label">${typ}</span>
              <div class="typ-dist-bar-wrap">
                <div class="typ-dist-bar" style="width:${pct.toFixed(1)}%; background:${col}"></div>
              </div>
              <span class="typ-dist-pct" style="color:${col}">${pct.toFixed(0)}%</span>
              <span class="typ-dist-meta">${d.count} Fahrten · ${Math.round(d.km)} km</span>
            </div>`;
          })
          .join("")}
      </div>`;
  },

  /* ── 4 · Aerobe Entwicklung ───────────────────────────────── */
  _renderAerobic(rides, ownPlan) {
    const wrap = el("analysis-aerobic");
    if (!wrap) return;

    const cards = [];

    // Effizienzfaktor (W/HF)
    const ef = efficiencyTrend(rides);
    if (ef && ef.first != null && ef.last != null) {
      const delta = Math.round((ef.last - ef.first) * 100) / 100;
      const up = delta > 0;
      cards.push(`
        <div class="aerobic-card">
          <div class="aerobic-title">Effizienzfaktor</div>
          <div class="aerobic-val">${ef.last} <span class="aerobic-unit">W/bpm</span></div>
          <div class="aerobic-sub" style="color:${up ? "var(--z1, #4a9a6e)" : "var(--dim)"}">${up ? "+" : ""}${delta} seit Beginn · ${ef.comparable.length} vergleichbare Z2-Fahrten</div>
          ${ef.slopePer30d != null ? `<div class="aerobic-sub">Trend: ${ef.slopePer30d > 0 ? "+" : ""}${ef.slopePer30d} / 30 Tage</div>` : ""}
        </div>`);
    } else {
      cards.push(`
        <div class="aerobic-card">
          <div class="aerobic-title">Effizienzfaktor</div>
          <div class="aerobic-empty">Zu wenig vergleichbare Z2-Fahrten (≥60 min).</div>
        </div>`);
    }

    // HF-Decoupling
    const dc = decouplingTrend(rides);
    if (dc) {
      const stable = dc.median < DECOUPLING_STABLE;
      cards.push(`
        <div class="aerobic-card">
          <div class="aerobic-title">HF-Decoupling</div>
          <div class="aerobic-val" style="color:${stable ? "var(--z1, #4a9a6e)" : "var(--ss, #e08a3c)"}">${dc.median}<span class="aerobic-unit">% Median</span></div>
          <div class="aerobic-sub">${dc.stableShare}% der Fahrten aerob stabil (&lt;${DECOUPLING_STABLE}%) · n=${dc.n}</div>
          ${dc.slopePer30d != null ? `<div class="aerobic-sub">Trend: ${dc.slopePer30d > 0 ? "+" : ""}${dc.slopePer30d} %-Pkt. / 30 Tage</div>` : ""}
        </div>`);
    } else {
      const nNow = rides.filter((r) => r.decoupling != null).length;
      cards.push(`
        <div class="aerobic-card">
          <div class="aerobic-title">HF-Decoupling</div>
          <div class="aerobic-empty">Datenbasis wächst noch (${Math.min(nNow, DECOUPLING_MIN_POINTS)}/${DECOUPLING_MIN_POINTS} geeignete Steady-State-Fahrten).</div>
        </div>`);
    }

    // Kadenz-Ökonomie
    const kad = cadenceCoach(rides, CONFIG.cadenceTarget);
    if (kad) {
      cards.push(`
        <div class="aerobic-card">
          <div class="aerobic-title">Kadenz-Ökonomie</div>
          <div class="aerobic-val">${kad.recentAvg}<span class="aerobic-unit">RPM zuletzt</span></div>
          <div class="aerobic-sub">${kad.delta != null ? `${kad.delta > 0 ? "+" : ""}${kad.delta} RPM seit Beginn · ` : ""}${kad.shareAbove}% der Fahrten ${ownPlan ? `≥ Ziel ${CONFIG.cadenceTarget}` : "≥ 90"} RPM</div>
        </div>`);
    } else {
      cards.push(`
        <div class="aerobic-card">
          <div class="aerobic-title">Kadenz-Ökonomie</div>
          <div class="aerobic-empty">Zu wenig Fahrten mit Kadenzdaten.</div>
        </div>`);
    }

    wrap.innerHTML = cards.join("");
  },

  /* ── 5 · Leistungsdiagnostik ──────────────────────────────── */
  _renderPower(ownPlan) {
    const box = el("analysis-ftp");
    if (!box) return;

    const ac = CONFIG.athleteConfig(Data.activeAthleteId) || {};
    const history = mergeEftpHistories(
      eftpHistory(this._allRides),
      eftpHistoryFromWellness(Data.wellness)
    );
    const lastEftp = history.length ? history[history.length - 1] : null;
    const weight = Data.athleteWeight || null;
    const wkg = (w) => {
      const v = wattsPerKg(w, weight);
      return v != null ? `${fmt(v)} W/kg` : "–";
    };

    // FTP-Dreiklang: gemessen ≠ geschätzt ≠ Ziel — nie vermischen
    const rows = [
      {
        icon: "🔬",
        label: "gemessen",
        value: ac.ftpMeasured,
        meta: ac.ftpMeasuredDate
          ? `Ramp-Test · ${fmtDate(ac.ftpMeasuredDate)}`
          : "Ramp-Test (letzter)",
      },
      {
        icon: "〜",
        label: "geschätzt",
        value: lastEftp?.eftp ?? null,
        meta: lastEftp
          ? `eFTP intervals.icu · Stand ${fmtDate(lastEftp.date)} · ≠ Ramp-Test-Wert`
          : "eFTP intervals.icu",
      },
      {
        icon: "🎯",
        label: "Ziel",
        value: ac.ftpGoal,
        meta: ownPlan && CONFIG.retestDate ? `Retest ${fmtDate(CONFIG.retestDate)}` : "ohne Termin",
      },
    ];

    // Prognose: Retest-Erwartung (Athlet 1) bzw. Ziel-Horizont (Athlet 2)
    let forecastHtml = "";
    if (history.length >= 3) {
      if (ownPlan && CONFIG.retestDate) {
        const fc = forecastFtp(history, CONFIG.retestDate);
        if (fc) {
          const hit = fc.projected >= (ac.ftpGoal || 0);
          forecastHtml = `<p class="ftp-forecast-line">Retest-Erwartung (${fmtDate(CONFIG.retestDate)}): <strong>${fc.low}–${fc.high} W</strong> (Projektion ${fc.projected} W, Trend ${fc.slopePerWeek > 0 ? "+" : ""}${fc.slopePerWeek} W/Woche) — Ziel ${ac.ftpGoal} W ${hit ? "in Reichweite" : "aktuell außerhalb der Projektion"}.</p>`;
        }
      } else if (ac.ftpGoal) {
        const t = dateForTarget(history, ac.ftpGoal);
        if (t?.reached && t.days === 0) {
          forecastHtml = `<p class="ftp-forecast-line">Der eFTP-Trend hat das Ziel ${ac.ftpGoal} W bereits erreicht — Zeit für einen bestätigenden Ramp-Test.</p>`;
        } else if (t?.reached) {
          forecastHtml = `<p class="ftp-forecast-line">Bei aktuellem eFTP-Trend (${t.slopePerWeek > 0 ? "+" : ""}${t.slopePerWeek} W/Woche) wird das Ziel ${ac.ftpGoal} W ca. <strong>${fmtDate(t.date)}</strong> erreicht.</p>`;
        } else if (t) {
          forecastHtml = `<p class="ftp-forecast-line">${
            t.reason === "flat"
              ? `Der eFTP-Trend ist aktuell flach — kein belastbarer Zielhorizont für ${ac.ftpGoal} W ableitbar.`
              : `Ziel ${ac.ftpGoal} W liegt beim aktuellen Trend mehr als 12 Monate entfernt.`
          }</p>`;
        }
      }
    } else {
      forecastHtml = `<p class="analysis-note">eFTP-Historie noch leer — wird nach dem nächsten Daten-Sync befüllt (Wellness-sportInfo / icu_eftp).</p>`;
    }

    box.innerHTML = `
      <div class="ftp-triad">
        ${rows
          .map(
            (r) => `
          <div class="ftp-triad-row">
            <span class="ftp-triad-icon">${r.icon}</span>
            <span class="ftp-triad-label">${r.label}</span>
            <span class="ftp-triad-val">${r.value != null ? r.value + " W" : "–"}</span>
            <span class="ftp-triad-wkg">${r.value != null ? wkg(r.value) : ""}</span>
            <span class="ftp-triad-meta">${r.meta}</span>
          </div>`
          )
          .join("")}
      </div>
      ${weight ? `<p class="analysis-note">W/kg bezogen auf ${fmt(weight)} kg (letzter Wellness-Wert) — Bezugsgröße pro Zeile beachten (gemessen ≠ geschätzt ≠ Ziel).</p>` : ""}
      ${forecastHtml}`;

    // Bestwerte-Digest
    const recBox = el("analysis-records");
    if (recBox) {
      const records = recordProgression(this._allRides);
      recBox.innerHTML = records.length
        ? `<div class="records-digest">
            ${records
              .map(
                (r) => `
              <div class="record-chip" title="${r.name || ""}">
                <span class="record-icon">${r.icon}</span>
                <span class="record-val">${r.unit === "min" ? fmtInt(r.value) : fmt(r.value)}&nbsp;${r.unit}</span>
                <span class="record-lbl">${r.label}</span>
                <span class="record-date">${fmtDate(r.date)}${r.history.length ? ` · ${r.history.length}× abgelöst` : ""}</span>
              </div>`
              )
              .join("")}
          </div>`
        : `<p class="analysis-empty">Noch keine Bestwerte erfasst.</p>`;
    }
  },

  /* ── 5b · Plan 1 vs Plan 2 Vergleich (bestehend) ──────────── */
  _renderComparison(ownPlan) {
    if (!ownPlan) {
      el("plan-comparison").innerHTML =
        `<p class="analysis-empty">Kein Plan-Vergleich für Vergleichsdaten verfügbar.</p>`;
      return;
    }
    const p1 = this._allRides.filter((r) => (r.plan || "Plan 1") === "Plan 1");
    const p2 = this._allRides.filter((r) => r.plan === "Plan 2");

    if (!p1.length || !p2.length) {
      el("plan-comparison").innerHTML =
        `<p class="analysis-empty">Vergleich verfügbar sobald beide Pläne Daten haben.</p>`;
      return;
    }

    const metrics = [
      {
        label: "Fahrten",
        p1: p1.length,
        p2: p2.length,
        fmt: (v) => v,
        unit: "",
        higherIsBetter: true,
      },
      {
        label: "Gesamtdistanz",
        p1: Math.round(sum(p1, "km")),
        p2: Math.round(sum(p2, "km")),
        fmt: (v) => v.toLocaleString("de"),
        unit: " km",
        higherIsBetter: true,
      },
      {
        label: "Ø Kadenz",
        p1: avg(
          p1.filter((r) => r.kad),
          "kad"
        ),
        p2: avg(
          p2.filter((r) => r.kad),
          "kad"
        ),
        fmt: (v) => fmtInt(v),
        unit: " RPM",
        higherIsBetter: true,
      },
      {
        label: "Ø HF",
        p1: avg(
          p1.filter((r) => r.hf),
          "hf"
        ),
        p2: avg(
          p2.filter((r) => r.hf),
          "hf"
        ),
        fmt: (v) => fmtInt(v),
        unit: " bpm",
        higherIsBetter: false,
      },
      {
        label: "Ø NP",
        p1: avg(
          p1.filter((r) => r.np),
          "np"
        ),
        p2: avg(
          p2.filter((r) => r.np),
          "np"
        ),
        fmt: (v) => fmtInt(v),
        unit: "W",
        higherIsBetter: true,
      },
      {
        label: "Peak CTL",
        p1: maxVal(
          p1.filter((r) => r.ctl),
          "ctl"
        ),
        p2: maxVal(
          p2.filter((r) => r.ctl),
          "ctl"
        ),
        fmt: (v) => fmt(v),
        unit: "",
        higherIsBetter: true,
      },
      {
        label: "Ø TSS/Woche",
        p1: sum(p1, "tss") / Math.max(1, [...new Set(p1.map((r) => r.week))].length),
        p2: sum(p2, "tss") / Math.max(1, [...new Set(p2.map((r) => r.week))].length),
        fmt: (v) => Math.round(v),
        unit: "",
        higherIsBetter: true,
      },
    ];

    el("plan-comparison").innerHTML = `
      <div class="comparison-table">
        <div class="comparison-header">
          <span></span>
          <span class="comparison-plan">Plan 1</span>
          <span class="comparison-plan">Plan 2</span>
          <span class="comparison-plan">Δ</span>
        </div>
        ${metrics
          .map((m) => {
            if (m.p1 == null || m.p2 == null) return "";
            const delta = m.p2 - m.p1;
            const better = m.higherIsBetter ? delta > 0 : delta < 0;
            const deltaCol =
              Math.abs(delta) < 0.5 ? "var(--dim)" : better ? "var(--green)" : "var(--red)";
            const deltaStr = (delta > 0 ? "+" : "") + m.fmt(delta) + m.unit;
            return `
            <div class="comparison-row">
              <span class="comparison-label">${m.label}</span>
              <span class="comparison-val">${m.fmt(m.p1)}${m.unit}</span>
              <span class="comparison-val">${m.fmt(m.p2)}${m.unit}</span>
              <span class="comparison-delta" style="color:${deltaCol}">${deltaStr}</span>
            </div>`;
          })
          .join("")}
      </div>`;
  },

  /* ── 6 · Regeneration & Körper (datengetrieben) ───────────── */
  _renderBody(today) {
    const section = el("asec-body");
    const wrap = el("analysis-body");
    if (!section || !wrap) return;

    const avail = availability(Data.wellness, today);
    section.classList.toggle("hidden", !avail.any);
    if (!avail.any) {
      wrap.innerHTML = "";
      return;
    }

    const cards = [];

    if (avail.weight) {
      const t = weightTrend(Data.wellness);
      if (t) {
        const ac = CONFIG.athleteConfig(Data.activeAthleteId) || {};
        const wkgMeasured = wattsPerKg(ac.ftpMeasured, t.current);
        const deltaCol =
          t.delta30d == null || Math.abs(t.delta30d) < 0.3
            ? "var(--dim)"
            : t.delta30d < 0
              ? "var(--z1, #4a9a6e)"
              : "var(--ss, #e08a3c)";
        cards.push(`
          <div class="aerobic-card">
            <div class="aerobic-title">Gewicht</div>
            <div class="aerobic-val">${fmt(t.current)}<span class="aerobic-unit">kg</span></div>
            <div class="aerobic-sub" style="color:${deltaCol}">${t.delta30d != null ? `${t.delta30d > 0 ? "+" : ""}${t.delta30d} kg / 30 Tage` : ""} · ${t.n} Messungen</div>
            ${wkgMeasured != null ? `<div class="aerobic-sub">${fmt(wkgMeasured)} W/kg (bezogen auf gemessene FTP ${ac.ftpMeasured} W)</div>` : ""}
          </div>`);
      }
    }

    if (avail.energy) {
      const _ac = CONFIG.athleteConfig(Data.activeAthleteId);
      let _estBMR = null;
      if (_ac && _ac.bmr) {
        const _wt = weightTrend(Data.wellness);
        const _rw = (_wt && _wt.points.length && _wt.points[_wt.points.length - 1].weight) || _ac.bmr.weightKg;
        _estBMR = estimateBMR({ weightKg: _rw, heightCm: _ac.bmr.heightCm, age: _ac.bmr.age, sex: _ac.bmr.sex });
      }
      const e = energyView(Data.wellness, _estBMR);
      if (e) {
        const gu = e.restingEstimated ? "Grundumsatz gesch." : "Grundumsatz";
        const parts = [];
        if (e.hasExpenditure) {
          parts.push(e.hasResting
            ? `Verbrauch Ø ${e.avgBurned.toLocaleString("de")} kcal/Tag (${gu} ${e.avgResting} + aktiv ${e.avgActive})`
            : `Aktiv verbrannt Ø ${e.avgActive.toLocaleString("de")} kcal/Tag`);
        }
        if (e.hasIntake) parts.push(`Zufuhr Ø ${e.avgIntake.toLocaleString("de")} kcal/Tag`);
        const headVal = e.hasExpenditure ? (e.hasResting ? e.avgBurned : e.avgActive) : e.avgIntake;
        const headUnit = e.hasExpenditure ? (e.hasResting ? "kcal/Tag Ø Verbrauch" : "kcal/Tag Ø aktiv") : "kcal/Tag Ø Zufuhr";
        cards.push(`
          <div class="aerobic-card">
            <div class="aerobic-title">Energie</div>
            <div class="aerobic-val">${headVal.toLocaleString("de")}<span class="aerobic-unit">${headUnit}</span></div>
            <div class="aerobic-sub">${parts.join(" · ")} · ${e.n} Tage</div>
            <div class="aerobic-sub">${e.hasExpenditure && e.hasIntake ? "Zufuhr unter dem Verbrauch = negatives Energiedefizit — bei hoher Last die Regeneration im Blick behalten." : "Quelle: intervals.icu (Apple Health / Amazfit)."}</div>
          </div>`);
      }
    }

    if (avail.hydration) {
      const h = hydrationSeries(Data.wellness);
      if (h) {
        cards.push(`
          <div class="aerobic-card">
            <div class="aerobic-title">Hydration</div>
            <div class="aerobic-val">${h.field === "hydrationVolume" ? h.avg.toLocaleString("de") : fmt(h.avg)}<span class="aerobic-unit">${h.field === "hydrationVolume" ? "ml/Tag Ø" : "Score Ø"}</span></div>
            <div class="aerobic-sub">${h.n} Tage erfasst · Dehydration treibt HF-Drift und verfälscht EF/Decoupling</div>
          </div>`);
      }
    }

    wrap.innerHTML = cards.join("");
    if (!cards.length) section.classList.add("hidden");
  },

  /* ── 7 · Konsistenz & Adhärenz ────────────────────────────── */
  _renderConsistency(ownPlan, today) {
    const box = el("analysis-consistency");
    if (!box) return;

    const c = buildConsistency(
      this._allRides,
      ownPlan ? Data.plannedSessions : null,
      ownPlan ? Data.adjustments : null,
      today
    );

    const freq = c.frequency;
    const freqStr = freq
      ? `${fmt(freq.recent)} Fahrten/Woche${freq.delta != null ? ` (${freq.delta > 0 ? "+" : ""}${freq.delta} vs. Vormonat)` : ""}`
      : "–";

    const chips = [
      { v: `${c.streak}`, l: "Wochen-Streak", sub: "aufeinanderfolgende Trainingswochen" },
      { v: freqStr, l: "Frequenz (4 Wochen)", sub: null },
    ];
    if (c.adherence) {
      chips.push({
        v: `${c.adherence.quote}%`,
        l: "Plan-Adhärenz",
        sub: `${c.adherence.done}/${c.adherence.planned} geplante Einheiten absolviert`,
      });
    }

    const missed = c.adherence?.missed?.length
      ? `<p class="analysis-note">Zuletzt verpasst: ${c.adherence.missed.map((m) => `${m.title} (${fmtDate(m.date)})`).join(" · ")}</p>`
      : "";

    box.innerHTML = `
      <div class="analysis-kpi-grid" style="margin-top:0">
        ${chips
          .map(
            (k) => `
          <div class="analysis-kpi">
            <div class="analysis-kpi-val">${k.v}</div>
            <div class="analysis-kpi-lbl">${k.l}</div>
            ${k.sub ? `<div class="analysis-kpi-sub">${k.sub}</div>` : ""}
          </div>`
          )
          .join("")}
      </div>
      ${missed}`;
  },

  /* ── 8 · Periodisierungs-Erfüllung (nur eigener Plan) ─────── */
  _renderPeriodization(ownPlan) {
    const section = el("asec-periodization");
    const box = el("analysis-periodization");
    if (!section || !box) return;

    section.classList.toggle("hidden", !ownPlan);
    if (!ownPlan) {
      box.innerHTML = "";
      return;
    }

    const c = phaseCompliance(this._allRides, (w) => CONFIG.weekIndex(w));
    if (!c) {
      box.innerHTML = `<p class="analysis-empty">Wird befüllt, sobald Plan-2-Blockwochen Fahrten mit Phasen-Zuordnung haben.</p>`;
      return;
    }

    const statusColor = {
      ok: "var(--z1, #4a9a6e)",
      teilweise: "var(--ss, #e08a3c)",
      abweichend: "var(--thr, #d94f4f)",
    };
    const blocksHtml = c.blocks
      .map(
        (b) => `
      <div class="phase-comp-row">
        <span class="phase-comp-dot" style="background:${CONFIG.phaseColor(b.phase)}"></span>
        <span class="phase-comp-name">${b.phase}</span>
        <span class="phase-comp-weeks">${b.weeks.join(", ")}</span>
        <span class="load-chip" style="color:${statusColor[b.status]}">${b.status === "ok" ? "phasengerecht" : b.status}</span>
        <span class="phase-comp-note">${b.note}</span>
      </div>`
      )
      .join("");

    const recoveryHtml = c.recovery.length
      ? `
      <div class="phase-comp-recovery">
        <div class="aerobic-title" style="margin-top:12px">Erholungswochen</div>
        ${c.recovery
          .map(
            (r) => `
          <div class="phase-comp-row">
            <span class="phase-comp-dot" style="background:${CONFIG.phaseColor("Erholung")}"></span>
            <span class="phase-comp-name">${r.week}</span>
            <span class="phase-comp-weeks">${r.tss} TSS${r.refTss != null ? ` vs. ${r.refTss} Nachbarwochen` : ""}</span>
            ${
              r.reduced == null
                ? `<span class="load-chip" style="color:var(--dim)">keine Referenz</span>`
                : `<span class="load-chip" style="color:${r.reduced ? "var(--z1, #4a9a6e)" : "var(--thr, #d94f4f)"}">${r.reduced ? "real reduziert" : "zu hart für Erholung"}</span>`
            }
          </div>`
          )
          .join("")}
      </div>`
      : "";

    box.innerHTML = blocksHtml
      ? blocksHtml + recoveryHtml
      : `<p class="analysis-empty">Noch keine Blockwochen (Sweet Spot / Schwelle / VO₂max) mit Daten.</p>` +
        recoveryHtml;
  },
};

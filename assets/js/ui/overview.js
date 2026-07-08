/* ============================================================
   UI/OVERVIEW.JS — Hero, Metriken
   ============================================================ */

import { fmt, fmtInt, fmtDuration } from "../core/format.js";
import {
  zoneSegments,
  pinPercent,
  ringProgress,
  nextPlannedSession,
} from "../core/ftp-progress.js";
import { eftpHistory, eftpHistoryFromWellness, mergeEftpHistories } from "../core/ftp-forecast.js";
import { avg, maxVal, sum } from "../core/stats.js";
import { CONFIG } from "../state/config.js";
import { Data } from "../state/data.js";
import { el, svgEl, Tooltip } from "./dom.js";
import { Planned } from "./planned.js";

export const Overview = {
  render(rides) {
    const ownPlan = rides.some((r) => r.week);
    this._renderHero(rides, ownPlan);
    this._renderMetrics(rides);
  },

  /* ── Hero ───────────────────────────────────────────────────── */
  _renderHero(rides, ownPlan) {
    const sorted = [...rides].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    if (!sorted.length) return;

    const first = sorted[0],
      last = sorted[sorted.length - 1];
    const athleteName = CONFIG.athletes.find((a) => a.id === Data.activeAthleteId)?.name || "";
    el("hero-sub").textContent = ownPlan
      ? `${first.dateShort} – ${last.dateShort} · ${CONFIG.planVersion}`
      : `${first.dateShort} – ${last.dateShort} · Vergleichsdaten · ${athleteName}`;

    // Hero-Beschreibung athletenabhängig
    const descEl = el("hero-desc");
    if (descEl) {
      if (ownPlan) {
        descEl.innerHTML = `<strong>Plan 1</strong>: 12 Wochen Basisaufbau (März–Juni 2026), FTP 166W → 193W. <strong>Plan 2</strong>: pyramidale Periodisierung seit Juni 2026, Ziel FTP ≥210W bis September. Daten automatisch aus intervals.icu und Apple Health.`;
      } else {
        descEl.innerHTML = `Vergleichsdaten von <strong>${athleteName}</strong> aus intervals.icu — reine Leistungsdaten ohne eigenen Trainingsplan.`;
      }
    }

    const ftpVal = Data.ftpValue();

    // Eyebrow: aktuelle Woche/Phase (aus der letzten Fahrt) bzw. Vergleichsmodus
    const eyebrowEl = el("hero-eyebrow");
    if (eyebrowEl) {
      if (ownPlan) {
        const lastWithWeek = [...sorted].reverse().find((r) => r.week);
        eyebrowEl.textContent = lastWithWeek
          ? `${lastWithWeek.plan || "Plan"} · ${lastWithWeek.week}${lastWithWeek.phase ? " · " + lastWithWeek.phase : ""}`
          : CONFIG.planVersion;
      } else {
        eyebrowEl.textContent = "Vergleichsdaten · read-only";
      }
    }

    this._renderSessionPill(rides, ownPlan);
    const eftpVal = this._eftpValue(rides, ownPlan);
    this._renderZoneBand(ftpVal, ownPlan, eftpVal);
    this._renderFtpRing(ftpVal, ownPlan, eftpVal);
  },

  /* ── Session-Pill: heutige bzw. nächste geplante Einheit ────── */
  _renderSessionPill(rides, ownPlan) {
    const wrap = el("hero-session");
    if (!wrap) return;
    if (!ownPlan || !Data.plannedSessions.length) {
      wrap.innerHTML = "";
      return;
    }

    const todayISO = new Date().toISOString().split("T")[0];
    const doneDates = new Set(rides.map((r) => r.date));
    const next = nextPlannedSession(Data.plannedSessions, Data.adjustments, doneDates, todayISO);
    if (!next) {
      wrap.innerHTML = "";
      return;
    }

    const color = Planned._typColor(next.typ);
    const when = next.isToday
      ? "Heute"
      : new Date(next.date).toLocaleDateString("de-DE", {
          weekday: "short",
          day: "2-digit",
          month: "2-digit",
        });
    const km = next.km ? ` · ~${next.km} km` : "";
    const details = next.workout?.label ? ` · ${next.workout.label}` : "";
    wrap.innerHTML = `
      <div class="session-pill" style="--sp-color:${color}">
        <span class="zdot"></span>
        <span>${when} · <b>${next.name || next.typ || "Einheit"}</b>${km}${details}</span>
      </div>`;
  },

  /* ── Zonen-Band: FTP-Leistungsskala mit Pins (Signatur) ─────── */
  _renderZoneBand(ftpVal, ownPlan, eftpVal) {
    const wrap = el("hero-zoneband");
    if (!wrap) return;
    const scaleMax = CONFIG.powerScaleMax;
    if (!ftpVal || !scaleMax) {
      wrap.innerHTML = "";
      return;
    }

    const segments = zoneSegments(ftpVal, scaleMax)
      .map((s) => `<span class="zseg-${s.cls}" style="width:${s.pct.toFixed(2)}%"></span>`)
      .join("");

    // Pins: FTP immer; eFTP + Saisonziel nur für den eigenen Plan
    const pins = [{ w: ftpVal, l: `FTP ${ftpVal}`, goal: false }];
    if (ownPlan) {
      if (eftpVal && eftpVal !== ftpVal)
        pins.push({ w: eftpVal, l: `eFTP ${eftpVal}`, goal: false });
      if (CONFIG.ftpGoal) pins.push({ w: CONFIG.ftpGoal, l: `Ziel ${CONFIG.ftpGoal}`, goal: true });
    }

    // Kollisionsvermeidung: FTP/eFTP/Ziel liegen dicht beieinander, deshalb
    // stapeln sich zu nah stehende Labels vertikal (Zeile 0/1/2) statt zu
    // überlappen. MIN_GAP ≈ Labelbreite in % der Skala.
    const MIN_GAP = 13;
    const placed = pins
      .map((p) => ({ ...p, pct: pinPercent(p.w, scaleMax) }))
      .filter((p) => p.pct != null)
      .sort((a, b) => a.pct - b.pct);
    const rowLastPct = [];
    let maxRow = 0;
    for (const p of placed) {
      let row = 0;
      while (rowLastPct[row] != null && p.pct - rowLastPct[row] < MIN_GAP) row++;
      rowLastPct[row] = p.pct;
      p.row = row;
      if (row > maxRow) maxRow = row;
    }
    const pinHtml = placed
      .map(
        (p) =>
          `<div class="pin${p.goal ? " goal" : ""}" style="left:${p.pct.toFixed(2)}%; --row:${p.row}" data-l="${p.l}"></div>`
      )
      .join("");

    const mid = Math.round(scaleMax / 2);
    const scaleGap = Math.max(32, 24 + maxRow * 15); // Platz für gestapelte Labels
    wrap.innerHTML = `
      <div class="zlabel">Leistungsskala · Watt @ FTP-Zonen</div>
      <div class="band">${segments}${pinHtml}</div>
      <div class="band-scale" style="margin-top:${scaleGap}px"><span>0 W</span><span>${mid} W</span><span>${scaleMax} W</span></div>`;
  },

  /* ── FTP-Fortschrittsring (Zonenfarben Z2 → Sweet Spot) ─────── */
  _renderFtpRing(ftpVal, ownPlan, eftpVal) {
    const wrap = el("hero-ring");
    if (!wrap) return;
    if (!ftpVal) {
      wrap.innerHTML = "";
      return;
    }

    const R = 84;
    const CIRC = 2 * Math.PI * R;
    let val, unit, cap, progress;

    if (ownPlan) {
      val = eftpVal || ftpVal;
      progress = ringProgress(val, CONFIG.ftpBase, CONFIG.ftpGoal);
      const remaining = Math.max(0, CONFIG.ftpGoal - val);
      unit = `VON ${CONFIG.ftpGoal} W`;
      cap =
        remaining > 0 ? `Saisonziel · noch <b>${remaining} W</b>` : `Saisonziel <b>erreicht</b> 🎉`;
    } else {
      val = ftpVal;
      const cfg = CONFIG.athleteConfig(Data.activeAthleteId);
      if (cfg?.ftpGoal) {
        // Vergleichsathlet mit Zielvorgabe: gemessene FTP → Ziel (wie Athlet 1)
        progress = Math.max(0, Math.min(1, val / cfg.ftpGoal));
        const remaining = Math.max(0, cfg.ftpGoal - val);
        unit = `VON ${cfg.ftpGoal} W`;
        cap = remaining > 0 ? `Ziel · noch <b>${remaining} W</b>` : `Ziel <b>erreicht</b> 🎉`;
      } else {
        progress = 1;
        unit = cfg?.ftpMeasured || Data.athleteFtp ? "W · RAMP-TEST" : "W · BESTES NP";
        cap = "Read-only · <b>kein Ziel</b>";
      }
    }

    wrap.innerHTML = `
      <svg width="200" height="200" viewBox="0 0 200 200" role="img" aria-label="FTP-Fortschritt">
        <circle cx="100" cy="100" r="${R}" fill="none" stroke="rgba(255,255,255,0.09)" stroke-width="13"/>
        <circle class="ring-progress" id="ftp-ring-arc" cx="100" cy="100" r="${R}" fill="none"
          stroke="url(#ftp-ring-grad)" stroke-width="13" stroke-linecap="round"
          stroke-dasharray="${CIRC.toFixed(1)}" stroke-dashoffset="${CIRC.toFixed(1)}" transform="rotate(-90 100 100)"/>
        <defs>
          <linearGradient id="ftp-ring-grad" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stop-color="#4a7fa8"/><stop offset="100%" stop-color="#e08a3c"/>
          </linearGradient>
        </defs>
        <text x="100" y="97" text-anchor="middle" class="ring-val">${val}</text>
        <text x="100" y="120" text-anchor="middle" class="ring-unit">${unit}</text>
      </svg>
      <div class="ring-cap">${cap}</div>`;

    // Fortschritt im nächsten Frame setzen → CSS-Transition läuft an
    const arc = el("ftp-ring-arc");
    requestAnimationFrame(() =>
      arc.setAttribute("stroke-dashoffset", (CIRC * (1 - progress)).toFixed(1))
    );
  },

  /* ── eFTP-Auflösung (geteilt von Ring & Kachel) ─────────────── */
  _eftpValue(rides) {
    const hist = mergeEftpHistories(eftpHistory(rides), eftpHistoryFromWellness(Data.wellness));
    if (hist.length) return hist[hist.length - 1].eftp;
    // Fallback: geschätzte FTP aus der pro-Athlet-Config, solange die Daten
    // noch keinen eFTP tragen (nach dem Sync übernimmt der Datenwert).
    return CONFIG.athleteConfig(Data.activeAthleteId)?.eFTP || null;
  },

  /* ── Metriken ───────────────────────────────────────────────── */
  _renderMetrics(rides) {
    const ownPlan = rides.some((r) => r.week);
    const totalKm = sum(rides, "km");
    const totalMin = sum(rides, "min");
    const avgKmh = avg(
      rides.filter((r) => r.kmh),
      "kmh"
    );
    const maxCTL = maxVal(
      rides.filter((r) => r.ctl != null),
      "ctl"
    );
    const maxKm = maxVal(rides, "km");
    const avgHF = avg(
      rides.filter((r) => r.hf),
      "hf"
    );
    const ftpVal = Data.ftpValue();
    const avgKad = avg(
      rides.filter((r) => r.kad),
      "kad"
    );
    const ac = CONFIG.athleteConfig(Data.activeAthleteId);
    // eFTP datengetrieben für beide Athleten (Config nur als Fallback für A1)
    const eftpVal = this._eftpValue(rides, ownPlan);

    const metrics = [
      {
        v: Math.round(totalKm).toLocaleString("de") + " km",
        l: "Gesamtdistanz",
        d: "Summierte Streckenlänge aller Fahrten",
        c: "var(--accent)",
      },
      {
        v: rides.length,
        l: "Fahrten",
        d: "Anzahl absolvierter Trainingseinheiten",
        c: "var(--text)",
      },
      {
        v: fmtDuration(totalMin),
        l: "Trainingszeit",
        d: "Gesamte Fahrtdauer ohne Pausen",
        c: "var(--blue)",
      },
      {
        v: fmt(avgKmh) + " km/h",
        l: "Ø Tempo",
        d: "Durchschnittliche Geschwindigkeit aller Fahrten",
        c: "var(--gold)",
      },
      {
        v: ftpVal ? ftpVal + "W" : "–",
        l: ownPlan || ac?.ftpMeasured ? "FTP (Ramp Test)" : "Bestes Ø-Watt (NP)",
        d:
          ownPlan || ac?.ftpMeasured
            ? `Gemessene FTP aus dem Ramp-Test${ac?.ftpMeasuredDate ? " vom " + ac.ftpMeasuredDate.split("-").reverse().join(".") : ""}`
            : "Höchster Normalized-Power-Wert einer Fahrt",
        c: "var(--gold)",
      },
      ...(eftpVal
        ? [
            {
              v: eftpVal + "W",
              l: "eFTP (Intervals.icu)",
              d: ownPlan
                ? "Geschätzte FTP aus den besten Leistungen über verschiedene Zeitfenster"
                : "Geschätzte FTP aus intervals.icu (Vergleichsdaten)",
              c: "var(--green)",
            },
          ]
        : []),
      {
        v: fmtInt(maxCTL),
        l: "CTL Peak",
        d: "Höchster Chronic Training Load — erreichte Fitnessstufe",
        c: "var(--green)",
      },
      {
        v: fmt(maxKm) + " km",
        l: "Längste Fahrt",
        d: "Die längste einzelne Ausfahrt",
        c: "var(--blue)",
      },
      {
        v: fmtInt(avgHF) + " bpm",
        l: "Ø Herzfrequenz",
        d: "Durchschnittliche HF über alle Fahrten mit HF-Daten",
        c: "var(--red)",
      },
      {
        v: fmtInt(avgKad) + " RPM",
        l: "Ø Kadenz",
        d: "Durchschnittliche Trittfrequenz über alle Fahrten",
        c: "var(--gold)",
      },
    ];

    el("metrics-grid").innerHTML = metrics
      .map(
        (m) => `
      <div class="metric-card" style="--mc-color:${m.c}">
        <div class="mc-value">${m.v}</div>
        <div class="mc-label">${m.l}</div>
        <div class="mc-desc">${m.d}</div>
      </div>
    `
      )
      .join("");
  },
};

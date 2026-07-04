/* ============================================================
   UI/OVERVIEW.JS — Hero, Metriken, Meilensteine
   ============================================================ */

import { fmt, fmtInt, fmtDuration } from "../core/format.js";
import { zoneSegments, pinPercent, ringProgress, nextPlannedSession } from "../core/ftp-progress.js";
import { avg, maxVal, sum } from "../core/stats.js";
import { CONFIG } from "../state/config.js";
import { Data } from "../state/data.js";
import { el, svgEl, Tooltip } from "./dom.js";
import { Planned } from "./planned.js";

export const Overview = {

  render(rides) {
    const ownPlan = rides.some(r => r.week);
    this._renderHero(rides, ownPlan);
    this._renderMetrics(rides);
    const ganttSection = el("milestones-gantt")?.closest(".chart-box");
    const ganttHeading = ganttSection?.previousElementSibling;
    if (ownPlan) {
      if (ganttSection) ganttSection.classList.remove("hidden");
      if (ganttHeading?.classList.contains("section-label-prominent")) ganttHeading.classList.remove("hidden");
      this._renderMilestones();
    } else {
      if (ganttSection) ganttSection.classList.add("hidden");
      if (ganttHeading?.classList.contains("section-label-prominent")) ganttHeading.classList.add("hidden");
    }
  },

  /* ── Hero ───────────────────────────────────────────────────── */
  _renderHero(rides, ownPlan) {
    const sorted = [...rides].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    if (!sorted.length) return;

    const first = sorted[0], last = sorted[sorted.length - 1];
    const athleteName = CONFIG.athletes.find(a => a.id === Data.activeAthleteId)?.name || "";
    el("hero-sub").textContent = ownPlan
      ? `${first.dateShort} – ${last.dateShort} · ${CONFIG.planVersion}`
      : `${first.dateShort} – ${last.dateShort} · Vergleichsdaten · ${athleteName}`;

    // Hero-Beschreibung athletenabhängig
    const descEl = el("hero-desc");
    if (descEl) {
      if (ownPlan) {
        descEl.innerHTML = `<strong>Plan 1</strong>: 12 Wochen Basisaufbau (März–Juni 2026), FTP 166W → 193W. <strong>Plan 2</strong>: pyramidale Periodisierung seit Juni 2026, Ziel FTP ≥210W bis September. Daten automatisch aus intervals.icu und Apple Health.`;
      } else {
        const hist = CONFIG.historicalVolume?.[Data.activeAthleteId];
        const histNote = hist
          ? ` Gesamtdistanz inkl. Strava-Historie vor Systembeitritt.`
          : "";
        descEl.innerHTML = `Vergleichsdaten von <strong>${athleteName}</strong> aus intervals.icu — reine Leistungsdaten ohne eigenen Trainingsplan.${histNote}`;
      }
    }

    const totalKm  = Math.round(sum(rides, "km"));
    const ftpVal   = Data.ftpValue();
    const totalMin = sum(rides, "min");

    // Eyebrow: aktuelle Woche/Phase (aus der letzten Fahrt) bzw. Vergleichsmodus
    const eyebrowEl = el("hero-eyebrow");
    if (eyebrowEl) {
      if (ownPlan) {
        const lastWithWeek = [...sorted].reverse().find(r => r.week);
        eyebrowEl.textContent = lastWithWeek
          ? `${lastWithWeek.plan || "Plan"} · ${lastWithWeek.week}${lastWithWeek.phase ? " · " + lastWithWeek.phase : ""}`
          : CONFIG.planVersion;
      } else {
        eyebrowEl.textContent = "Vergleichsdaten · read-only";
      }
    }

    this._renderSessionPill(rides, ownPlan);
    this._renderZoneBand(ftpVal, ownPlan);
    this._renderFtpRing(ftpVal, ownPlan);

    // Historisches Volumen addieren (nur für Athleten mit erfasster Historie)
    const hist2 = CONFIG.historicalVolume?.[Data.activeAthleteId];
    const historicalKm = hist2 ? Math.max(0, hist2.totalKmLifetime - hist2.kmAlreadyInSystem) : 0;
    const displayKm = totalKm + Math.round(historicalKm);

    // KPI-Kacheln mit Zonen-Akzentkante (K5): Kante trägt die Zonenfarbe,
    // der Wert bleibt neutral hell — Farbe = Bedeutung, nicht Dekoration
    el("hero-kpis").innerHTML = [
      { v: displayKm.toLocaleString("de"), l: historicalKm > 0 ? "Kilometer (inkl. Strava-Historie)" : "Kilometer",   c: "var(--ss)" },
      { v: rides.length,                 l: "Fahrten" + (historicalKm > 0 ? " (erfasst)" : ""),     c: "var(--z2)"   },
      { v: ftpVal ? `${ftpVal}W` : "–", l: ownPlan ? "FTP" : (Data.athleteFtp ? "FTP" : "Bestes NP"),         c: "var(--gold)"   },
      { v: fmtDuration(totalMin),        l: "Trainingszeit",  c: "var(--z1)"    },
    ].map(k => `
      <div class="hero-kpi" style="--kpi-c:${k.c}">
        <div class="kpi-value">${k.v}</div>
        <div class="kpi-label">${k.l}</div>
      </div>
    `).join("");
  },

  /* ── Session-Pill: heutige bzw. nächste geplante Einheit ────── */
  _renderSessionPill(rides, ownPlan) {
    const wrap = el("hero-session");
    if (!wrap) return;
    if (!ownPlan || !Data.plannedSessions.length) { wrap.innerHTML = ""; return; }

    const todayISO = new Date().toISOString().split("T")[0];
    const doneDates = new Set(rides.map(r => r.date));
    const next = nextPlannedSession(Data.plannedSessions, Data.adjustments, doneDates, todayISO);
    if (!next) { wrap.innerHTML = ""; return; }

    const color = Planned._typColor(next.typ);
    const when = next.isToday
      ? "Heute"
      : new Date(next.date).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
    const km = next.km ? ` · ~${next.km} km` : "";
    const details = next.workout?.label ? ` · ${next.workout.label}` : "";
    wrap.innerHTML = `
      <div class="session-pill" style="--sp-color:${color}">
        <span class="zdot"></span>
        <span>${when} · <b>${next.name || next.typ || "Einheit"}</b>${km}${details}</span>
      </div>`;
  },

  /* ── Zonen-Band: FTP-Leistungsskala mit Pins (Signatur) ─────── */
  _renderZoneBand(ftpVal, ownPlan) {
    const wrap = el("hero-zoneband");
    if (!wrap) return;
    const scaleMax = CONFIG.powerScaleMax;
    if (!ftpVal || !scaleMax) { wrap.innerHTML = ""; return; }

    const segments = zoneSegments(ftpVal, scaleMax)
      .map(s => `<span class="zseg-${s.cls}" style="width:${s.pct.toFixed(2)}%"></span>`)
      .join("");

    // Pins: FTP immer; eFTP + Saisonziel nur für den eigenen Plan
    const pins = [{ w: ftpVal, l: `FTP ${ftpVal}`, goal: false }];
    if (ownPlan) {
      if (CONFIG.eFTP && CONFIG.eFTP !== ftpVal) pins.push({ w: CONFIG.eFTP, l: `eFTP ${CONFIG.eFTP}`, goal: false });
      if (CONFIG.ftpGoal) pins.push({ w: CONFIG.ftpGoal, l: `Ziel ${CONFIG.ftpGoal}`, goal: true });
    }
    const pinHtml = pins
      .map(p => ({ ...p, pct: pinPercent(p.w, scaleMax) }))
      .filter(p => p.pct != null)
      .map(p => `<div class="pin${p.goal ? " goal" : ""}" style="left:${p.pct.toFixed(2)}%" data-l="${p.l}"></div>`)
      .join("");

    const mid = Math.round(scaleMax / 2);
    wrap.innerHTML = `
      <div class="zlabel">Leistungsskala · Watt @ FTP-Zonen</div>
      <div class="band">${segments}${pinHtml}</div>
      <div class="band-scale"><span>0 W</span><span>${mid} W</span><span>${scaleMax} W</span></div>`;
  },

  /* ── FTP-Fortschrittsring (Zonenfarben Z2 → Sweet Spot) ─────── */
  _renderFtpRing(ftpVal, ownPlan) {
    const wrap = el("hero-ring");
    if (!wrap) return;
    if (!ftpVal) { wrap.innerHTML = ""; return; }

    const R = 84;
    const CIRC = 2 * Math.PI * R;
    let val, unit, cap, progress;

    if (ownPlan) {
      val = CONFIG.eFTP || ftpVal;
      progress = ringProgress(val, CONFIG.ftpBase, CONFIG.ftpGoal);
      const remaining = Math.max(0, CONFIG.ftpGoal - val);
      unit = `VON ${CONFIG.ftpGoal} W`;
      cap = remaining > 0 ? `Saisonziel · noch <b>${remaining} W</b>` : `Saisonziel <b>erreicht</b> 🎉`;
    } else {
      val = ftpVal;
      progress = 1;
      unit = Data.athleteFtp ? "W · RAMP-TEST" : "W · BESTES NP";
      cap = "Read-only · <b>kein Ziel</b>";
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
    requestAnimationFrame(() => arc.setAttribute("stroke-dashoffset", (CIRC * (1 - progress)).toFixed(1)));
  },

  /* ── Metriken ───────────────────────────────────────────────── */
  _renderMetrics(rides) {
    const ownPlan  = rides.some(r => r.week);
    const totalKm  = sum(rides, "km");
    const totalMin = sum(rides, "min");
    const avgKmh   = avg(rides.filter(r => r.kmh), "kmh");
    const maxCTL   = maxVal(rides.filter(r => r.ctl != null), "ctl");
    const maxKm    = maxVal(rides, "km");
    const avgHF    = avg(rides.filter(r => r.hf), "hf");
    const ftpVal   = Data.ftpValue();
    const avgKad = avg(rides.filter(r => r.kad), "kad");

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
        l: ownPlan ? "FTP (Ramp Test)" : (Data.athleteFtp ? "FTP (Ramp Test)" : "Bestes Ø-Watt (NP)"),
        d: ownPlan ? "Gemessene Functional Threshold Power, 12.06.2026" : "Höchster Normalized-Power-Wert einer Fahrt",
        c: "var(--gold)",
      },
      ...(ownPlan ? [{
        v: CONFIG.eFTP + "W",
        l: "eFTP (Intervals.icu)",
        d: "Geschätzte FTP aus den besten Leistungen über verschiedene Zeitfenster",
        c: "var(--green)",
      }] : []),
      {
        v: fmtInt(maxCTL),
        l: "CTL Peak",
        d: "Höchster Chronic Training Load — erreichte Fitnessstufe",
        c: "var(--green)",
      },
      {
        v: fmt(maxKm) + " km",
        l: "Längste Fahrt",
        d: "Die längste einzelne Ausfahrt im Trainingsplan",
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

    el("metrics-grid").innerHTML = metrics.map(m => `
      <div class="metric-card" style="--mc-color:${m.c}">
        <div class="mc-value">${m.v}</div>
        <div class="mc-label">${m.l}</div>
        <div class="mc-desc">${m.d}</div>
      </div>
    `).join("");
  },

  /* ── Meilensteine Gantt ─────────────────────────────────────── */
  _renderMilestones() {
    const svg = el("milestones-gantt");
    if (!svg) return;
    svg.innerHTML = "";

    const milestones = [...CONFIG.manualMilestones]
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO));

    const W = 780, H = 215;
    const pad = { l: 24, r: 24, t: 12, b: 46 };
    const timelineY = H - pad.b;
    const cw = W - pad.l - pad.r;

    // Zeitachse: Vorbereitung bis Plan 2 Start
    const startDate = new Date("2026-03-17");
    const endDate   = new Date("2026-07-13");
    const totalMs   = endDate - startDate;

    const xOf = (dateStr) => {
      const ms = new Date(dateStr) - startDate;
      return pad.l + (ms / totalMs) * cw;
    };

    // Phasen inkl. Vorbereitung und Übergangswoche
    const phases = [
      { label: "Vorbereitung", start: "2026-03-17", end: "2026-03-30", color: "#c9a84c" },
      { label: "Plan 1",       start: "2026-03-31", end: "2026-06-21", color: "#4a7fa8" },
      { label: "Übergang",     start: "2026-06-22", end: "2026-06-28", color: "#c9a84c" },
      { label: "Plan 2 →",    start: "2026-06-29", end: "2026-07-13", color: "#e08a3c" },
    ];

    phases.forEach(ph => {
      const x1 = xOf(ph.start), x2 = xOf(ph.end);
      svg.appendChild(svgEl("rect", {
        x: x1, y: pad.t, width: x2 - x1, height: timelineY - pad.t,
        fill: ph.color, opacity: "0.08",
      }));
      const lbl = svgEl("text", {
        x: x1 + 6, y: pad.t + 11,
        "text-anchor": "start", fill: ph.color,
        "font-size": "9", "font-weight": "700", opacity: "0.8",
      });
      lbl.textContent = ph.label;
      svg.appendChild(lbl);
    });

    // Plan-Divider bei Übergangsstart
    [["2026-06-22", "#c9a84c"], ["2026-06-29", "#e08a3c"]].forEach(([d, c]) => {
      const x = xOf(d);
      svg.appendChild(svgEl("line", {
        x1: x, y1: pad.t + 16, x2: x, y2: timelineY,
        stroke: c, "stroke-width": "1", "stroke-dasharray": "4,3", opacity: "0.5",
      }));
    });

    // Zeitachse
    svg.appendChild(svgEl("line", {
      x1: pad.l, y1: timelineY, x2: W - pad.r - 4, y2: timelineY,
      stroke: "#2a3140", "stroke-width": "1.5",
    }));
    svg.appendChild(svgEl("polygon", {
      points: `${W - pad.r},${timelineY} ${W - pad.r - 6},${timelineY - 3} ${W - pad.r - 6},${timelineY + 3}`,
      fill: "#2a3140",
    }));

    // Monats-Ticks
    [["2026-04-01","Apr"],["2026-05-01","Mai"],["2026-06-01","Jun"],["2026-07-01","Jul"]].forEach(([d, l]) => {
      const x = xOf(d);
      if (x < pad.l || x > W - pad.r) return;
      svg.appendChild(svgEl("line", {
        x1: x, y1: timelineY, x2: x, y2: timelineY + 4,
        stroke: "#232a37", "stroke-width": "1",
      }));
      const t = svgEl("text", { x, y: timelineY + 22, "text-anchor": "middle", fill: "#5f6878", "font-size": "9" });
      t.textContent = l;
      svg.appendChild(t);
    });

    // Kurze Labels
    const SHORT_LABELS = {
      "2026-05-12": "1. Rennen",
      "2026-06-05": "100 km",
      "2026-06-12": "FTP 193W",
      "2026-06-17": "PB 200W NP",
      "2026-06-19": "138 km",
    };

    // Ebenen-System
    const LEVELS = 3;
    const LEVEL_Y = [timelineY - 100, timelineY - 62, timelineY - 26];
    const MIN_DIST = 68;
    const lastX = new Array(LEVELS).fill(-999);

    // Datum-Labels: Mindestabstand 30px, sonst verschieben
    const usedDateX = [];

    milestones.forEach((m) => {
      const x = xOf(m.dateISO);
      const isPlan2 = m.dateISO >= "2026-06-29";
      const isTransition = m.dateISO >= "2026-06-22" && m.dateISO < "2026-06-29";
      const color = isPlan2 ? "#e08a3c" : isTransition ? "#c9a84c" : "#4a7fa8";

      // Freie Ebene
      let level = -1;
      for (let l = 0; l < LEVELS; l++) {
        if (x - lastX[l] >= MIN_DIST) { level = l; break; }
      }
      if (level === -1) {
        // Ebene mit größtem Abstand wählen
        level = lastX.map((lx, i) => ({ i, d: x - lx })).sort((a, b) => b.d - a.d)[0].i;
      }
      lastX[level] = x;
      const labelY = LEVEL_Y[level];

      // Verbindungslinie
      svg.appendChild(svgEl("line", {
        x1: x, y1: labelY + 20, x2: x, y2: timelineY - 6,
        stroke: color, "stroke-width": "1", "stroke-dasharray": "2,2", opacity: "0.4",
      }));

      // Pfeilspitze
      svg.appendChild(svgEl("polygon", {
        points: `${x},${timelineY - 3} ${x - 3},${timelineY - 9} ${x + 3},${timelineY - 9}`,
        fill: color, opacity: "0.7",
      }));

      // Icon + Label
      const icon = svgEl("text", { x, y: labelY, "text-anchor": "middle", "font-size": "14" });
      icon.textContent = m.icon;
      svg.appendChild(icon);

      const lbl = svgEl("text", {
        x, y: labelY + 12, "text-anchor": "middle",
        fill: color, "font-size": "8", "font-weight": "600",
      });
      lbl.textContent = SHORT_LABELS[m.dateISO] || m.text.slice(0, 10);
      svg.appendChild(lbl);

      // Datum an Zeitachse — mit Mindestabstand zur Überschneidungsvermeidung
      let dateX = x;
      const tooClose = usedDateX.find(ux => Math.abs(ux - x) < 28);
      if (tooClose) dateX = x + (x > tooClose ? 14 : -14);
      usedDateX.push(x);

      svg.appendChild(svgEl("line", {
        x1: x, y1: timelineY, x2: x, y2: timelineY + 4,
        stroke: color, "stroke-width": "1.5",
      }));
      const dlbl = svgEl("text", {
        x: dateX, y: timelineY + 13,
        "text-anchor": "middle", fill: color, "font-size": "7.5", "font-weight": "600",
      });
      dlbl.textContent = m.date.slice(0, 5);
      svg.appendChild(dlbl);

      // Tooltip Hit-Area
      const hit = svgEl("rect", { x: x - 38, y: labelY - 16, width: 76, height: 44, fill: "transparent" });
      hit.style.cursor = "pointer";
      hit.addEventListener("mouseenter", e => Tooltip.show(e, `
        <div class="tt">${m.date} · ${m.week}</div>
        <div class="tv">${m.icon} ${m.text}</div>
        <div class="td">${isPlan2 ? "Plan 2" : isTransition ? "Übergang" : "Plan 1"}</div>
      `));
      hit.addEventListener("mouseleave", () => Tooltip.hide());
      svg.appendChild(hit);
    });
  },
};

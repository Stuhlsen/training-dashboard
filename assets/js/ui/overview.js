/* ============================================================
   UI/OVERVIEW.JS — Hero, Metriken
   ============================================================ */

import { fmt, fmtInt, fmtDuration, fmtDate, weatherIcon } from "../core/format.js";
import {
  pinPercent,
  ringProgress,
  nextPlannedSession,
  workoutWattRange,
  workoutDurationMinutes,
  estimateSessionTSS,
  buildMilestones,
} from "../core/ftp-progress.js";
import { computeZones, sweetSpotBand, whatIfScaleMax, last7DayZoneTimes } from "../core/zones.js";
import { eftpHistory, eftpHistoryFromWellness, mergeEftpHistories } from "../core/ftp-forecast.js";
import { avg, maxVal, sum } from "../core/stats.js";
import { CONFIG } from "../state/config.js";
import { Data } from "../state/data.js";
import { el } from "./dom.js";
import { Planned } from "./planned.js";

/* Obergrenze des What-if-Sliders (Ziel-FTP) — siehe _bindWhatIf(). Die
 * Referenzskala der Zonenband-Breiten kommt aus core/zones.js::whatIfScaleMax
 * (Skalenmax + fester Watt-Puffer) — NICHT aus einer reinen Multiplikation
 * mit whatIfFtp (self-relative) und NICHT aus einer komplett fixen Konstante:
 * beide Extreme frieren jeweils einen Teil der Anzeige ein (Zonenbreiten
 * bzw. Ziel-Marker bei self-relative; FTP-/eFTP-Marker bei komplett fix) —
 * siehe die ausführliche Begründung + Regressionstests in
 * core/zones.js::whatIfScaleMax und tests/zones-coggan.test.js. Der äußere
 * Skala-CONTAINER selbst bekommt HIER NIRGENDS eine Breite gesetzt — nur
 * die Kind-Elemente (Segmente/Overlay/Pins) per %-Breite relativ zu diesem
 * Skalenwert; die Container-Pixelbreite kommt ausschließlich aus dem CSS-
 * Layout (.zoneband/.band in components.css) und bleibt beim Slidern fix. */
const WHATIF_MAX_FTP = 430;

export const Overview = {
  /** Zwischenspeicher für den What-if-Slider (ftpVal/eftpVal/7-Tage-Zeiten
   *  ändern sich nicht während des Sliderziehens — nur einmal pro Render
   *  berechnen, nicht bei jedem input-Event). */
  _heroState: {},

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
    const ac = CONFIG.athleteConfig(Data.activeAthleteId);
    const athleteName = ac?.name || "";
    const sources = (ac?.dataSources || []).join(" + ");

    // Untertitel: nur noch Zeitraum + Datenquellen — kein hardcodierter
    // Plan-Text mehr (siehe AGENTS.md: kein Plan-1/Plan-2-Wissen im UI-Layer).
    el("hero-sub").textContent = ownPlan
      ? `${first.dateShort} – ${last.dateShort} · ${sources}`
      : `${first.dateShort} – ${last.dateShort} · Vergleichsdaten · ${sources}`;

    const descEl = el("hero-desc");
    if (descEl) {
      // Athlet 2: kein "ohne eigenen Trainingsplan" mehr — fachlich falsch,
      // da ein Plan noch folgt. Neutrale Formulierung ohne erfundenen
      // Platzhalter (kein "in Vorbereitung"-Text ohne echte Datenbasis).
      descEl.innerHTML = ownPlan
        ? `Strukturierter Trainingsplan mit Periodisierung über mehrere Blöcke. Daten automatisch aus ${sources}.`
        : `Trainingsdaten von <strong>${athleteName}</strong> aus ${sources}.`;
    }

    // Phasen-Badge: nur befüllen wenn die letzte Fahrt mit Wochenangabe
    // auch eine Phase trägt — sonst ausgeblendet statt Platzhalter
    // (.hero-eyebrow:empty{display:none} in components.css).
    const eyebrowEl = el("hero-eyebrow");
    if (eyebrowEl) {
      const lastWithWeek = ownPlan ? [...sorted].reverse().find((r) => r.week) : null;
      eyebrowEl.textContent = lastWithWeek?.phase
        ? `${lastWithWeek.week} · ${lastWithWeek.phase}`
        : "";
    }

    const badgeEl = el("hero-athlete-badge");
    if (badgeEl) badgeEl.textContent = athleteName;

    this._renderSessionPill(rides, ownPlan);

    const ftpVal = Data.ftpValue();
    const eftpVal = this._eftpValue(rides);
    const todayISO = new Date().toISOString().split("T")[0];
    this._heroState = { ftpVal, eftpVal, sevenDaySecs: last7DayZoneTimes(rides, todayISO) };

    this._renderFtpRing(ac, eftpVal);
    this._renderMilestones(ac, eftpVal);
    this._bindWhatIf(ac, eftpVal);
  },

  /* ── Session-Karte: heutige bzw. nächste geplante Einheit ────── */
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

    // Watt-Ziel/Dauer/TSS nur für strukturierte Einheiten (next.workout) —
    // bei Recovery/Z2/Gruppenfahrten gibt es keine harten Vorgaben, dort
    // wird nichts erfunden, nur der bestehende Freitext (details) gezeigt.
    let detailHtml = "";
    if (next.workout) {
      const ftpVal = Data.ftpValue();
      const wattRange = workoutWattRange(next.workout, ftpVal);
      const minutes = workoutDurationMinutes(next.workout);
      const tss = estimateSessionTSS(next.workout);
      // workout.label trägt die Intervallstruktur (z.B. "3×10 min @ SS") —
      // die reine Watt/Dauer/TSS-Rechnung verliert diese Information sonst.
      const parts = [];
      if (next.workout.label) parts.push(next.workout.label);
      if (wattRange) parts.push(`aktuell ${wattRange[0]}–${wattRange[1]} W`);
      if (minutes) parts.push(`~${minutes} min gesamt`);
      if (tss) parts.push(`TSS ~${tss}`);
      if (parts.length) detailHtml = `<div class="session-detail">${parts.join(" · ")}</div>`;
    } else if (next.details) {
      detailHtml = `<div class="session-detail">${next.details}</div>`;
    }

    const wx = Data.forecast?.[next.date];
    const weatherHtml = wx
      ? `<div class="session-weather">${weatherIcon(wx.weatherCode)} ${fmt(wx.temp, 0)}°C${
          wx.precipProb != null ? ` · ${fmtInt(wx.precipProb)}% Regen` : ""
        }</div>`
      : "";

    wrap.innerHTML = `
      <div class="session-pill" style="--sp-color:${color}">
        <span class="zdot"></span>
        <span>${when} · <b>${next.name || next.typ || "Einheit"}</b>${km}</span>
      </div>
      ${detailHtml}
      ${weatherHtml}`;
  },

  /* ── Zonen-Band: interaktive Leistungsskala (Coggan-Zonen) ───── */
  _renderZoneBand(whatIfFtp) {
    const wrap = el("hero-zoneband");
    if (!wrap) return;
    const { ftpVal, eftpVal, sevenDaySecs } = this._heroState;
    if (!whatIfFtp) {
      wrap.innerHTML = "";
      return;
    }

    const zones = computeZones(whatIfFtp);
    const ss = sweetSpotBand(whatIfFtp);
    // core/zones.js::whatIfScaleMax (Skalenmax + Watt-Puffer) — siehe
    // ausführlichen Kommentar oben, warum weder eine reine Multiplikation
    // von whatIfFtp noch eine komplett fixe Konstante hier richtig wäre.
    const scaleMax = whatIfScaleMax(whatIfFtp);
    if (!zones.length) {
      wrap.innerHTML = "";
      return;
    }

    const segments = zones
      .map((z, i) => {
        const pct = ((z.bisW - z.vonW) / scaleMax) * 100;
        return `<span class="zseg-${z.id}" data-zone-idx="${i}" tabindex="0" style="width:${pct.toFixed(2)}%"></span>`;
      })
      .join("");
    // Zonen-Beschriftung nur wenn ein Segment breit genug ist (≥6% der
    // Skala), sonst überlappen die Kürzel auf schmalen Bändern.
    const segLabels = zones
      .map((z) => {
        const pct = ((z.bisW - z.vonW) / scaleMax) * 100;
        return `<span style="width:${pct.toFixed(2)}%">${pct >= 6 ? z.id.toUpperCase() : ""}</span>`;
      })
      .join("");

    // Sweet-Spot-Overlay (88–94% FTP) — KEIN Segment, sondern ein Akzent-
    // balken über der Z3/Z4-Naht (core/zones.js::sweetSpotBand), MIT
    // Beschriftung darüber. Label horizontal an der Bandmitte verankert
    // (translateX(-50%) in CSS) statt an die Overlay-Breite gebunden, damit
    // es auch bei einem schmalen Overlay (Slider nahe Skalenminimum) nicht
    // abgeschnitten wird.
    const ssLeft = pinPercent(ss.vonW, scaleMax);
    const ssRight = pinPercent(ss.bisW, scaleMax);
    let ssOverlay = "";
    if (ssLeft != null && ssRight != null) {
      const ssMid = (ssLeft + ssRight) / 2;
      ssOverlay = `
        <div class="ss-overlay" style="left:${ssLeft.toFixed(2)}%; width:${(ssRight - ssLeft).toFixed(2)}%"></div>
        <div class="ss-label" style="left:${ssMid.toFixed(2)}%">Sweet Spot</div>`;
    }

    // Pins: FTP (Ramp-Test/gemessen) immer, eFTP wenn abweichend, Ziel-
    // Marker = der aktuelle What-if-Wert (bewegt sich live mit dem Slider).
    const pins = [{ w: ftpVal, l: `FTP ${ftpVal}`, goal: false }];
    if (eftpVal && eftpVal !== ftpVal) pins.push({ w: eftpVal, l: `eFTP ${eftpVal}`, goal: false });
    pins.push({ w: whatIfFtp, l: `Ziel ${whatIfFtp}`, goal: true });

    // Kollisionsvermeidung: dicht beieinanderliegende Pins stapeln sich
    // vertikal (Zeile 0/1/2) statt zu überlappen.
    const MIN_GAP = 16;
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

    // Z6+-Andeutung sitzt direkt hinter dem tatsächlichen Zone-5-Ende (nicht
    // am rechten Bandrand fixiert) — durch den Watt-Puffer in whatIfScaleMax
    // liegt dieses Ende nie exakt bei 100% (siehe Import-Kommentar oben).
    const z5EndPct = pinPercent(zones[zones.length - 1].bisW, scaleMax);
    const z6Edge = z5EndPct != null ? `<div class="z6-edge" style="left:${z5EndPct.toFixed(2)}%"></div>` : "";

    const mid = Math.round(scaleMax / 2);
    // +12px Kopfraum für das Sweet-Spot-Label über dem Band (siehe .ss-label
    // in components.css) — zusätzlich zum bestehenden Pin-Stacking-Abstand.
    const scaleGap = Math.max(47, 39 + maxRow * 15);
    wrap.innerHTML = `
      <div class="zlabel">Leistungsskala · Watt (Hover für Details)</div>
      <div class="band">${segments}${ssOverlay}${z6Edge}${pinHtml}<div class="zone-tooltip" id="hero-zone-tooltip"></div></div>
      <div class="band-labels">${segLabels}</div>
      <div class="band-scale" style="margin-top:${scaleGap}px"><span>0 W</span><span>${mid} W</span><span>${scaleMax} W</span></div>`;

    this._bindZoneTooltips(wrap, zones, scaleMax, sevenDaySecs);
  },

  /* ── Hover-Tooltips pro Zonen-Segment (Name/Wattbereich/7-Tage-Zeit) ── */
  _bindZoneTooltips(wrap, zones, scaleMax, sevenDaySecs) {
    const tooltip = wrap.querySelector("#hero-zone-tooltip");
    if (!tooltip) return;
    wrap.querySelectorAll(".band [data-zone-idx]").forEach((span) => {
      const i = Number(span.dataset.zoneIdx);
      const z = zones[i];
      const secs = sevenDaySecs?.[i] || 0;
      const show = () => {
        const pct = ((z.vonW + z.bisW) / 2 / scaleMax) * 100;
        tooltip.style.left = `${Math.min(96, Math.max(4, pct)).toFixed(2)}%`;
        // z.farbe ist bereits "var(--z1)" etc. (core/zones.js::computeZones)
        // — als Akzent (Punkt + Wattzahl) übernehmen, damit sofort klar ist,
        // welche Zone gehovert wird, statt einer grauen Wattzahl.
        tooltip.style.setProperty("--tt-accent", z.farbe);
        tooltip.innerHTML = `<b><span class="tt-dot"></span>${z.label}</b><br><span class="tt-watt">${z.vonW}–${z.bisW} W</span><br>${secs > 0 ? fmtDuration(secs / 60) : "0:00h"} · letzte 7 Tage`;
        tooltip.classList.add("visible");
      };
      const hide = () => tooltip.classList.remove("visible");
      span.addEventListener("mouseenter", show);
      span.addEventListener("mouseleave", hide);
      span.addEventListener("focus", show);
      span.addEventListener("blur", hide);
    });
  },

  /* ── What-if-Slider: Ziel-FTP live erkunden ──────────────────── */
  _bindWhatIf(ac, eftpVal) {
    const wrap = el("hero-whatif");
    if (!wrap) return;
    const { ftpVal } = this._heroState;
    const base = eftpVal || ftpVal;
    if (!base) {
      wrap.innerHTML = "";
      this._renderZoneBand(0);
      return;
    }

    const min = Math.max(50, Math.round(base - 20));
    const max = WHATIF_MAX_FTP;
    const start = Math.min(max, Math.max(min, ac?.ftpGoal || base));

    wrap.innerHTML = `
      <div class="wi-label"><span>What-if · Ziel-FTP</span><b id="hero-whatif-val">${start} W</b></div>
      <input type="range" id="hero-whatif-slider" min="${min}" max="${max}" step="1" value="${start}"
        aria-label="Ziel-FTP für die Leistungsskala (nur Vorschau, ändert nicht das echte Saisonziel)">
      <div class="wi-readout" id="hero-whatif-readout"></div>`;

    this._renderZoneBand(start);
    this._updateWhatIfReadout(start, eftpVal);

    // Der Slider feuert "input" ggf. sehr häufig (jede Wertänderung beim
    // Ziehen) — _renderZoneBand baut das Band per innerHTML komplett neu
    // auf. Auf höchstens einen Rebuild pro Animationsframe drosseln, statt
    // synchron bei jedem Tick zu rendern.
    const slider = el("hero-whatif-slider");
    let pendingFrame = null;
    slider.addEventListener("input", () => {
      const v = Number(slider.value);
      el("hero-whatif-val").textContent = `${v} W`;
      if (pendingFrame != null) return;
      pendingFrame = requestAnimationFrame(() => {
        pendingFrame = null;
        this._renderZoneBand(Number(slider.value));
        this._updateWhatIfReadout(Number(slider.value), eftpVal);
      });
    });
  },

  _updateWhatIfReadout(whatIfFtp, eftpVal) {
    const readout = el("hero-whatif-readout");
    if (!readout) return;
    if (eftpVal == null) {
      readout.textContent = `Ziel-FTP ${whatIfFtp} W`;
      return;
    }
    const remaining = Math.max(0, whatIfFtp - eftpVal);
    readout.textContent =
      remaining > 0
        ? `noch ${remaining} W bis ${whatIfFtp} W (Skala nur Vorschau — echtes Saisonziel siehe Ring)`
        : `Ziel-FTP ${whatIfFtp} W bereits erreicht`;
  },

  /* ── FTP-Fortschrittsring (Zonenfarben Z2 → Sweet Spot) ─────── */
  _renderFtpRing(ac, eftpVal) {
    const wrap = el("hero-ring");
    if (!wrap) return;
    const { ftpVal } = this._heroState;
    if (!ftpVal || !ac) {
      wrap.innerHTML = "";
      return;
    }

    const R = 84;
    const CIRC = 2 * Math.PI * R;
    const val = eftpVal || ftpVal;
    let unit, cap, progress;

    if (ac.ftpGoal) {
      // Mit echter Saison-Basis (Athlet 1: seasonStartFtp) zeigt der Ring
      // Fortschritt SEIT Saisonstart. Ohne Saison-Basis (Athlet 2: kein
      // eigener Plan) wäre ftpMeasured als Basis ein irreführender Anker —
      // der aktuelle eFTP liegt oft UNTER dem letzten Ramp-Test-Wert, was
      // den Ring fälschlich fast leer zeigen würde. Dort einfacher Anteil
      // am Ziel (wie vor dem athletenagnostischen Umbau).
      progress =
        ac.seasonStartFtp != null
          ? ringProgress(val, ac.seasonStartFtp, ac.ftpGoal)
          : Math.max(0, Math.min(1, val / ac.ftpGoal));
      const remaining = Math.max(0, ac.ftpGoal - val);
      unit = `VON ${ac.ftpGoal} W`;
      cap =
        remaining > 0 ? `Saisonziel · noch <b>${remaining} W</b>` : `Saisonziel <b>erreicht</b> 🎉`;
    } else {
      progress = 1;
      unit = ac.ftpMeasured ? "W · RAMP-TEST" : "W · BESTES NP";
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
    requestAnimationFrame(() =>
      arc.setAttribute("stroke-dashoffset", (CIRC * (1 - progress)).toFixed(1))
    );
  },

  /* ── Meilenstein-Liste (Start-FTP/Ramp-Test/eFTP/Ziel) ───────── */
  _renderMilestones(ac, eftpVal) {
    const wrap = el("hero-milestones");
    if (!wrap) return;
    const milestones = buildMilestones(ac, eftpVal);
    wrap.innerHTML = milestones
      .map(
        (m) => `
      <li>
        <span class="ms-label">${m.label}</span>
        <span><span class="ms-value">${m.value} W</span>${m.date ? `<span class="ms-date"> · ${fmtDate(m.date)}</span>` : ""}</span>
      </li>`
      )
      .join("");
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

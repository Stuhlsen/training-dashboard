/* ============================================================
   PLANNED.JS — Geplante Fahrten Tab
   - Zeigt alle geplanten Sessions aus PLANNED_SESSIONS
   - Abgleich mit tatsächlichen Fahrten (erledigt/ausstehend)
   - Wetter-Forecast via Open-Meteo (bis 16 Tage voraus)
   - Push strukturierter Workouts zu intervals.icu
   - Session-Verschiebung via adjustments.json
   ============================================================ */

// === Adjustments GitHub-Sync ===
window.Adjustments = {
  _data: null,
  _token: null,

  async load() {
    try {
      // raw.githubusercontent.com umgeht den GitHub Pages CDN-Cache
      const res = await fetch(
        "https://raw.githubusercontent.com/Stuhlsen/training-dashboard/main/data/adjustments.json?_=" + Date.now()
      );
      if (res.ok) {
        this._data = await res.json();
      } else {
        this._data = {};
      }
    } catch { this._data = {}; }
    this._data = { ...(Data.adjustments || {}), ...this._data };
    return this._data;
  },

  get(date) { return this._data?.[date] || null; },

  getToken() {
    if (!this._token) this._token = localStorage.getItem("gh_token");
    return this._token;
  },

  promptToken() {
    const t = prompt("GitHub Personal Access Token eingeben:");
    if (t) { this._token = t; localStorage.setItem("gh_token", t); }
    return t;
  },

  async cancel(origDate, reason) {
    if (!this._data) this._data = {};
    this._data[origDate] = { cancelled: true, reason: reason || "", savedAt: new Date().toISOString() };
    return await this._write(`plan: ${origDate} ausgefallen${reason ? " (" + reason + ")" : ""}`);
  },

  async save(origDate, movedTo, reason) {
    if (!this._data) this._data = {};
    this._data[origDate] = { movedTo, reason: reason || "", savedAt: new Date().toISOString() };
    return await this._write(`plan: ${origDate} → ${movedTo}${reason ? " (" + reason + ")" : ""}`);
  },

  async remove(origDate) {
    if (!this._data?.[origDate]) return { ok: true };
    delete this._data[origDate];
    return await this._write(`plan: Verschiebung ${origDate} rückgängig`);
  },

  async _write(message) {
    let token = this.getToken();
    if (!token) token = this.promptToken();
    if (!token) return { ok: false, msg: "Kein Token" };
    try {
      const infoRes = await fetch(
        "https://api.github.com/repos/Stuhlsen/training-dashboard/contents/data/adjustments.json",
        { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } }
      );
      if (!infoRes.ok) {
        const err = await infoRes.json();
        console.error("GET adjustments.json Fehler:", err);
        if (infoRes.status === 401) {
          localStorage.removeItem("gh_token"); this._token = null;
          return { ok: false, msg: "Token ungültig — bitte Seite neu laden und Token neu eingeben" };
        }
        return { ok: false, msg: `GET Fehler ${infoRes.status}: ${err.message}` };
      }
      const info = await infoRes.json();
      const content = btoa(unescape(encodeURIComponent(JSON.stringify(this._data, null, 2))));
      const putRes = await fetch(
        "https://api.github.com/repos/Stuhlsen/training-dashboard/contents/data/adjustments.json",
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
          body: JSON.stringify({ message, content, sha: info.sha }),
        }
      );
      if (!putRes.ok) {
        const err = await putRes.json();
        console.error("PUT adjustments.json Fehler:", err);
        if (putRes.status === 401) {
          localStorage.removeItem("gh_token"); this._token = null;
          return { ok: false, msg: "Token ungültig — bitte Seite neu laden und Token neu eingeben" };
        }
        return { ok: false, msg: `PUT Fehler ${putRes.status}: ${err.message}` };
      }
      return { ok: true };
    } catch (e) {
      console.error("Adjustments Write Exception:", e);
      return { ok: false, msg: e.message };
    }
  },
};

window.Planned = {

  /* ── Typ → Farbe ───────────────────────────────────────────── */
  _typColor(typ) {
    const map = {
      "Sweet Spot":  "#e07b39",
      "Schwelle":    "#d94f4f",
      "VO2max":      "#b83dba",
      "Z2 Lang":     "#4a7fa8",
      "Z2 Dauer":    "#4a7fa8",
      "Z1 Recovery": "#5c9e6e",
      "Gruppenfahrt":"#c9a84c",
      "FTP-Test":    "#c9a84c",
    };
    return map[typ] || "#6b7280";
  },

  /* ── Typ → Icon ────────────────────────────────────────────── */
  _typIcon(typ) {
    const map = {
      "Sweet Spot":  "⚡",
      "Schwelle":    "🔥",
      "VO2max":      "💜",
      "Z2 Lang":     "🚴",
      "Z2 Dauer":    "🚴",
      "Z1 Recovery": "🌿",
      "Gruppenfahrt":"👥",
      "FTP-Test":    "🎯",
    };
    return map[typ] || "📅";
  },

  /* ── Wochentag auf Deutsch ─────────────────────────────────── */
  _weekday(dateStr) {
    const days = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
    return days[new Date(dateStr).getDay()];
  },

  /* ── Datum formatieren ─────────────────────────────────────── */
  _fmtDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  },

  _openInTable(date) {
    window._activateTab("table");
    setTimeout(() => Table.highlightByDate(date), 50);
  },

  scrollToDate(date) {
    const item = document.querySelector(`.planned-done-item--link[data-ride-date="${date}"], .done-card-link[data-ride-date="${date}"]`);
    if (item) {
      item.closest(".planned-card, .planned-done-item") ?.classList.add("row-highlight");
      item.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => item.closest(".planned-card, .planned-done-item")?.classList.remove("row-highlight"), 2500);
    }
  },

  /* ── Wetter-Forecast laden (Open-Meteo, bis 16 Tage) ───────── */
  /* ── Wetter-Forecast lesen (serverseitig berechnet — Standort
       bleibt in GitHub Secrets, nie im Frontend-Code sichtbar) ── */
  async _loadForecast() {
    return Data.forecast || {};
  },

  /* ── Workout zu intervals.icu pushen ───────────────────────── */
  async _pushWorkout(session, token, athleteId) {
    const w = session.workout;
    if (!w) return { ok: false, msg: "Kein strukturiertes Workout definiert" };

    // Workout-Schritte aufbauen
    const steps = [];

    // Warm-up
    steps.push({
      type: "SteadyState",
      duration: w.warmup * 60,
      power: { value: 0.60, units: "PercentOfFTP" },
      cadence: { value: 85, units: "RPM" },
    });

    // Intervalle
    if (w.intervals && w.duration) {
      const pctMid = (w.pct[0] + w.pct[1]) / 2 / 100;
      const restPct = 0.50;

      for (let i = 0; i < w.intervals; i++) {
        steps.push({
          type: "SteadyState",
          duration: w.duration * 60,
          power: { value: pctMid, units: "PercentOfFTP" },
          cadence: { value: 90, units: "RPM" },
        });
        if (i < w.intervals - 1) {
          steps.push({
            type: "SteadyState",
            duration: w.rest * 60,
            power: { value: restPct, units: "PercentOfFTP" },
            cadence: { value: 80, units: "RPM" },
          });
        }
      }
    }

    // Cool-down
    steps.push({
      type: "SteadyState",
      duration: w.cooldown * 60,
      power: { value: 0.55, units: "PercentOfFTP" },
      cadence: { value: 80, units: "RPM" },
    });

    // Workout-Objekt für intervals.icu
    const workout = {
      category: "WORKOUT",
      name: session.name,
      description: w.label + (session.details ? `\n${session.details}` : ""),
      type: "Ride",
      start_date_local: session.date + "T07:00:00",
      steps,
    };

    try {
      const res = await fetch(`https://intervals.icu/api/v1/athlete/${athleteId}/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Basic " + btoa("API_KEY:" + token),
        },
        body: JSON.stringify(workout),
      });
      if (!res.ok) {
        const txt = await res.text();
        return { ok: false, msg: `intervals.icu Fehler ${res.status}: ${txt}` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, msg: e.message };
    }
  },

  /* ── Render ────────────────────────────────────────────────── */
  async render(rides) {
    const container = el("planned-container");
    if (!container) return;

    container.innerHTML = `<div class="planned-loading">🗓️ Lade Trainingsplan und Wetter-Forecast…</div>`;

    // Adjustments + Forecast parallel laden (Adjustments nur beim ersten Render)
    const [forecast] = await Promise.all([
      this._loadForecast(),
      Adjustments._data === null ? Adjustments.load() : Promise.resolve(Adjustments._data),
    ]);

    // Bereits absolvierte Daten
    const doneDates = new Set(rides.map(r => r.date));
    const today = new Date().toISOString().split("T")[0];

    // Sessions mit Adjustments anwenden
    const allSessions = Data.plannedSessions.map(s => {
      const adj = Adjustments.get(s.date);
      if (adj?.cancelled) {
        return { ...s, cancelled: true, cancelReason: adj.reason };
      }
      if (adj?.movedTo) {
        return { ...s, originalDate: s.date, date: adj.movedTo, movedReason: adj.reason };
      }
      return s;
    });

    // Sessions filtern: ausstehend = zukünftig/heute ODER verschoben (auch wenn neues Datum vergangen)
    const sessions = allSessions
      .filter(s => (s.date >= today || s.originalDate) && !doneDates.has(s.date) && !s.cancelled)
      .sort((a, b) => a.date.localeCompare(b.date));

    // Bereits absolvierte Sessions (Ride mit passendem Datum vorhanden)
    const doneSessions = allSessions
      .filter(s => doneDates.has(s.date) && !s.cancelled)
      .sort((a, b) => b.date.localeCompare(a.date));

    // Verpasst: vergangen, kein Ride, nicht ausgefallen, nicht verschoben
    const missedSessions = allSessions
      .filter(s => s.date < today && !doneDates.has(s.date) && !s.cancelled && !s.originalDate)
      .sort((a, b) => b.date.localeCompare(a.date));

    // Ausgefallene Sessions
    const cancelledSessions = allSessions
      .filter(s => s.cancelled)
      .sort((a, b) => b.date.localeCompare(a.date));

    if (!sessions.length && !doneSessions.length) {
      container.innerHTML = `<p class="planned-empty">Alle geplanten Sessions sind abgeschlossen 🎉</p>`;
      return;
    }

    // Fortschritt berechnen
    const totalSessions = Data.plannedSessions.length;
    const doneCount = doneSessions.length;
    const cancelledCount = cancelledSessions.length;
    const missedCount = missedSessions.length;
    const pct = Math.round(doneCount / totalSessions * 100);
    const currentWeek = sessions[0]?.week?.replace("P2-", "") || "W12";
    const weeksLeft = new Set(sessions.map(s => s.week)).size;

    // Hero + Fortschrittsanzeige
    let html = `
      <div class="planned-hero">
        <div class="planned-hero-text">
          <h2 class="planned-hero-title">Trainingsplan Plan 2</h2>
          <p class="planned-hero-desc">Alle geplanten Trainingseinheiten bis zum FTP-Retest in W12. Absolvierte Sessions werden automatisch erkannt sobald die Fahrt in intervals.icu erfasst ist. Intervall-Workouts können direkt auf den Wahoo ELEMNT Roam gepusht werden.</p>
        </div>
        <div class="planned-progress">
          <div class="planned-progress-stats">
            <div class="planned-progress-stat">
              <span class="planned-progress-val">${doneCount}</span>
              <span class="planned-progress-lbl">absolviert</span>
            </div>
            <div class="planned-progress-stat">
              <span class="planned-progress-val">${sessions.length}</span>
              <span class="planned-progress-lbl">ausstehend</span>
            </div>
            <div class="planned-progress-stat">
              <span class="planned-progress-val">${weeksLeft}</span>
              <span class="planned-progress-lbl">Wochen</span>
            </div>
            <div class="planned-progress-stat">
              <span class="planned-progress-val">${currentWeek}</span>
              <span class="planned-progress-lbl">aktuell</span>
            </div>
            ${cancelledCount > 0 ? `
            <div class="planned-progress-stat">
              <span class="planned-progress-val" style="color:var(--red)">${cancelledCount}</span>
              <span class="planned-progress-lbl">ausgefallen</span>
            </div>` : ""}
            ${missedCount > 0 ? `
            <div class="planned-progress-stat">
              <span class="planned-progress-val" style="color:var(--gold)">${missedCount}</span>
              <span class="planned-progress-lbl">verpasst</span>
            </div>` : ""}
          </div>
          <div class="planned-progress-bar-wrap">
            <div class="planned-progress-bar" style="width:${pct}%"></div>
          </div>
          <div class="planned-progress-pct">${pct}% abgeschlossen · ${totalSessions} Sessions gesamt</div>
        </div>
      </div>`;

    // Nach Wochen gruppieren
    const weekMap = {};
    for (const s of sessions) {
      if (!weekMap[s.week]) weekMap[s.week] = [];
      weekMap[s.week].push(s);
    }

    // Anstehende Sessions
    if (sessions.length) {
      html += `<div class="planned-section-title">📅 Ausstehend — ${sessions.length} Sessions</div>`;
      for (const [week, wSessions] of Object.entries(weekMap)) {
        const phase = wSessions[0].phase || "";
        const phaseColor = CONFIG.phaseColor(phase);
        html += `
          <div class="planned-week">
            <div class="planned-week-header">
              <span class="planned-week-badge" style="background:${phaseColor}22; color:${phaseColor}; border-color:${phaseColor}44">${week.replace("P2-", "")}</span>
              <span class="planned-week-phase">${phase}</span>
            </div>
            <div class="planned-cards">
              ${wSessions.map(s => this._renderCard(s, forecast, false)).join("")}
            </div>
          </div>`;
      }
    }

    // Erledigte Sessions — Plan 1 kompakt, Plan 2 als vollständige Vergleichskarte
    if (doneSessions.length) {
      const doneP2 = doneSessions.filter(s => s.plan === "Plan 2" || Data.rides.find(r => r.date === s.date && r.plan === "Plan 2"));
      const doneP1 = doneSessions.filter(s => !doneP2.includes(s));

      html += `<div class="planned-section-title planned-done-title">✅ Absolviert — ${doneSessions.length} Sessions</div>`;

      // Plan 2 — vollständige Vergleichskarten
      if (doneP2.length) {
        html += `<div class="planned-cards">
          ${doneP2.map(s => this._renderDoneCard(s, rides)).join("")}
        </div>`;
      }

      // Plan 1 — kompakte Liste
      if (doneP1.length) {
        html += `<div class="planned-done-list">
          ${doneP1.map(s => `
            <div class="planned-done-item planned-done-item--link" data-ride-date="${s.date}" title="Im Fahrtenbuch öffnen">
              <span class="planned-done-icon">${this._typIcon(s.typ)}</span>
              <span class="planned-done-date">${this._fmtDate(s.date)}</span>
              <span class="planned-done-name">${s.name}</span>
              <span class="planned-done-check">✓</span>
              <span class="planned-done-link-icon">↗</span>
            </div>
          `).join("")}
        </div>`;
      }
    }

    // Verpasste Sessions — vergangen ohne Ride-Match
    if (missedSessions.length) {
      html += `
        <div class="planned-section-title" style="color:var(--gold)">⚠️ Verpasst — ${missedSessions.length} Sessions ohne Fahrt</div>
        <div class="planned-done-list">
          ${missedSessions.map(s => `
            <div class="planned-done-item" style="border-left:2px solid var(--gold); opacity:0.8">
              <span class="planned-done-icon">${this._typIcon(s.typ)}</span>
              <span class="planned-done-date">${this._fmtDate(s.originalDate || s.date)}</span>
              <span class="planned-done-name">${s.name}</span>
              <span style="font-size:0.7rem;color:var(--gold);margin-left:auto">kein Ride erfasst</span>
              <button class="planned-cancel-btn" data-orig="${s.originalDate || s.date}" data-name="${s.name}" style="font-size:0.68rem;padding:2px 8px">❌ Ausgefallen</button>
              <button class="planned-move-btn" data-orig="${s.originalDate || s.date}" data-current="${s.date}" style="font-size:0.68rem;padding:2px 8px">📅 Verschieben</button>
            </div>
          `).join("")}
        </div>`;
    }
    if (cancelledSessions.length) {
      html += `
        <div class="planned-section-title planned-cancelled-title">❌ Ausgefallen — ${cancelledSessions.length} Sessions</div>
        <div class="planned-done-list">
          ${cancelledSessions.map(s => `
            <div class="planned-done-item planned-cancelled-item">
              <span class="planned-done-icon">${this._typIcon(s.typ)}</span>
              <span class="planned-done-date">${this._fmtDate(s.date)}</span>
              <span class="planned-done-name">${s.name}</span>
              ${s.cancelReason ? `<span class="planned-cancelled-reason">${s.cancelReason}</span>` : ""}
              <button class="planned-undo-btn planned-undo-cancel-btn" data-orig="${s.date}" style="margin-left:auto">↩ Wiederherstellen</button>
            </div>
          `).join("")}
        </div>`;
    }

    container.innerHTML = html;

    // Event Delegation — neu auf Container setzen (innerHTML wurde ersetzt)
    container.addEventListener("click", (e) => {
      const moveBtn   = e.target.closest(".planned-move-btn");
      const cancelBtn = e.target.closest(".planned-cancel-btn");
      const pushBtn   = e.target.closest(".planned-push-btn");
      const undoBtn   = e.target.closest(".planned-undo-btn");
      const doneItem  = e.target.closest(".planned-done-item--link");

      if (moveBtn)   Planned._handleMove(moveBtn);
      if (cancelBtn) Planned._handleCancel(cancelBtn);
      if (pushBtn)   Planned._handlePush(pushBtn);
      if (undoBtn)   Planned._handleUndo(undoBtn);
      if (doneItem && !moveBtn && !cancelBtn && !pushBtn && !undoBtn) {
        const date = doneItem.dataset.rideDate;
        if (date) Planned._openInTable(date);
      }
    });
  },

  /* ── Einzel-Karte ──────────────────────────────────────────── */
  _renderCard(s, forecast, done) {
    const col = this._typColor(s.typ);
    const icon = this._typIcon(s.typ);
    const wd = this._weekday(s.date);
    const fd = this._fmtDate(s.date);
    const fw = forecast?.[s.date];
    const hasWorkout = !!s.workout;

    // Wetter-Badge
    let weatherHtml = "";
    if (fw) {
      const hot = fw.temp > 32, cold = fw.temp < 5, windy = fw.windSpeed > 30, rainy = fw.precipProb > 50;
      const bad = (hot?1:0)+(cold?1:0)+(windy?1:0)+(rainy?1:0);
      const wcol = bad >= 2 || hot ? "var(--red)" : bad === 1 ? "var(--gold)" : "var(--green)";

      // UV-Label
      const uvLabel = fw.uvMax == null ? "" :
        fw.uvMax >= 8  ? `☀️ UV ${fw.uvMax} (sehr hoch)` :
        fw.uvMax >= 6  ? `☀️ UV ${fw.uvMax} (hoch)` :
        fw.uvMax >= 3  ? `☀️ UV ${fw.uvMax} (mittel)` :
                         `☀️ UV ${fw.uvMax} (niedrig)`;
      const uvColor = fw.uvMax >= 8 ? "var(--red)" : fw.uvMax >= 6 ? "var(--gold)" : "var(--dim)";

      // Hitzestress-Warnung
      const heatWarning = fw.tempFeel > 32
        ? `<div class="planned-weather-warn">⚠️ Hitzestress — viel trinken, Tempo anpassen</div>` : "";

      // Kältewarnung
      const coldWarning = fw.temp < 5
        ? `<div class="planned-weather-warn planned-weather-warn-cold">🥶 Kalt — Winterausrüstung empfohlen</div>` : "";

      weatherHtml = `
        <div class="planned-weather-block">
          <div class="planned-weather-row">
            <span style="color:${wcol}">${weatherIcon(fw.weatherCode)} ${fw.temp}°C <span class="planned-weather-feel">(gefühlt ${fw.tempFeel}°C)</span></span>
            <span class="planned-weather-detail">💨 ${fw.windSpeed} km/h ${windDir(fw.windDir)}</span>
          </div>
          <div class="planned-weather-row">
            <span class="planned-weather-detail">🌧 ${fw.precipProb}% Regen</span>
            ${fw.uvMax != null ? `<span class="planned-weather-detail" style="color:${uvColor}">${uvLabel}</span>` : ""}
          </div>
          ${heatWarning}
          ${coldWarning}
        </div>`;
    }

    // Workout-Details
    let workoutHtml = "";
    if (s.workout) {
      const w = s.workout;
      workoutHtml = `<div class="planned-workout-detail">
          <span class="planned-workout-label">🏋 ${w.label}</span>`;

      if (w.intervals && w.duration) {
        const totalMin = w.warmup + (w.duration * w.intervals) + (w.rest * (w.intervals - 1)) + w.cooldown;
        const pctOf = (min) => (min / totalMin * 100).toFixed(1);

        workoutHtml += `<div class="planned-timeline">`;
        workoutHtml += `<div class="ptl-seg ptl-warmup" style="width:${pctOf(w.warmup)}%" title="Warm-up ${w.warmup} min">WU</div>`;
        for (let i = 0; i < w.intervals; i++) {
          workoutHtml += `<div class="ptl-seg ptl-interval" style="width:${pctOf(w.duration)}%; background:${col}cc" title="${w.duration} min @ ${w.pct[0]}–${w.pct[1]}% FTP">${w.duration}'</div>`;
          if (i < w.intervals - 1) {
            workoutHtml += `<div class="ptl-seg ptl-rest" style="width:${pctOf(w.rest)}%" title="Pause ${w.rest} min">${w.rest}'</div>`;
          }
        }
        workoutHtml += `<div class="ptl-seg ptl-cooldown" style="width:${pctOf(w.cooldown)}%" title="Cool-down ${w.cooldown} min">CD</div>`;
        workoutHtml += `</div>`;
        workoutHtml += `<div class="planned-timeline-legend">
          <span class="ptl-summary">${w.warmup} min Warm-up → ${w.intervals}× ${w.duration} min @ ${w.pct[0]}–${w.pct[1]}% (Pause: ${w.rest} min) → ${w.cooldown} min Cool-down · <strong>${totalMin} min gesamt</strong></span>
        </div>`;
      }

      workoutHtml += `${w.watts ? `<div class="planned-workout-watts">${w.watts[0]}–${w.watts[1]}W · Ziel: ${Math.round((w.watts[0]+w.watts[1])/2)}W</div>` : ""}
        </div>`;
    } else if (s.details) {
      const isZ2 = s.typ === "Z2 Lang" || s.typ === "Z2 Dauer";
      const isRecovery = s.typ === "Z1 Recovery";

      if (isZ2 && s.km) {
        // Z2 — HF-Zielzone + Distanz + Kalorienabschätzung
        const hrMin = 123, hrMax = 152, hrAbsMin = 0, hrAbsMax = 201;
        const barW = 100;
        const z2Start = ((hrMin - hrAbsMin) / (hrAbsMax - hrAbsMin) * barW).toFixed(1);
        const z2Width = ((hrMax - hrMin) / (hrAbsMax - hrAbsMin) * barW).toFixed(1);

        // Distanzbereich aus Plan
        const kmMin = s.typ === "Z2 Lang" ? Math.round(s.km * 0.85) : Math.round(s.km * 0.9);
        const kmMax = Math.round(s.km * 1.15);
        const kmPct = (s.km / kmMax * 100).toFixed(0);

        // Kalorienabschätzung: Z2 ~600 kcal/h, Recovery ~400 kcal/h
        const durationH = s.km / 22; // ~22 km/h Z2 Durchschnitt
        const kcal = Math.round(durationH * 600 / 50) * 50; // auf 50 runden

        workoutHtml = `
          <div class="planned-z2-block">
            <div class="planned-z2-row">
              <span class="planned-z2-label">❤️ Ziel-HF</span>
              <span class="planned-z2-pill" style="color:#4a7fa8; background:#4a7fa822; border-color:#4a7fa855">Z2 Aerobic · 123–152 bpm</span>
            </div>
            <div class="planned-z2-row">
              <span class="planned-z2-label">📍 Distanz</span>
              <span class="planned-z2-pill" style="color:#6b9fa8; background:#6b9fa822; border-color:#6b9fa855">${kmMin}–${kmMax} km</span>
            </div>
            <div class="planned-z2-row">
              <span class="planned-z2-label">🔥 ~Kalorien</span>
              <span class="planned-z2-pill" style="color:#c9a84c; background:#c9a84c22; border-color:#c9a84c55">ca. ${kcal} kcal · ${Math.round(durationH * 10) / 10}h</span>
            </div>
            <div class="planned-z2-note">${s.details}</div>
          </div>`;

      } else if (isRecovery) {
        // Recovery — letzter HRV + RHF Wert + Erholungskontext
        const wellness = Data.wellness || [];
        const lastW = wellness.length > 0
          ? [...wellness].sort((a, b) => b.dateISO.localeCompare(a.dateISO))[0]
          : null;

        const hrvHtml = lastW?.hrv
          ? `<div class="planned-rec-row"><span class="planned-rec-label">💜 HRV</span><span class="planned-rec-val">${lastW.hrv} ms</span><span class="planned-rec-date">(${lastW.dateShort})</span></div>`
          : `<div class="planned-rec-row"><span class="planned-rec-label">💜 HRV</span><span class="planned-rec-na">– nicht erfasst</span></div>`;

        const rfHtml = lastW?.restingHR
          ? `<div class="planned-rec-row"><span class="planned-rec-label">❤️ Ruhepuls</span><span class="planned-rec-val">${lastW.restingHR} bpm</span><span class="planned-rec-date">(${lastW.dateShort})</span></div>`
          : `<div class="planned-rec-row"><span class="planned-rec-label">❤️ Ruhepuls</span><span class="planned-rec-na">– nicht erfasst</span></div>`;

        // Nächste Belastungseinheit finden
        const today = new Date().toISOString().split("T")[0];
        const nextLoad = Data.plannedSessions
          .filter(ps => ps.date > s.date && ps.workout)
          .sort((a, b) => a.date.localeCompare(b.date))[0];
        const daysToLoad = nextLoad
          ? Math.ceil((new Date(nextLoad.date) - new Date(s.date)) / 86400000)
          : null;

        workoutHtml = `
          <div class="planned-rec-block">
            <div class="planned-rec-title">📊 Aktuelle Erholungswerte</div>
            ${hrvHtml}
            ${rfHtml}
            ${nextLoad ? `
              <div class="planned-rec-next">
                ⚡ Nächste Belastung in ${daysToLoad} Tag${daysToLoad !== 1 ? "en" : ""}: ${nextLoad.name}
              </div>` : ""}
            <div class="planned-rec-note">${s.details}</div>
          </div>`;

      } else {
        workoutHtml = `<div class="planned-details">${s.details}</div>`;
      }
    }

    // Tage bis zur Session
    const daysUntil = Math.ceil((new Date(s.date) - new Date()) / 86400000);
    const daysLabel = daysUntil === 0 ? "Heute!" : daysUntil === 1 ? "Morgen" : `in ${daysUntil} Tagen`;

    return `
      <div class="planned-card" style="border-left-color:${col}">
        <div class="planned-card-header">
          <div class="planned-card-title">
            <span class="planned-card-icon">${icon}</span>
            <span class="planned-card-name">${s.name}</span>
          </div>
          <div class="planned-card-meta">
            <span class="planned-card-date">${wd} ${fd}</span>
            <span class="planned-card-days" style="color:${daysUntil <= 2 ? "var(--accent)" : "var(--dim)"}">${daysLabel}</span>
            ${s.km ? `<span class="planned-card-km">${s.workout ? "~" + s.km + " km Ausfahrt" : "~" + s.km + " km"}</span>` : ""}
          </div>
        </div>
        ${s.originalDate ? `
          <div class="planned-moved-badge">
            📅 Verschoben von ${this._fmtDate(s.originalDate)}
            ${s.movedReason ? `· ${s.movedReason}` : ""}
            <button class="planned-undo-btn" data-orig="${s.originalDate}">↩ Rückgängig</button>
          </div>` : ""}
        ${weatherHtml}
        ${workoutHtml}
        <div class="planned-card-actions">
          ${hasWorkout ? `<button class="planned-push-btn" data-date="${s.originalDate || s.date}" data-name="${s.name}">📤 Auf Wahoo pushen</button>` : ""}
          <button class="planned-move-btn" data-orig="${s.originalDate || s.date}" data-current="${s.date}">📅 Verschieben</button>
          <button class="planned-cancel-btn" data-orig="${s.originalDate || s.date}" data-name="${s.name}">❌ Ausgefallen</button>
          <span class="planned-push-status" id="push-status-${s.originalDate || s.date}"></span>
        </div>
      </div>`;
  },

  /* ── Abgeschlossene Plan-2-Karte mit Geplant vs. Tatsächlich ── */
  _renderDoneCard(s, rides) {
    const col = this._typColor(s.typ);
    const icon = this._typIcon(s.typ);
    const wd = this._weekday(s.date);
    const fd = this._fmtDate(s.date);
    const isZ2 = s.typ === "Z2 Lang" || s.typ === "Z2 Dauer";
    const isInterval = !!s.workout;
    const isGroup = s.typ === "Gruppenfahrt";

    // Tatsächliche Fahrt aus rides
    const ride = rides.find(r => r.date === s.date && r.plan === "Plan 2");

    // Vergleichszeilen bauen
    let compareHtml = "";
    if (ride) {
      const rows = [];

      // Distanz
      if (ride.km) {
        const planned = s.km || null;
        const diff = planned ? Math.round((ride.km - planned) * 10) / 10 : null;
        const col2 = !planned ? "var(--text)"
          : Math.abs(diff) <= planned * 0.15 ? "var(--green)"
          : diff > 0 ? "var(--green)" : "var(--gold)";
        rows.push(`
          <div class="done-compare-row">
            <span class="done-compare-label">📍 Distanz</span>
            <span class="done-compare-plan">${planned ? planned + " km" : "–"}</span>
            <span class="done-compare-arrow">→</span>
            <span class="done-compare-actual" style="color:${col2}">${fmt(ride.km)} km</span>
            ${diff != null ? `<span class="done-compare-diff" style="color:${col2}">${diff > 0 ? "+" : ""}${diff} km</span>` : ""}
          </div>`);
      }

      // Herzfrequenz — mit echtem Zielbereich je Typ
      if (ride.hf) {
        let hfPlan = "–", hfCol = "var(--text)";
        if (isZ2) {
          hfPlan = "123–152 bpm";
          hfCol = (ride.hf >= 123 && ride.hf <= 152) ? "var(--green)" : "var(--gold)";
        } else if (isInterval) {
          hfPlan = "167–181 bpm";
          hfCol = (ride.hf >= 160) ? "var(--green)" : "var(--gold)";
        } else if (isGroup) {
          hfPlan = "Gruppenfahrt";
        }
        rows.push(`
          <div class="done-compare-row">
            <span class="done-compare-label">❤️ Ø HF</span>
            <span class="done-compare-plan">${hfPlan}</span>
            <span class="done-compare-arrow">→</span>
            <span class="done-compare-actual" style="color:${hfCol}">${ride.hf} bpm</span>
            ${ride.hfMax ? `<span class="done-compare-diff" style="color:var(--dim)">max ${ride.hfMax}</span>` : ""}
          </div>`);
      }

      // Watt
      if (ride.watt) {
        let wPlan = "–", wCol = "var(--text)";
        if (s.workout?.watts) {
          const [wLow, wHigh] = s.workout.watts;
          wPlan = `${wLow}–${wHigh} W`;
          wCol = (ride.watt >= wLow && ride.watt <= wHigh) ? "var(--green)"
               : ride.watt > wHigh ? "var(--gold)" : "var(--red)";
        }
        rows.push(`
          <div class="done-compare-row">
            <span class="done-compare-label">⚡ Ø Watt</span>
            <span class="done-compare-plan">${wPlan}</span>
            <span class="done-compare-arrow">→</span>
            <span class="done-compare-actual" style="color:${wCol}">${ride.watt} W</span>
            ${ride.np ? `<span class="done-compare-diff" style="color:var(--dim)">NP ${ride.np} W</span>` : ""}
          </div>`);
      }

      // Kadenz — für alle Typen
      if (ride.kad) {
        const kadTarget = isZ2 ? 80 : 85;
        const kadOk = ride.kad >= kadTarget;
        const kadCol = kadOk ? "var(--green)" : "var(--gold)";
        rows.push(`
          <div class="done-compare-row">
            <span class="done-compare-label">🔄 Kadenz</span>
            <span class="done-compare-plan">≥${kadTarget} RPM</span>
            <span class="done-compare-arrow">→</span>
            <span class="done-compare-actual" style="color:${kadCol}">${ride.kad} RPM</span>
          </div>`);
      }

      // Dauer — Schätzung aus km/Tempo für Z2
      if (ride.min) {
        let durPlan = "–";
        if (isInterval && s.workout) {
          const w = s.workout;
          const total = w.warmup + (w.duration * w.intervals) + (w.rest * (w.intervals - 1)) + w.cooldown;
          durPlan = `${total} min`;
        } else if (s.km) {
          const avgKmh = isZ2 ? 22 : isGroup ? 26 : 23;
          durPlan = `~${Math.round(s.km / avgKmh * 60)} min`;
        }
        rows.push(`
          <div class="done-compare-row">
            <span class="done-compare-label">⏱ Dauer</span>
            <span class="done-compare-plan">${durPlan}</span>
            <span class="done-compare-arrow">→</span>
            <span class="done-compare-actual">${ride.min} min</span>
          </div>`);
      }

      // TRIMP/TSS
      if (ride.trimp) {
        rows.push(`
          <div class="done-compare-row">
            <span class="done-compare-label">📊 TRIMP</span>
            <span class="done-compare-plan">–</span>
            <span class="done-compare-arrow">→</span>
            <span class="done-compare-actual">${ride.trimp}</span>
            ${ride.ctl != null ? `<span class="done-compare-diff" style="color:var(--dim)">CTL ${fmt(ride.ctl)}</span>` : ""}
          </div>`);
      }

      // Wetter
      if (ride.weather) {
        const w = ride.weather;
        const hot = w.temp > 32, windy = (w.windSpeed || 0) > 30, rainy = (w.precip || 0) > 0.5;
        const bad = (hot?1:0)+(windy?1:0)+(rainy?1:0);
        const wCol = bad >= 2 || hot ? "var(--red)" : bad === 1 ? "var(--gold)" : "var(--green)";
        rows.push(`
          <div class="done-compare-row">
            <span class="done-compare-label">🌤️ Wetter</span>
            <span class="done-compare-plan">–</span>
            <span class="done-compare-arrow">→</span>
            <span class="done-compare-actual" style="color:${wCol}">${weatherIcon(w.weatherCode)} ${w.temp}°C · ${Math.round(w.windSpeed||0)} km/h</span>
          </div>`);
      }

      // Befinden
      const subj = Subjective ? Subjective.get(s.date) : null;
      const feelVal = subj?.feel || ride.feel || "";
      if (feelVal) {
        const feel = normalizeFeel(feelVal);
        rows.push(`
          <div class="done-compare-row">
            <span class="done-compare-label">😌 Befinden</span>
            <span class="done-compare-plan">–</span>
            <span class="done-compare-arrow">→</span>
            <span class="done-compare-actual"><span class="feel feel-${feel.cls}">${feel.label}</span></span>
          </div>`);
      }

      compareHtml = rows.length ? `
        <div class="done-compare-block">
          <div class="done-compare-title">Geplant → Tatsächlich</div>
          ${rows.join("")}
        </div>` : "";
    }

    return `
      <div class="planned-card planned-card--done" style="border-left-color:${col}">
        <div class="planned-card-header done-card-header">
          <div class="planned-card-title">
            <span class="planned-card-icon">${icon}</span>
            <span class="planned-card-name">${s.name}</span>
            <span class="done-badge">✓</span>
          </div>
          <div class="done-card-header-right">
            <span class="planned-card-date">${wd} ${fd}</span>
            ${s.originalDate ? `<span class="done-moved-label">↪ ${this._fmtDate(s.originalDate)}</span>` : ""}
            <button class="planned-done-item--link done-card-link" data-ride-date="${s.date}" title="Im Fahrtenbuch öffnen">↗ Fahrtenbuch</button>
          </div>
        </div>
        ${compareHtml}
      </div>`;
  },

  /* ── Ausgefallen-Handler ───────────────────────────────────── */
  async _handleCancel(btn) {
    const origDate = btn.dataset.orig;

    const existing = document.querySelector(".planned-cancel-form");
    if (existing) { existing.remove(); return; }

    const form = document.createElement("div");
    form.className = "planned-move-form planned-cancel-form";
    form.innerHTML = `
      <div class="planned-move-form-inner">
        <label class="planned-move-label">❌ Session als ausgefallen markieren</label>
        <input type="text" class="planned-move-reason" placeholder="Grund (z.B. Krank, Erschöpfung, Regen…)" maxlength="60">
        <div class="planned-move-actions">
          <button class="planned-cancel-confirm" style="border-color:var(--red); color:var(--red)">❌ Als ausgefallen markieren</button>
          <button class="planned-move-cancel">✕ Abbrechen</button>
        </div>
        <div class="planned-move-status"></div>
      </div>`;

    btn.insertAdjacentElement("afterend", form);
    form.querySelector(".planned-move-reason").focus();

    form.querySelector(".planned-move-cancel").addEventListener("click", () => form.remove());

    form.querySelector(".planned-cancel-confirm").addEventListener("click", async () => {
      const reason = form.querySelector(".planned-move-reason").value.trim();
      const statusEl = form.querySelector(".planned-move-status");

      statusEl.textContent = "⏳ Speichern…";
      const result = await Adjustments.cancel(origDate, reason);
      if (result.ok) {
        statusEl.textContent = "✅ Gespeichert";
        Planned.render(Data.byDate());
      } else {
        statusEl.textContent = `❌ ${result.msg || "Fehler — Token korrekt?"}`;
      }
    });
  },

  /* ── Verschieben-Handler ───────────────────────────────────── */
  async _handleMove(btn) {
    const origDate = btn.dataset.orig;
    const currentDate = btn.dataset.current;

    // Existierendes Formular schließen wenn offen
    const existing = document.querySelector(".planned-move-form");
    if (existing) { existing.remove(); return; }

    const form = document.createElement("div");
    form.className = "planned-move-form";
    form.innerHTML = `
      <div class="planned-move-form-inner">
        <label class="planned-move-label">Neues Datum (auch vergangene Daten möglich)</label>
        <input type="date" class="planned-move-date" value="${currentDate}">
        <label class="planned-move-label">Grund (optional)</label>
        <input type="text" class="planned-move-reason" placeholder="z.B. Hitze, Regen, Erschöpfung…" maxlength="60">
        <div class="planned-move-actions">
          <button class="planned-move-confirm">✓ Speichern</button>
          <button class="planned-move-cancel">✕ Abbrechen</button>
        </div>
        <div class="planned-move-status"></div>
      </div>`;

    // Formular nach dem Button einfügen — egal in welchem Container
    btn.insertAdjacentElement("afterend", form);

    form.querySelector(".planned-move-cancel").addEventListener("click", () => form.remove());

    form.querySelector(".planned-move-confirm").addEventListener("click", async () => {
      const newDate = form.querySelector(".planned-move-date").value;
      const reason = form.querySelector(".planned-move-reason").value.trim();
      const statusEl = form.querySelector(".planned-move-status");

      if (!newDate) { form.remove(); return; }

      statusEl.textContent = "⏳ Speichern…";
      const result = await Adjustments.save(origDate, newDate, reason);
      if (result.ok) {
        statusEl.textContent = "✅ Gespeichert";
        // Nicht neu laden — _data ist bereits aktuell im Speicher
        Planned.render(Data.byDate());
      } else {
        statusEl.textContent = `❌ ${result.msg || "Fehler beim Speichern"}`;
      }
    });
  },

  /* ── Rückgängig-Handler ────────────────────────────────────── */
  async _handleUndo(btn) {
    const origDate = btn.dataset.orig;
    btn.textContent = "⏳…";
    btn.disabled = true;
    const result = await Adjustments.remove(origDate);
    if (result.ok) {
      Planned.render(Data.byDate());
    } else {
      btn.textContent = `❌ ${result.msg || "Fehler"}`;
      btn.disabled = false;
    }
  },

  /* ── Push-Handler ──────────────────────────────────────────── */
  async _handlePush(btn) {
    const date = btn.dataset.date;
    const statusEl = document.getElementById(`push-status-${date}`);
    const session = Data.plannedSessions.find(s => s.date === date);
    if (!session?.workout) return;

    // Token aus localStorage (gleicher Mechanismus wie Befinden)
    let token = localStorage.getItem("intervals_api_key");
    let athleteId = localStorage.getItem("intervals_athlete_id");

    if (!token) {
      token = prompt("intervals.icu API Key eingeben:");
      if (!token) return;
      localStorage.setItem("intervals_api_key", token);
    }
    if (!athleteId) {
      athleteId = prompt("intervals.icu Athlete ID eingeben (z.B. i12345):");
      if (!athleteId) return;
      localStorage.setItem("intervals_athlete_id", athleteId);
    }

    btn.disabled = true;
    btn.textContent = "⏳ Wird gepusht…";
    if (statusEl) statusEl.textContent = "";

    const result = await this._pushWorkout(session, token, athleteId);

    btn.disabled = false;
    btn.textContent = "📤 Auf Wahoo pushen";

    if (result.ok) {
      if (statusEl) {
        statusEl.textContent = "✅ Gepusht!";
        statusEl.style.color = "var(--green)";
      }
      btn.style.outline = "1px solid var(--green)";
      setTimeout(() => { btn.style.outline = ""; }, 2000);
    } else {
      if (statusEl) {
        statusEl.textContent = "❌ " + result.msg;
        statusEl.style.color = "var(--red)";
      }
    }
  },
};

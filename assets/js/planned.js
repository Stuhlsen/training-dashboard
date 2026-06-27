/* ============================================================
   PLANNED.JS — Geplante Fahrten Tab
   - Zeigt alle geplanten Sessions aus PLANNED_SESSIONS
   - Abgleich mit tatsächlichen Fahrten (erledigt/ausstehend)
   - Wetter-Forecast via Open-Meteo (bis 16 Tage voraus)
   - Push strukturierter Workouts zu intervals.icu
   ============================================================ */

const Planned = {

  /* ── Wetter-Forecast Cache ─────────────────────────────────── */
  _forecastCache: null,

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

  /* ── Wetter-Forecast laden (Open-Meteo, bis 16 Tage) ───────── */
  async _loadForecast() {
    if (this._forecastCache) return this._forecastCache;
    try {
      const params = [
        "latitude=51.5253", "longitude=14.0016",
        "hourly=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation_probability,weather_code,uv_index",
        "forecast_days=16",
        "timezone=Europe/Berlin",
      ].join("&");
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
      if (!res.ok) return null;
      const data = await res.json();
      // Map aufbauen: "YYYY-MM-DD" → gemittelte Tageswerte (08–18 Uhr)
      const map = {};
      const h = data.hourly;
      for (let i = 0; i < h.time.length; i++) {
        const [date, time] = h.time[i].split("T");
        const hour = parseInt(time);
        if (hour < 8 || hour > 18) continue;
        if (!map[date]) map[date] = { temp: [], feel: [], humidity: [], wind: [], windDir: [], precipProb: [], code: [], uv: [] };
        if (h.temperature_2m[i]            != null) map[date].temp.push(h.temperature_2m[i]);
        if (h.apparent_temperature[i]      != null) map[date].feel.push(h.apparent_temperature[i]);
        if (h.relative_humidity_2m[i]      != null) map[date].humidity.push(h.relative_humidity_2m[i]);
        if (h.wind_speed_10m[i]            != null) map[date].wind.push(h.wind_speed_10m[i]);
        if (h.wind_direction_10m[i]        != null) map[date].windDir.push(h.wind_direction_10m[i]);
        if (h.precipitation_probability[i] != null) map[date].precipProb.push(h.precipitation_probability[i]);
        if (h.weather_code[i]              != null) map[date].code.push(h.weather_code[i]);
        if (h.uv_index[i]                  != null) map[date].uv.push(h.uv_index[i]);
      }
      const mean = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
      const result = {};
      for (const [date, v] of Object.entries(map)) {
        result[date] = {
          temp:        Math.round(mean(v.temp) * 10) / 10,
          tempFeel:    Math.round(mean(v.feel) * 10) / 10,
          humidity:    Math.round(mean(v.humidity)),
          windSpeed:   Math.round(mean(v.wind) * 10) / 10,
          windDir:     Math.round(mean(v.windDir)),
          precipProb:  Math.round(mean(v.precipProb)),
          weatherCode: Math.max(...v.code),
          uvMax:       v.uv.length ? Math.round(Math.max(...v.uv) * 10) / 10 : null,
        };
      }
      this._forecastCache = result;
      return result;
    } catch (e) {
      console.warn("Open-Meteo Forecast Fehler:", e.message);
      return null;
    }
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

    // Bereits absolvierte Daten: Set aus tatsächlichen Datumswerten
    const doneDates = new Set(rides.map(r => r.date));
    const today = new Date().toISOString().split("T")[0];

    // Forecast laden
    const forecast = await this._loadForecast();

    // Sessions filtern: nur zukünftige oder heutige, nicht absolvierte
    const sessions = Data.plannedSessions
      .filter(s => s.date >= today && !doneDates.has(s.date))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Bereits absolvierte Sessions (für "Erledigt"-Anzeige)
    const doneSessions = Data.plannedSessions
      .filter(s => doneDates.has(s.date))
      .sort((a, b) => b.date.localeCompare(a.date));

    if (!sessions.length && !doneSessions.length) {
      container.innerHTML = `<p class="planned-empty">Alle geplanten Sessions sind abgeschlossen 🎉</p>`;
      return;
    }

    // Fortschritt berechnen
    const totalSessions = Data.plannedSessions.length;
    const doneCount = doneSessions.length;
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

    // Erledigte Sessions (kompakt)
    if (doneSessions.length) {
      html += `
        <div class="planned-section-title planned-done-title">✅ Absolviert — ${doneSessions.length} Sessions</div>
        <div class="planned-done-list">
          ${doneSessions.slice(0, 10).map(s => `
            <div class="planned-done-item">
              <span class="planned-done-icon">${this._typIcon(s.typ)}</span>
              <span class="planned-done-date">${this._fmtDate(s.date)}</span>
              <span class="planned-done-name">${s.name}</span>
              <span class="planned-done-check">✓</span>
            </div>
          `).join("")}
          ${doneSessions.length > 10 ? `<div class="planned-done-more">+ ${doneSessions.length - 10} weitere im Fahrtenbuch</div>` : ""}
        </div>`;
    }

    container.innerHTML = html;

    // Push-Buttons verdrahten
    container.querySelectorAll(".planned-push-btn").forEach(btn => {
      btn.addEventListener("click", () => this._handlePush(btn));
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
          <div class="ptl-grid">
            <span class="ptl-g-label">⬆ Warm-up</span>
            <span class="ptl-g-val">${w.warmup} min</span>
            <span class="ptl-g-label" style="color:${col}">● Intervall</span>
            <span class="ptl-g-val" style="color:${col}">${w.duration} min × ${w.intervals}</span>
            <span class="ptl-g-label">○ Pause</span>
            <span class="ptl-g-val">${w.rest} min</span>
            <span class="ptl-g-label">⬇ Cool-down</span>
            <span class="ptl-g-val">${w.cooldown} min</span>
          </div>
          <div class="ptl-total">Gesamt: <strong>${totalMin} min</strong></div>
        </div>`;
      }

      workoutHtml += `${w.watts ? `<div class="planned-workout-watts">${w.watts[0]}–${w.watts[1]}W · Ziel: ${Math.round((w.watts[0]+w.watts[1])/2)}W</div>` : ""}
        </div>`;
    } else if (s.details) {
      workoutHtml = `<div class="planned-details">${s.details}</div>`;
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
        ${weatherHtml}
        ${workoutHtml}
        ${hasWorkout ? `
          <div class="planned-card-actions">
            <button class="planned-push-btn" data-date="${s.date}" data-name="${s.name}">
              📤 Workout zu intervals.icu pushen
            </button>
            <span class="planned-push-status" id="push-status-${s.date}"></span>
          </div>` : ""}
      </div>`;
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
    btn.textContent = "📤 Workout zu intervals.icu pushen";

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

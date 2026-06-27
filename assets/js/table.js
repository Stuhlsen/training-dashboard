/* ============================================================
   TABLE.JS — Fahrtenbuch: Filter, Suche, Sort, Render
   ============================================================ */

// === Befinden GitHub-Sync ===
const Subjective = {
  FEEL_OPTIONS: ["Sehr leicht", "Leicht", "Irgendwie einfach", "Moderat", "Irgendwie schwer", "Schwer", "Hart"],

  _data: null,
  _token: null,
  _sha: null,

  async load() {
    try {
      const res = await fetch("data/subjective.json?_=" + Date.now());
      if (!res.ok) { this._data = {}; return this._data; }
      this._data = await res.json();
    } catch { this._data = {}; }
    return this._data;
  },

  get(date) { return this._data?.[date] || {}; },

  getToken() {
    if (!this._token) this._token = localStorage.getItem("gh_token");
    return this._token;
  },

  promptToken() {
    const t = prompt("GitHub Personal Access Token eingeben (wird nur lokal gespeichert):");
    if (t) { this._token = t; localStorage.setItem("gh_token", t); }
    return t;
  },

  async save(date, feel, notizen) {
    if (!this._data) this._data = {};
    this._data[date] = { ...this._data[date], feel, notizen };

    let token = this.getToken();
    if (!token) token = this.promptToken();
    if (!token) return false;

    try {
      // Aktuellen SHA holen
      const infoRes = await fetch(
        "https://api.github.com/repos/Stuhlsen/training-dashboard/contents/data/subjective.json",
        { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } }
      );
      const info = await infoRes.json();
      const sha = info.sha;

      const content = btoa(unescape(encodeURIComponent(JSON.stringify(this._data, null, 2))));
      const putRes = await fetch(
        "https://api.github.com/repos/Stuhlsen/training-dashboard/contents/data/subjective.json",
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
          body: JSON.stringify({ message: `subjective: Befinden ${date} → ${feel}`, content, sha }),
        }
      );
      if (!putRes.ok) {
        const err = await putRes.json();
        if (err.message?.includes("Bad credentials")) {
          localStorage.removeItem("gh_token");
          this._token = null;
          alert("Token ungültig. Bitte neu eingeben.");
        }
        return false;
      }
      return true;
    } catch (e) {
      console.error("GitHub Write Fehler:", e);
      return false;
    }
  },
};

const Table = {

  state: {
    phase:   "Alle",
    weekF:   null,
    sortCol: "dateISO",
    sortDir: "desc",
    search:  "",
  },

  COLS: [
    { k: "dateShort", l: "Datum",    sk: "dateISO" },
    { k: "week",      l: "Woche"                   },
    { k: "name",      l: "Einheit",  wide: true     },
    { k: "typ",       l: "Typ"                      },
    { k: "km",        l: "km"                       },
    { k: "min",       l: "min"                      },
    { k: "kmh",       l: "km/h"                     },
    { k: "hf",        l: "Ø HF"                     },
    { k: "hfMax",     l: "HF-Max"                   },
    { k: "kad",       l: "Kadenz"                   },
    { k: "watt",      l: "Ø W"                      },
    { k: "np",        l: "NP"                       },
    { k: "trimp",     l: "TRIMP"                    },
    { k: "ctl",       l: "CTL"                      },
    { k: "feel",      l: "Befinden"                 },
    { k: "weather",   l: "Wetter",   noSort: true   },
  ],

  /* ── Öffentliche API ─────────────────────────────────────────── */
  async init() {
    await Subjective.load();
    this.render();
  },

  render() {
    this._renderFilters();
    this._renderWeekTag();
    this._renderTable();
  },

  /** Von außen aufrufbar um Wochen-Filter zu setzen */
  filterByWeek(week) {
    this.state.weekF = this.state.weekF === week ? null : week;
    this.render();
  },

  /* ── Filter Bar ─────────────────────────────────────────────── */
  _renderFilters() {
    const phases = ["Alle", ...new Set(Data.rides.map(r => r.phase).filter(Boolean))];
    const bar = el("filter-bar");

    bar.innerHTML = phases.map(p => `
      <button class="filter-btn${this.state.phase === p ? " active" : ""}" data-phase="${p}">${p}</button>
    `).join("") + `
      <input class="search-input" placeholder="Einheit oder Typ suchen…" value="${this.state.search}">
    `;

    bar.querySelectorAll(".filter-btn").forEach(b =>
      b.addEventListener("click", () => {
        this.state.phase = b.dataset.phase;
        this.state.weekF = null;
        this.render();
      })
    );

    bar.querySelector(".search-input").addEventListener("input", e => {
      this.state.search = e.target.value;
      this._renderWeekTag();
      this._renderTable();
    });
  },

  /* ── Week Filter Tag ────────────────────────────────────────── */
  _renderWeekTag() {
    const tag = el("week-filter-tag");
    if (this.state.weekF) {
      tag.innerHTML = `
        <div class="week-filter-tag">
          Woche: ${this.state.weekF}
          <button id="clear-week-filter">✕</button>
        </div>`;
      el("clear-week-filter").addEventListener("click", () => {
        this.state.weekF = null;
        this.render();
      });
    } else {
      tag.innerHTML = "";
    }
  },

  /* ── Tabelle ────────────────────────────────────────────────── */
  _renderTable() {
    const filtered = this._getFiltered();
    const totalKm  = Math.round(sum(filtered, "km"));

    el("table-meta").textContent =
      `${filtered.length} Fahrten · ${totalKm.toLocaleString("de")} km`;

    // Header
    const thead = el("table-head");
    thead.innerHTML = this.COLS.map(c => {
      if (c.noSort) return `<th class="col-nosort">${c.l}</th>`;
      const sortKey = c.sk || c.k;
      const sorted  = this.state.sortCol === sortKey;
      const icon    = sorted ? (this.state.sortDir === "asc" ? "↑" : "↓") : "↕";
      return `
        <th class="${sorted ? "sorted" : ""}" data-sort="${sortKey}">
          ${c.l}<span class="sort-icon">${icon}</span>
        </th>`;
    }).join("");

    thead.querySelectorAll("th[data-sort]").forEach(th =>
      th.addEventListener("click", () => {
        const col = th.dataset.sort;
        if (this.state.sortCol === col) {
          this.state.sortDir = this.state.sortDir === "asc" ? "desc" : "asc";
        } else {
          this.state.sortCol = col;
          this.state.sortDir = col === "dateISO" ? "desc" : "asc";
        }
        this._renderTable();
      })
    );

    // Body
    const tbody = el("table-body");
    tbody.innerHTML = filtered.map(r => {
      const isP2 = r.plan === "Plan 2";
      const subj = isP2 ? Subjective.get(r.dateISO) : null;
      const feelVal = subj?.feel || r.feel || "";
      const feel = normalizeFeel(feelVal);

      const feelCell = isP2
        ? `<td>
            <select class="feel-select feel-${feel.cls}" data-date="${r.dateISO}">
              <option value="">– wählen –</option>
              ${Subjective.FEEL_OPTIONS.map(f =>
                `<option value="${f}"${feelVal === f ? " selected" : ""}>${f}</option>`
              ).join("")}
            </select>
           </td>`
        : `<td><span class="feel feel-${feel.cls}">${feel.label || "–"}</span></td>`;

      return `
        <tr>
          <td>${r.dateShort}</td>
          <td><span class="tag ${phaseTagClass(r.phase)}">${r.week || "–"}</span></td>
          <td class="col-name" title="${r.name || ""}">${r.name || "–"}</td>
          <td class="col-typ">${r.typ || "–"}</td>
          <td class="col-bold">${fmt(r.km)}</td>
          <td>${fmtInt(r.min)}</td>
          <td>${r.kmh ? fmt(r.kmh) : "–"}</td>
          <td>${fmtInt(r.hf)}</td>
          <td>${fmtInt(r.hfMax)}</td>
          <td>${fmtInt(r.kad)}</td>
          <td>${fmtInt(r.watt)}</td>
          <td>${fmtInt(r.np)}</td>
          <td>${fmtInt(r.trimp)}</td>
          <td>${r.ctl != null ? fmt(r.ctl) : "–"}</td>
          ${feelCell}
          <td class="col-weather">${r.weather ? (() => {
            const w = r.weather;
            const hot   = w.temp > 28;
            const cold  = w.temp < 5;
            const windy = w.wind > 30 || w.windSpeed > 30;
            const rainy = (w.precip || 0) > 0.5;
            const bad = (hot?1:0)+(cold?1:0)+((w.windSpeed||w.wind||0)>30?1:0)+(rainy?1:0);
            const col = (bad >= 2 || hot || (windy && rainy)) ? "var(--red)"
                      : bad === 1 ? "var(--gold)"
                      : "var(--green)";
            const wind = Math.round(w.windSpeed || 0);
            return `<span class="weather-cell" style="color:${col}" title="${w.temp}°C (gefühlt ${w.tempFeel}°C) · ${wind} km/h ${windDir(w.windDir)} · ${w.humidity}% Luftfeuchtigkeit${(w.precip||0) > 0 ? " · " + w.precip + "mm Regen" : ""}">${weatherIcon(w.weatherCode)} ${w.temp}°C · ${wind} km/h</span>`;
          })() : (r.wetter || "–")}</td>
        </tr>`;
    }).join("");

    // Dropdown Event Listeners
    tbody.querySelectorAll(".feel-select").forEach(sel => {
      sel.addEventListener("change", async (e) => {
        const date = e.target.dataset.date;
        const feel = e.target.value;
        const opt = e.target;
        opt.disabled = true;

        const ok = await Subjective.save(date, feel, Subjective.get(date).notizen || "");

        opt.disabled = false;
        const normalized = normalizeFeel(feel);
        opt.className = `feel-select feel-${normalized.cls}`;

        if (ok) {
          // Visuelles Feedback
          opt.style.outline = "1px solid var(--green)";
          setTimeout(() => { opt.style.outline = ""; }, 1500);
        } else {
          alert("Speichern fehlgeschlagen. Ist der GitHub Token korrekt?");
        }
      });
    });
  },

  /* ── Gefilterte + sortierte Daten ───────────────────────────── */
  _getFiltered() {
    let r = [...Data.rides];

    if (this.state.phase !== "Alle")
      r = r.filter(x => x.phase === this.state.phase);

    if (this.state.weekF)
      r = r.filter(x => x.week === this.state.weekF);

    if (this.state.search) {
      const s = this.state.search.toLowerCase();
      r = r.filter(x =>
        (x.name || "").toLowerCase().includes(s) ||
        (x.typ  || "").toLowerCase().includes(s)
      );
    }

    const col = this.state.sortCol;
    r.sort((a, b) => {
      let va, vb;
      if (col === "week") {
        va = CONFIG.weekIndex(a.week);
        vb = CONFIG.weekIndex(b.week);
      } else {
        va = a[col]; vb = b[col];
      }
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "string")
        return this.state.sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      return this.state.sortDir === "asc" ? va - vb : vb - va;
    });

    return r;
  },
};

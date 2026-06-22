/* ============================================================
   TABLE.JS — Fahrtenbuch: Filter, Suche, Sort, Render
   ============================================================ */

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
  ],

  /* ── Öffentliche API ─────────────────────────────────────────── */
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
      const sortKey = c.sk || c.k;
      const sorted  = this.state.sortCol === sortKey;
      const icon    = sorted ? (this.state.sortDir === "asc" ? "↑" : "↓") : "↕";
      return `
        <th class="${sorted ? "sorted" : ""}" data-sort="${sortKey}">
          ${c.l}<span class="sort-icon">${icon}</span>
        </th>`;
    }).join("");

    thead.querySelectorAll("th").forEach(th =>
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
    el("table-body").innerHTML = filtered.map(r => {
      const feel = normalizeFeel(r.feel);
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
          <td><span class="feel feel-${feel.cls}">${feel.label}</span></td>
        </tr>`;
    }).join("");
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

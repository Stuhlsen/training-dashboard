/* ============================================================
   DATA.JS — Datenladen, Normalisierung, Fallback-Daten
   Datenquelle: Statisches JSON (generiert per GitHub Action)
   Fallback: Eingebettete STATIC_RIDES (für lokale Entwicklung)
   ============================================================ */

const Data = {

  rides: [],
  wellness: [],
  powerCurves: null,
  athleteWeight: null,

  /* ── Laden ──────────────────────────────────────────────────── */
  async load() {
    try {
      const res = await fetch(CONFIG.apiEndpoint + "?_=" + Date.now());
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      const json = await res.json();
      if (json.rides && json.rides.length > 0) {
        this.rides = json.rides.map(r => this._normalize(r));
        this.wellness = (json.wellness || []).map(w => ({
          ...w,
          dateShort: fmtDate(w.date),
          dateISO: w.date,
        }));
        this.powerCurves = json.powerCurves || null;
        this.athleteWeight = json.athleteWeight || null;
        return { ok: true, source: "json", updated: json.updated };
      }
      throw new Error("Keine Daten in JSON-Datei");
    } catch (err) {
      console.warn("JSON nicht verfügbar, nutze eingebettete Daten:", err.message);
      this.rides = STATIC_RIDES.map(r => this._normalize(r));
      this.wellness = [];
      this.powerCurves = null;
      this.athleteWeight = null;
      return { ok: true, source: "static", warning: err.message };
    }
  },

  /* ── Normalisierung ─────────────────────────────────────────── */
  _normalize(r) {
    const dateISO = r.dateISO || r.date || "";
    const feel = normalizeFeel(r.feel);
    return {
      ...r,
      dateISO,
      dateShort: fmtDate(dateISO),
      feel:      feel.label,
      feelCls:   feel.cls,
      // Effizienz: Watt pro Herzschlag
      efficiency: (r.watt && r.hf) ? Math.round((r.watt / r.hf) * 100) / 100 : null,
    };
  },

  /* ── Getter ─────────────────────────────────────────────────── */

  /** Alle Fahrten sortiert nach Datum aufsteigend */
  byDate() {
    return [...this.rides].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  },

  /** Fahrten nach Phase filtern */
  byPhase(phase) {
    return this.rides.filter(r => r.phase === phase);
  },

  /** Fahrten nach Plan filtern */
  byPlan(plan) {
    return this.rides.filter(r => r.plan === plan);
  },

  /** Letzter FTP-Test */
  latestFTP() {
    const tests = this.rides
      .filter(r => r.typ === "FTP-Test")
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    return tests.length ? tests[tests.length - 1] : null;
  },

  /** FTP-Wert (aus Notizen extrahiert oder Config-Fallback) */
  ftpValue() {
    const test = this.latestFTP();
    if (test) return test.ftpWatt || test.np || test.watt || CONFIG.ftp;
    return CONFIG.ftp;
  },

  /** Wöchentliche Aggregation */
  weekly() {
    const weeks = [...new Set(this.rides.map(r => r.week))]
      .filter(Boolean)
      .sort((a, b) => CONFIG.weekIndex(a) - CONFIG.weekIndex(b));

    return weeks.map(week => {
      const wr = this.rides.filter(r => r.week === week);
      return {
        week,
        phase:  wr[0]?.phase || "Vorbereitung",
        plan:   wr[0]?.plan || "Plan 1",
        rides:  wr.length,
        km:     Math.round(sum(wr, "km") * 10) / 10,
        min:    sum(wr, "min"),
        trimp:  Math.round(sum(wr, "trimp")),
        avgHF:  avg(wr, "hf"),
        avgKad: avg(wr, "kad"),
        avgEff: avg(wr.filter(r => r.efficiency), "efficiency"),
      };
    });
  },
};

/* ============================================================
   STATIC_RIDES — Fallback wenn JSON-Datei nicht erreichbar
   (z.B. lokale Entwicklung ohne HTTP-Server)
   Letzte Aktualisierung: 22.06.2026
   ============================================================ */
const STATIC_RIDES = [
  {id:1,date:"2026-03-24",week:"Vor W1",phase:"Vorbereitung",name:"Z2 Dauer · Hart gefahren",typ:"Ausserplanmaessig",plan:"Plan 1",km:19.2,min:48,kmh:23.9,hf:163,hfMax:183,kad:74,watt:null,np:null,trimp:131,ctl:null,feel:"Hart"},
  {id:2,date:"2026-03-25",week:"Vor W1",phase:"Vorbereitung",name:"Z2 Dauer",typ:"Ausserplanmaessig",plan:"Plan 1",km:19.2,min:57,kmh:20.1,hf:133,hfMax:149,kad:77,watt:null,np:null,trimp:72,ctl:1,feel:"Irgendwie einfach"},
  {id:3,date:"2026-03-26",week:"Vor W1",phase:"Vorbereitung",name:"Z2 Dauer",typ:"Ausserplanmaessig",plan:"Plan 1",km:19.1,min:57,kmh:20.1,hf:131,hfMax:146,kad:84,watt:null,np:null,trimp:68,ctl:2,feel:"Irgendwie einfach"},
  {id:4,date:"2026-03-27",week:"Vor W1",phase:"Vorbereitung",name:"Z2 Dauer",typ:"Ausserplanmaessig",plan:"Plan 1",km:19.2,min:57,kmh:20.2,hf:139,hfMax:156,kad:81,watt:null,np:null,trimp:84,ctl:3,feel:"Moderat"},
  {id:5,date:"2026-03-28",week:"Vor W1",phase:"Vorbereitung",name:"Z2 Dauer",typ:"Ausserplanmaessig",plan:"Plan 1",km:19.2,min:53,kmh:21.7,hf:140,hfMax:155,kad:83,watt:null,np:null,trimp:80,ctl:5,feel:"Moderat"},
  {id:6,date:"2026-03-31",week:"W1",phase:"Phase 1",name:"Z2 Dauer (verschoben)",typ:"Z2 Dauer",plan:"Plan 1",km:19.2,min:58,kmh:19.9,hf:137,hfMax:154,kad:84,watt:null,np:null,trimp:80,ctl:6,feel:"Moderat"},
  {id:7,date:"2026-04-01",week:"W1",phase:"Phase 1",name:"Z2 Kadenz",typ:"Z2 Kadenz",plan:"Plan 1",km:23.3,min:66,kmh:21.1,hf:134,hfMax:147,kad:84,watt:null,np:null,trimp:85,ctl:6.8,feel:"Leicht"},
  {id:8,date:"2026-04-02",week:"W1",phase:"Phase 1",name:"Z2 Dauer außerplanmäßig",typ:"Ausserplanmaessig",plan:"Plan 1",km:23.7,min:73,kmh:19.4,hf:133,hfMax:158,kad:80,watt:null,np:null,trimp:92,ctl:8,feel:"Irgendwie einfach"},
  {id:9,date:"2026-04-04",week:"W1",phase:"Phase 1",name:"Z2 Lang Freestyle",typ:"Z2 Lang",plan:"Plan 1",km:28.5,min:85,kmh:20.1,hf:136,hfMax:171,kad:82,watt:null,np:null,trimp:117,ctl:9,feel:"Irgendwie einfach"},
  {id:10,date:"2026-04-05",week:"W1",phase:"Phase 1",name:"Z2 Dauer außerplanmäßig",typ:"Ausserplanmaessig",plan:"Plan 1",km:30.0,min:87,kmh:20.6,hf:134,hfMax:159,kad:83,watt:null,np:null,trimp:113,ctl:10,feel:"Moderat"},
  {id:11,date:"2026-04-06",week:"W2",phase:"Phase 1",name:"Z2 Kadenz",typ:"Z2 Kadenz",plan:"Plan 1",km:23.6,min:77,kmh:18.3,hf:131,hfMax:153,kad:80,watt:null,np:null,trimp:91,ctl:11,feel:"Irgendwie schwer"},
  {id:12,date:"2026-04-08",week:"W2",phase:"Phase 1",name:"Z2 Dauer",typ:"Z2 Dauer",plan:"Plan 1",km:22.6,min:64,kmh:21.2,hf:136,hfMax:165,kad:85,watt:null,np:null,trimp:87,ctl:12,feel:"Irgendwie einfach"},
  {id:13,date:"2026-04-09",week:"W2",phase:"Phase 1",name:"Lange Tour mit Kumpel",typ:"Ausserplanmaessig",plan:"Plan 1",km:57.2,min:158,kmh:21.7,hf:144,hfMax:189,kad:82,watt:null,np:null,trimp:268,ctl:15,feel:"Moderat"},
  {id:14,date:"2026-04-13",week:"W3",phase:"Phase 1",name:"Z2 Dauer",typ:"Z2 Dauer",plan:"Plan 1",km:21.8,min:63,kmh:20.6,hf:138,hfMax:165,kad:85,watt:null,np:null,trimp:91,ctl:15,feel:"Moderat"},
  {id:15,date:"2026-04-15",week:"W3",phase:"Phase 1",name:"Z2 Lang Langausfahrt",typ:"Z2 Lang",plan:"Plan 1",km:39.0,min:115,kmh:20.4,hf:138,hfMax:157,kad:85,watt:null,np:null,trimp:165,ctl:17,feel:"Irgendwie einfach"},
  {id:16,date:"2026-04-16",week:"W3",phase:"Phase 1",name:"Freestyle Z4 außerplanmäßig",typ:"Freestyle",plan:"Plan 1",km:21.4,min:58,kmh:22.0,hf:155,hfMax:189,kad:86,watt:null,np:null,trimp:131,ctl:18.1,feel:"Moderat",heu:true},
  {id:17,date:"2026-04-18",week:"W3",phase:"Phase 1",name:"Z2 Lang mit Akzenten",typ:"Z2 Lang",plan:"Plan 1",km:43.3,min:115,kmh:22.6,hf:144,hfMax:192,kad:86,watt:null,np:null,trimp:195,ctl:20,feel:"Moderat"},
  {id:18,date:"2026-04-20",week:"W4",phase:"Phase 1",name:"Z1 Recovery",typ:"Z1 Recovery",plan:"Plan 1",km:23.7,min:75,kmh:19.0,hf:136,hfMax:162,kad:85,watt:null,np:null,trimp:101,ctl:20,feel:"Leicht"},
  {id:19,date:"2026-04-25",week:"W4",phase:"Phase 1",name:"Z1 Recovery",typ:"Z1 Recovery",plan:"Plan 1",km:33.0,min:101,kmh:19.7,hf:133,hfMax:154,kad:84,watt:null,np:null,trimp:126,ctl:20,feel:"Leicht"},
  {id:20,date:"2026-04-26",week:"W4",phase:"Phase 1",name:"Z2 Lang außerplanmäßig",typ:"Ausserplanmaessig",plan:"Plan 1",km:40.0,min:121,kmh:19.9,hf:133,hfMax:177,kad:85,watt:null,np:null,trimp:152,ctl:21,feel:"Leicht"},
  {id:21,date:"2026-04-27",week:"W5",phase:"Phase 2",name:"Z2 Dauer",typ:"Z2 Dauer",plan:"Plan 1",km:23.7,min:72,kmh:19.7,hf:128,hfMax:147,kad:87,watt:null,np:null,trimp:79,ctl:22,feel:"Sehr leicht"},
  {id:22,date:"2026-04-28",week:"W5",phase:"Phase 2",name:"Z2 Dauer",typ:"Z2 Dauer",plan:"Plan 1",km:26.3,min:83,kmh:19.1,hf:126,hfMax:138,kad:88,watt:null,np:null,trimp:85,ctl:23,feel:"Sehr leicht"},
  {id:23,date:"2026-04-29",week:"W5",phase:"Phase 2",name:"Z2 Dauer",typ:"Z2 Dauer",plan:"Plan 1",km:28.2,min:81,kmh:20.9,hf:136,hfMax:169,kad:87,watt:null,np:null,trimp:111,ctl:24,feel:"Irgendwie einfach"},
  {id:24,date:"2026-05-01",week:"W5",phase:"Phase 2",name:"Etappe 1: SFB→DD (Gravel)",typ:"Etappe",plan:"Plan 1",km:79.8,min:276,kmh:17.4,hf:143,hfMax:201,kad:80,watt:null,np:null,trimp:453,ctl:29,feel:"Schwer"},
  {id:25,date:"2026-05-03",week:"W5",phase:"Phase 2",name:"Etappe 2: DD→SFB (Straße)",typ:"Etappe",plan:"Plan 1",km:68.6,min:194,kmh:21.2,hf:142,hfMax:176,kad:83,watt:null,np:null,trimp:310,ctl:32,feel:"Irgendwie schwer"},
  {id:26,date:"2026-05-06",week:"W6",phase:"Phase 2",name:"Z2 Erholungsfahrt",typ:"Z2 Erholung",plan:"Plan 1",km:26.4,min:76,kmh:20.8,hf:131,hfMax:153,kad:86,watt:null,np:null,trimp:90,ctl:31,feel:"Leicht"},
  {id:27,date:"2026-05-08",week:"W6",phase:"Phase 2",name:"Pedaltest",typ:"Ausserplanmaessig",plan:"Plan 1",km:19.9,min:49,kmh:24.4,hf:149,hfMax:185,kad:88,watt:139,np:177,trimp:94,ctl:31,feel:"Moderat"},
  {id:28,date:"2026-05-09",week:"W6",phase:"Phase 2",name:"Große Runde",typ:"Ausserplanmaessig",plan:"Plan 1",km:51.9,min:141,kmh:22.0,hf:132,hfMax:197,kad:84,watt:116,np:169,trimp:221,ctl:33,feel:"Irgendwie einfach"},
  {id:29,date:"2026-05-11",week:"W7",phase:"Phase 2",name:"Z2 Locker Indoor",typ:"Z2 Erholung",plan:"Plan 1",km:39.3,min:91,kmh:26.0,hf:132,hfMax:147,kad:79,watt:107,np:121,trimp:111,ctl:33,feel:"Moderat"},
  {id:30,date:"2026-05-12",week:"W7",phase:"Phase 2",name:"Crit Rennen MyWhoosh",typ:"Ausserplanmaessig",plan:"Plan 1",km:13.9,min:29,kmh:29.1,hf:172,hfMax:187,kad:58,watt:151,np:162,trimp:97,ctl:33,feel:"Hart"},
  {id:31,date:"2026-05-12",week:"W7",phase:"Phase 2",name:"Ausrollen nach Crit",typ:"Z1 Recovery",plan:"Plan 1",km:7.5,min:20,kmh:22.3,hf:147,hfMax:168,kad:39,watt:99,np:99,trimp:37,ctl:33,feel:"Sehr leicht"},
  {id:32,date:"2026-05-14",week:"W7",phase:"Phase 2",name:"Spontan Indoor",typ:"Ausserplanmaessig",plan:"Plan 1",km:26.1,min:61,kmh:25.6,hf:null,hfMax:null,kad:null,watt:135,np:135,trimp:83,ctl:32,feel:"Moderat"},
  {id:33,date:"2026-05-16",week:"W7",phase:"Phase 2",name:"Z2 mit Kollegen Outdoor",typ:"Z2 Dauer",plan:"Plan 1",km:39.4,min:100,kmh:23.7,hf:143,hfMax:179,kad:85,watt:135,np:158,trimp:165,ctl:33,feel:"Irgendwie einfach"},
  {id:34,date:"2026-05-17",week:"W7",phase:"Phase 2",name:"Z2 Gemütliche Runde",typ:"Z2 Dauer",plan:"Plan 1",km:44.6,min:120,kmh:22.3,hf:143,hfMax:175,kad:84,watt:125,np:156,trimp:198,ctl:34,feel:"Leicht"},
  {id:35,date:"2026-05-18",week:"W8",phase:"Phase 2",name:"Z2 Outdoor",typ:"Z2 Dauer",plan:"Plan 1",km:32.7,min:79,kmh:24.9,hf:144,hfMax:180,kad:87,watt:148,np:179,trimp:133,ctl:36,feel:"Irgendwie einfach"},
  {id:36,date:"2026-05-20",week:"W8",phase:"Phase 2",name:"Z2 Kadenz",typ:"Z2 Kadenz",plan:"Plan 1",km:28.7,min:68,kmh:25.6,hf:148,hfMax:177,kad:88,watt:160,np:181,trimp:126,ctl:36,feel:"Irgendwie einfach"},
  {id:37,date:"2026-05-21",week:"W8",phase:"Phase 2",name:"Außerplanmäßig",typ:"Ausserplanmaessig",plan:"Plan 1",km:27.3,min:71,kmh:22.9,hf:130,hfMax:148,kad:85,watt:124,np:137,trimp:82,ctl:36,feel:"Leicht"},
  {id:38,date:"2026-05-22",week:"W8",phase:"Phase 2",name:"Z2 Dauer",typ:"Z2 Dauer",plan:"Plan 1",km:30.3,min:77,kmh:23.6,hf:146,hfMax:181,kad:86,watt:134,np:161,trimp:139,ctl:37,feel:"Leicht"},
  {id:39,date:"2026-05-23",week:"W8",phase:"Phase 2",name:"Z2 Lang Gruppenfahrt",typ:"Z2 Lang",plan:"Plan 1",km:52.1,min:130,kmh:24.1,hf:143,hfMax:181,kad:85,watt:131,np:160,trimp:214,ctl:39,feel:"Moderat"},
  {id:40,date:"2026-05-24",week:"W8",phase:"Phase 2",name:"Freestyle",typ:"Freestyle",plan:"Plan 1",km:43.1,min:123,kmh:21.0,hf:139,hfMax:184,kad:78,watt:109,np:145,trimp:183,ctl:41,feel:"Leicht"},
  {id:41,date:"2026-05-25",week:"W9",phase:"Phase 3",name:"Abendrunde",typ:"Ausserplanmaessig",plan:"Plan 1",km:22.5,min:52,kmh:26.1,hf:146,hfMax:160,kad:89,watt:156,np:169,trimp:92,ctl:41,feel:"Sehr leicht"},
  {id:42,date:"2026-05-27",week:"W9",phase:"Phase 3",name:"Z2 Kadenz",typ:"Z2 Kadenz",plan:"Plan 1",km:32.2,min:81,kmh:23.9,hf:141,hfMax:160,kad:86,watt:139,np:155,trimp:127,ctl:41,feel:"Leicht"},
  {id:43,date:"2026-05-28",week:"W9",phase:"Phase 3",name:"Gruppenfahrt Etappe",typ:"Etappe",plan:"Plan 1",km:60.4,min:132,kmh:27.6,hf:144,hfMax:189,kad:86,watt:151,np:180,trimp:223,ctl:43,feel:"Moderat"},
  {id:44,date:"2026-05-30",week:"W9",phase:"Phase 3",name:"Freestyle Tempo",typ:"Freestyle",plan:"Plan 1",km:23.5,min:52,kmh:26.9,hf:146,hfMax:169,kad:90,watt:167,np:186,trimp:93,ctl:43,feel:"Moderat"},
  {id:45,date:"2026-06-01",week:"W10",phase:"Phase 3",name:"Z2 Dauer",typ:"Z2 Dauer",plan:"Plan 1",km:34.2,min:87,kmh:23.6,hf:144,hfMax:174,kad:86,watt:136,np:163,trimp:143,ctl:43,feel:"Irgendwie einfach"},
  {id:46,date:"2026-06-02",week:"W10",phase:"Phase 3",name:"Etappe Gruppenfahrt",typ:"Etappe",plan:"Plan 1",km:62.4,min:147,kmh:25.5,hf:140,hfMax:177,kad:86,watt:135,np:162,trimp:225,ctl:45,feel:"Moderat"},
  {id:47,date:"2026-06-03",week:"W10",phase:"Phase 3",name:"Sweet Spot 3×10 min",typ:"Schwelle",plan:"Plan 1",km:34.0,min:84,kmh:24.2,hf:132,hfMax:153,kad:90,watt:128,np:143,trimp:103,ctl:46,feel:"Moderat"},
  {id:48,date:"2026-06-05",week:"W10",phase:"Phase 3",name:"Z2 Lang – Erster 100er!",typ:"Z2 Lang",plan:"Plan 1",km:100.4,min:242,kmh:24.9,hf:135,hfMax:160,kad:89,watt:138,np:154,trimp:322,ctl:48,feel:"Irgendwie einfach"},
  {id:49,date:"2026-06-06",week:"W10",phase:"Phase 3",name:"Z1 Recovery Erholungsfahrt",typ:"Z1 Recovery",plan:"Plan 1",km:30.4,min:86,kmh:21.2,hf:121,hfMax:153,kad:84,watt:104,np:131,trimp:77,ctl:48,feel:"Leicht"},
  {id:50,date:"2026-06-08",week:"W11",phase:"Phase 3",name:"Spontanfahrt Z2 Lang",typ:"Ausserplanmaessig",plan:"Plan 1",km:64.0,min:159,kmh:24.2,hf:136,hfMax:170,kad:88,watt:129,np:150,trimp:213,ctl:49,feel:"Leicht"},
  {id:51,date:"2026-06-09",week:"W11",phase:"Phase 3",name:"Gravel & Gegenwind",typ:"Freestyle",plan:"Plan 1",km:71.1,min:182,kmh:23.5,hf:128,hfMax:175,kad:84,watt:127,np:155,trimp:199,ctl:51,feel:"Irgendwie einfach"},
  {id:52,date:"2026-06-12",week:"W11",phase:"Phase 3",name:"FTP Ramp Test",typ:"FTP-Test",plan:"Plan 1",km:12.3,min:29,kmh:null,hf:133,hfMax:177,kad:79,watt:130,np:163,ftpWatt:193,trimp:36,ctl:49,feel:"Irgendwie einfach"},
  {id:53,date:"2026-06-13",week:"W11",phase:"Phase 3",name:"Indoor Freestyle (MyWhoosh)",typ:"Ausserplanmaessig",plan:"Plan 1",km:62.1,min:136,kmh:null,hf:123,hfMax:157,kad:81,watt:132,np:144,trimp:128,ctl:51,feel:"Leicht"},
  {id:54,date:"2026-06-16",week:"W12",phase:"Phase 3",name:"Gruppenfahrt (außerplan.)",typ:"Ausserplanmaessig",plan:"Plan 1",km:70.7,min:167,kmh:25.1,hf:133,hfMax:180,kad:85,watt:141,np:170,trimp:212,ctl:51,feel:"Irgendwie einfach"},
  {id:55,date:"2026-06-17",week:"W12",phase:"Phase 3",name:"Trainingsrunde PB",typ:"Freestyle",plan:"Plan 1",km:19.5,min:40,kmh:29.6,hf:155,hfMax:171,kad:91,watt:186,np:200,trimp:89,ctl:53,feel:"Moderat"},
  {id:56,date:"2026-06-20",week:"W12",phase:"Phase 3",name:"Große Abschlussrunde SFB→DD→SFB (138km!)",typ:"Z2 Lang",plan:"Plan 1",km:138.4,min:373,kmh:22.2,hf:132,hfMax:167,kad:84,watt:119,np:145,trimp:460,ctl:59,atl:100,tsb:-41,tss:324,vi:1.22,dtl:298.2,ruhepuls:63,hrv:95,hoehe:399,feel:"Irgendwie schwer"},
  {id:57,date:"2026-06-23",week:"P2-W0",phase:"Übergang",name:"Gruppenfahrt W0",typ:"Gruppenfahrt",plan:"Plan 2",km:70.83,min:161,kmh:26.4,hf:141,hfMax:185,kad:87,watt:138,np:175,tss:204,ctl:59,atl:92,tsb:-33,vi:1.27,dtl:125.2,ruhepuls:52,hrv:116,hoehe:91,feel:"Moderat"},
];

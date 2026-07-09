/* ============================================================
   SCRIPTS/LIB/NOTION.JS — Notion-Datenbank-Abfrage (Plan 1)
   ============================================================ */

import { ENV } from "./env.js";
import { log } from "./log.js";

// === Notion Property-Getter (rein, testbar) ===
export function getTitle(p) {
  return p?.type === "title" ? p.title?.map((t) => t.plain_text).join("") || "" : "";
}
export function getSelect(p) {
  if (!p) return null;
  if (p.type === "select") return p.select?.name || null;
  if (p.type === "multi_select") return p.multi_select?.map((s) => s.name).join(", ") || null;
  if (p.type === "status") return p.status?.name || null;
  return null;
}
export function getNum(p) {
  return p?.type === "number" ? p.number : null;
}
export function getCheckbox(p) {
  return p?.type === "checkbox" ? p.checkbox || false : false;
}
export function getDate(p) {
  return p?.type === "date" && p.date ? p.date.start || null : null;
}
export function getRichText(p) {
  return p?.type === "rich_text" ? p.rich_text?.map((t) => t.plain_text).join("") || "" : "";
}

/**
 * Extrahiert den FTP-Wert aus dem Notizen-Freitext eines FTP-Tests
 * (z.B. "Neues FTP: 193 W"). Rein, testbar.
 * @param {string} notizen @returns {number|null}
 */
export function parseFtpFromNotes(notizen) {
  if (!notizen) return null;
  const m = notizen.match(/(?:Neues FTP|FTP)[:\s]+(\d+)\s*W/i);
  return m ? parseInt(m[1], 10) : null;
}

// === Notion: Plan 1 Daten (alle Felder) ===
export async function queryNotionPlan1() {
  log.info("📡 Notion-Datenbank abfragen (Plan 1)...");
  let all = [],
    hasMore = true,
    cursor;

  while (hasMore) {
    const body = { page_size: 100, sorts: [{ property: "Datum", direction: "ascending" }] };
    if (cursor) body.start_cursor = cursor;
    const res = await fetch(`https://api.notion.com/v1/databases/${ENV.DB_ID}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ENV.NOTION_KEY}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      log.error(`Notion Plan 1 (${res.status}):`, await res.text());
      process.exit(1);
    }
    const data = await res.json();
    all = all.concat(data.results);
    hasMore = data.has_more;
    cursor = data.next_cursor;
  }
  log.info(`   ... ${all.length} Einträge geladen`);

  return all
    .filter((p) => {
      const st = p.properties?.Status;
      return (st?.select?.name || st?.status?.name) === "Erledigt";
    })
    .map((page) => {
      const pr = page.properties;
      const rawName = getTitle(pr["Einheit"]);
      const cleanName = rawName.replace(/^W\d+\s*[·\-]\s*\S+\s*[·\-]\s*/, "").trim();
      const notizen = getRichText(pr["Notizen"]);
      const ftpWatt = getSelect(pr["Typ"]) === "FTP-Test" ? parseFtpFromNotes(notizen) : null;
      return {
        name: cleanName || rawName,
        date: getDate(pr["Datum"]),
        week: getSelect(pr["Woche"]),
        phase: getSelect(pr["Phase"]),
        typ: getSelect(pr["Typ"]),
        plan: "Plan 1",
        km: getNum(pr["Distanz (km)"]),
        min: getNum(pr["Dauer (min)"]),
        kmh: getNum(pr["Avg-Tempo (km/h)"]),
        hf: getNum(pr["Avg-HF"]),
        hfMax: getNum(pr["HF-Max"]),
        kad: getNum(pr["Avg-Kadenz"]),
        watt: getNum(pr["Avg-Watt"]),
        np: getNum(pr["NP (W)"]),
        ftpWatt,
        maxWatt: getNum(pr["Max-Watt"]),
        trimp: getNum(pr["TRIMP"]),
        ctl: getNum(pr["CTL (Fitness)"]),
        atl: getNum(pr["ATL (Ermüdung)"]),
        tsb: getNum(pr["TSB (Form)"]),
        tss: getNum(pr["TSS"]),
        vi: getNum(pr["VI"]),
        ruhepuls: getNum(pr["Ruhepuls"]),
        hrv: getNum(pr["HRV"]),
        decoupling: null,
        dtl: getNum(pr["DTL"]),
        hoehe: getNum(pr["Hoehengewinn (m)"] || pr["Hoehengewinn"]),
        feel: getSelect(pr["Befinden"]),
        heu: getCheckbox(pr["Heuschnupfen"]),
        wetter: null,
        notionWetter: getRichText(pr["Wetter"]),
        notizen,
      };
    });
}

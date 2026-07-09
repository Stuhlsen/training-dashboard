/* ============================================================
   UI/GITHUB-CLIENT.JS — GitHub-Contents-API-Zugriff
   Zentralisiert Token-Handling (holen, prüfen, bei 401
   invalidieren, neu erfragen) und das GET-SHA + PUT-Muster,
   das vorher dreifach ähnlich in table.js/planned.js lag.

   Rückgaben folgen dem einheitlichen Result-Typ (types.js):
   { ok: true, ... } | { ok: false, error: { code, message } }
   ============================================================ */

import { log } from "./log.js";

const REPO = "Stuhlsen/training-dashboard";
const API_BASE = `https://api.github.com/repos/${REPO}/contents`;
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/main`;
const TOKEN_KEY = "gh_token";

let _token = null;

/** Token aus Cache oder localStorage @returns {string|null} */
export function getToken() {
  if (!_token) _token = localStorage.getItem(TOKEN_KEY);
  return _token;
}

/** Token per Prompt erfragen und lokal speichern @returns {string|null} */
export function promptToken() {
  const t = prompt("GitHub Personal Access Token eingeben (wird nur lokal gespeichert):");
  if (t) {
    _token = t;
    localStorage.setItem(TOKEN_KEY, t);
  }
  return t;
}

/** Token verwerfen (nach 401) */
export function invalidateToken() {
  localStorage.removeItem(TOKEN_KEY);
  _token = null;
}

/** @returns {import("../types.js").AppError} */
function tokenError() {
  return {
    code: "TOKEN_INVALID",
    message: "Token ungültig — bitte Seite neu laden und Token neu eingeben",
  };
}

/**
 * JSON-Datei über raw.githubusercontent.com lesen (umgeht den
 * GitHub-Pages-CDN-Cache). Liefert {} bei jedem Fehler — für
 * unkritische Reads wie adjustments/subjective ausreichend.
 * @param {string} path Repo-Pfad, z.B. "data/subjective.json"
 * @returns {Promise<Object>}
 */
export async function fetchRawJson(path) {
  try {
    const res = await fetch(`${RAW_BASE}/${path}?_=` + Date.now());
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}

/**
 * Schreibt ein JSON-Objekt in die Repo-Datei (GET SHA → PUT).
 * Fragt bei fehlendem Token einmalig nach; invalidiert bei 401.
 * @param {string} path Repo-Pfad, z.B. "data/adjustments.json"
 * @param {string} message Commit-Message
 * @param {Object} dataObj Wird als JSON (2 Spaces) geschrieben
 * @returns {Promise<import("../types.js").Result>}
 */
export async function writeRepoFile(path, message, dataObj) {
  let token = getToken();
  if (!token) token = promptToken();
  if (!token) return { ok: false, error: { code: "TOKEN_INVALID", message: "Kein Token" } };

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
  };

  try {
    // 1) Aktuellen SHA holen
    const infoRes = await fetch(`${API_BASE}/${path}`, { headers });
    if (!infoRes.ok) {
      const err = await infoRes.json().catch(() => ({}));
      log.error(`GET ${path} Fehler:`, err);
      if (infoRes.status === 401) {
        invalidateToken();
        return { ok: false, error: tokenError() };
      }
      return {
        ok: false,
        error: { code: "HTTP", message: `GET Fehler ${infoRes.status}: ${err.message || ""}` },
      };
    }
    const info = await infoRes.json();

    // 2) Neuen Inhalt schreiben
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(dataObj, null, 2))));
    const putRes = await fetch(`${API_BASE}/${path}`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ message, content, sha: info.sha }),
    });
    if (!putRes.ok) {
      const err = await putRes.json().catch(() => ({}));
      log.error(`PUT ${path} Fehler:`, err);
      if (putRes.status === 401 || err.message?.includes("Bad credentials")) {
        invalidateToken();
        return { ok: false, error: tokenError() };
      }
      return {
        ok: false,
        error: { code: "HTTP", message: `PUT Fehler ${putRes.status}: ${err.message || ""}` },
      };
    }
    return { ok: true };
  } catch (e) {
    log.error(`Write ${path} Exception:`, e);
    return { ok: false, error: { code: "NETWORK", message: e.message, cause: e } };
  }
}

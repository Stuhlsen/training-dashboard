/* ============================================================
   SCRIPTS/LIB/HTTP.JS — Fetch-Wrapper mit Timeout & Retry
   Macht die API-Calls in der GitHub Action robuster gegen
   kurze Netzwerk-Hänger (ein Retry, 20s Timeout).
   ============================================================ */

import { log } from "./log.js";

/**
 * GET/POST mit Timeout und einem Retry. Liefert die geparste
 * JSON-Antwort oder null (Fehler werden geloggt, nicht geworfen) —
 * Aufrufer entscheiden, ob null fatal ist.
 * @param {string} url
 * @param {RequestInit} [options]
 * @param {{retries?: number, timeoutMs?: number, label?: string}} [cfg]
 * @returns {Promise<Object|Array|null>}
 */
export async function fetchJson(url, options = {}, cfg = {}) {
  const { retries = 1, timeoutMs = 20000, label = url } = cfg;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) {
        log.warn(`${label} (HTTP ${res.status}): ${await res.text()}`);
        return null;
      }
      return await res.json();
    } catch (e) {
      clearTimeout(timer);
      if (attempt < retries) {
        log.warn(`${label}: ${e.message} — Retry ${attempt + 1}/${retries}…`);
        continue;
      }
      log.warn(`${label}: ${e.message}`);
      return null;
    }
  }
  return null;
}

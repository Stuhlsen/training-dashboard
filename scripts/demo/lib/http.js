/* ============================================================
   DEMO/LIB/HTTP.JS — schlanker Client für GoTrue-Admin + PostgREST
   (Fahrplan 31 E4). Bewusst NICHT scripts/lib/http.js: das liefert bei
   Fehlern null und wiederholt auch POSTs — beim Schreiben in die
   Demo-DB soll jeder Fehler laut abbrechen und nichts doppelt landen.
   Die Ziel-Sperre läuft hier ein zweites Mal, bevor der Client existiert.
   Der service_role-Key steht nur im Header, nie in Fehlermeldungen.
   ============================================================ */

import { assertDemoTarget } from "./guards.js";

const TIMEOUT_MS = 20000;
const BODY_PREVIEW = 300;

/** Fehler mit HTTP-Status; die Meldung enthält nie den Key. */
export class DemoHttpError extends Error {
  /** @param {string} method @param {string} pathname @param {number} status @param {string} body */
  constructor(method, pathname, status, body) {
    const hint =
      status === 401 || status === 403 || /42501|permission denied/.test(body)
        ? " — fehlen die Demo-Rechte? scripts/demo/grants.sql einspielen"
        : "";
    super(`${method} ${pathname} → HTTP ${status}: ${body.slice(0, BODY_PREVIEW)}${hint}`);
    this.status = status;
  }
}

/**
 * @param {{ url: string, serviceKey: string, fetchImpl?: typeof fetch }} opts
 * @returns {{ request: (method: string, path: string, opts?: { body?: unknown, prefer?: string }) => Promise<any> }}
 */
export function createDemoClient({ url, serviceKey, fetchImpl = fetch }) {
  assertDemoTarget(url);
  if (typeof serviceKey !== "string" || serviceKey.trim() === "") {
    throw new Error("Demo: DEMO_SERVICE_ROLE_KEY fehlt");
  }
  const base = url.replace(/\/+$/, "");

  async function request(method, path, { body, prefer } = {}) {
    const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (prefer) headers.Prefer = prefer;
    const pathname = path.split("?")[0];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res;
    let text;
    try {
      res = await fetchImpl(`${base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      text = await res.text();
    } catch (err) {
      const reason = err?.name === "AbortError" ? `Timeout nach ${TIMEOUT_MS} ms` : err?.message;
      throw new Error(`${method} ${pathname}: ${reason}`);
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new DemoHttpError(method, pathname, res.status, text);
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`${method} ${pathname}: Antwort ist kein JSON`);
    }
  }

  return { request };
}

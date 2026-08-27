/* ============================================================
   API/SUPABASE/MFA.TS — Zwei-Faktor-Login (TOTP) des eingeloggten Users
   (Settings, Bereich "Konto & Sicherheit")

   Wickelt supabase.auth.mfa.* direkt über den bare `supabase`-Singleton,
   NICHT getAuthedClient() — das existiert nur, um den Bearer-Header bei
   .from()-Tabellenzugriffen zu erzwingen (s. Kopfkommentar client.ts).
   .auth.*-Methoden nutzen die Session des Singletons bereits richtig, genau
   wie updatePassword()/signOut() in auth.ts.

   Bewusst NUR Einrichten/Verwalten — LoginPage.tsx/ProtectedRoute.tsx/
   AuthContext.tsx bleiben unangetastet, ein eingerichteter Faktor wird beim
   nächsten Login noch nicht abgefragt (Entscheidung Alex, s. offene-punkte.md).
   ============================================================ */

import { supabase } from "./client";
import type { Result } from "../types";

const NOT_CONFIGURED = { code: "UNKNOWN" as const, message: "Supabase nicht konfiguriert" };

export type MfaFactorStatus = "none" | "unverified" | "verified";

/** Liefert den Status des (höchstens einen, per UI erzwungenen) TOTP-Faktors
 *  — "unverified" nach enroll() vor der ersten erfolgreichen Bestätigung,
 *  "verified" danach, "none" ohne angelegten Faktor. */
export async function listMfaFactors(): Promise<
  Result<{ status: MfaFactorStatus; factorId: string | null }>
> {
  if (!supabase) return { ok: true, status: "none", factorId: null };
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  const totp = data.all.find((f) => f.factor_type === "totp");
  if (!totp) return { ok: true, status: "none", factorId: null };
  return { ok: true, status: totp.status === "verified" ? "verified" : "unverified", factorId: totp.id };
}

export async function enrollTotpFactor(): Promise<
  Result<{ factorId: string; qrCodeSvg: string; secret: string }>
> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, factorId: data.id, qrCodeSvg: data.totp.qr_code, secret: data.totp.secret };
}

export async function verifyTotpFactor(factorId: string, code: string): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}

export async function unenrollTotpFactor(factorId: string): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}

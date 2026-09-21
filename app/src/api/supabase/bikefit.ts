import { supabase, getAuthedClient } from "./client";
import type { Result } from "../types";

const NOT_CONFIGURED = { code: "UNKNOWN" as const, message: "Supabase nicht konfiguriert" };

export type FittingStatus = "active" | "completed" | "abandoned";
export type TargetGoal = "comfort" | "balanced" | "aero";

export interface BikefitFitting {
  id: string;
  profileId: string;
  bikeId: string;
  status: FittingStatus;
  targetGoal: TargetGoal;
  notes: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface BikefitIteration {
  id: string;
  fittingId: string;
  sequence: number;
  photoPathLegs: string | null;
  photoPathRiding: string | null;
  points: Record<string, unknown>;
  angles: Record<string, unknown>;
  recommendation: Record<string, unknown>;
  createdAt: string;
}

interface FittingRow {
  id: string;
  profile_id: string;
  bike_id: string;
  status: string;
  target_goal: string;
  notes: string | null;
  created_at: string;
  completed_at: string | null;
}

interface IterationRow {
  id: string;
  fitting_id: string;
  sequence: number;
  photo_path_legs: string | null;
  photo_path_riding: string | null;
  points: Record<string, unknown>;
  angles: Record<string, unknown>;
  recommendation: Record<string, unknown>;
  created_at: string;
}

function toFitting(row: FittingRow): BikefitFitting {
  return {
    id: row.id,
    profileId: row.profile_id,
    bikeId: row.bike_id,
    status: (row.status as FittingStatus) || "active",
    targetGoal: (row.target_goal as TargetGoal) || "balanced",
    notes: row.notes,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

function toIteration(row: IterationRow): BikefitIteration {
  return {
    id: row.id,
    fittingId: row.fitting_id,
    sequence: row.sequence,
    photoPathLegs: row.photo_path_legs,
    photoPathRiding: row.photo_path_riding,
    points: row.points || {},
    angles: row.angles || {},
    recommendation: row.recommendation || {},
    createdAt: row.created_at,
  };
}

/**
 * Lädt das aktive Fitting für ein bestimmtes Rad (falls vorhanden).
 */
export async function getActiveFitting(bikeId: string): Promise<Result<{ fitting: BikefitFitting | null }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  if (!bikeId) return { ok: true, fitting: null };

  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("bikefit_fittings")
    .select("id, profile_id, bike_id, status, target_goal, notes, created_at, completed_at")
    .eq("bike_id", bikeId)
    .eq("status", "active")
    .maybeSingle<FittingRow>();

  if (error) {
    return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  }

  return { ok: true, fitting: data ? toFitting(data) : null };
}

/**
 * Startet ein neues Fitting für ein Rad.
 */
export async function startFitting(
  profileId: string,
  bikeId: string,
  targetGoal: TargetGoal = "balanced",
  notes?: string | null
): Promise<Result<{ fitting: BikefitFitting }>> {
  const client = await getAuthedClient();
  if (!client) return { ok: false, error: { code: "UNKNOWN", message: "Nicht eingeloggt" } };

  const { data, error } = await client
    .from("bikefit_fittings")
    .insert({
      profile_id: profileId,
      bike_id: bikeId,
      status: "active",
      target_goal: targetGoal,
      notes: notes?.trim() || null,
    })
    .select("id, profile_id, bike_id, status, target_goal, notes, created_at, completed_at")
    .single<FittingRow>();

  if (error || !data) {
    return { ok: false, error: { code: "UNKNOWN", message: error?.message || "Fitting konnte nicht gestartet werden" } };
  }

  return { ok: true, fitting: toFitting(data) };
}

/**
 * Speichert eine neue Iteration zu einem Fitting.
 */
export async function addIteration(params: {
  fittingId: string;
  sequence: number;
  photoPathLegs?: string | null;
  photoPathRiding?: string | null;
  points: Record<string, unknown>;
  angles: Record<string, unknown>;
  recommendation: Record<string, unknown>;
}): Promise<Result<{ iteration: BikefitIteration }>> {
  const client = await getAuthedClient();
  if (!client) return { ok: false, error: { code: "UNKNOWN", message: "Nicht eingeloggt" } };

  const { data, error } = await client
    .from("bikefit_iterations")
    .insert({
      fitting_id: params.fittingId,
      sequence: params.sequence,
      photo_path_legs: params.photoPathLegs || null,
      photo_path_riding: params.photoPathRiding || null,
      points: params.points,
      angles: params.angles,
      recommendation: params.recommendation,
    })
    .select("id, fitting_id, sequence, photo_path_legs, photo_path_riding, points, angles, recommendation, created_at")
    .single<IterationRow>();

  if (error || !data) {
    return { ok: false, error: { code: "UNKNOWN", message: error?.message || "Fehler beim Speichern der Iteration" } };
  }

  return { ok: true, iteration: toIteration(data) };
}

/**
 * Lädt alle Iterationen zu einem Fitting.
 */
export async function getIterations(fittingId: string): Promise<Result<{ iterations: BikefitIteration[] }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  if (!fittingId) return { ok: true, iterations: [] };

  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("bikefit_iterations")
    .select("id, fitting_id, sequence, photo_path_legs, photo_path_riding, points, angles, recommendation, created_at")
    .eq("fitting_id", fittingId)
    .order("sequence", { ascending: true });

  if (error) {
    return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  }

  return { ok: true, iterations: ((data as IterationRow[]) || []).map(toIteration) };
}

/**
 * Lädt die Zeitpunkte aller Bikefit-Änderungen (jeder Iteration) für einen Athleten (E9 Fahrtenbuch-Marker, OF-4).
 * Liefert das Datum jeder Iteration über alle Fittings des Athleten.
 */
export async function getIterationDates(profileId: string): Promise<Result<{ dates: string[] }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  if (!profileId) return { ok: true, dates: [] };

  const client = (await getAuthedClient()) ?? supabase;
  // Join über bikefit_fittings zu bikefit_iterations
  const { data, error } = await client
    .from("bikefit_iterations")
    .select("created_at, bikefit_fittings!inner(profile_id)")
    .eq("bikefit_fittings.profile_id", profileId)
    .order("created_at", { ascending: false });

  if (error) {
    return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  }

  const dates = ((data as { created_at: string }[]) || [])
    .map((r) => (r.created_at ? r.created_at.slice(0, 10) : null))
    .filter((d): d is string => !!d);

  return { ok: true, dates: Array.from(new Set(dates)) };
}

/**
 * Schließt ein Fitting ab (status -> completed).
 */
export async function completeFitting(fittingId: string): Promise<Result<{ fitting: BikefitFitting }>> {
  const client = await getAuthedClient();
  if (!client) return { ok: false, error: { code: "UNKNOWN", message: "Nicht eingeloggt" } };

  const { data, error } = await client
    .from("bikefit_fittings")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", fittingId)
    .select("id, profile_id, bike_id, status, target_goal, notes, created_at, completed_at")
    .single<FittingRow>();

  if (error || !data) {
    return { ok: false, error: { code: "UNKNOWN", message: error?.message || "Fehler beim Abschließen" } };
  }

  return { ok: true, fitting: toFitting(data) };
}
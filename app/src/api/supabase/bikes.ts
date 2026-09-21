import { supabase, getAuthedClient } from "./client";
import type { Result } from "../types";

const NOT_CONFIGURED = { code: "UNKNOWN" as const, message: "Supabase nicht konfiguriert" };

export type BikeType = "road" | "gravel" | "tt" | "mtb";

export interface Bike {
  id: string;
  profileId: string;
  name: string;
  bikeType: BikeType;
  crankLengthMm: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Wie Bike, aber ohne `notes` — Shape der `bikes_public`-View (Migration
 *  0051). `notes` ist ein freies Textfeld ohne Formatvorgabe und war nie Teil
 *  der OF-6-Entscheidung ("alle Betrachter sehen die Liste"); nur Name/Radtyp/
 *  Kurbellänge sind athletenübergreifend sichtbar. */
export interface PublicBike {
  id: string;
  profileId: string;
  name: string;
  bikeType: BikeType;
  crankLengthMm: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface BikeInput {
  name: string;
  bikeType: BikeType;
  crankLengthMm?: number | null;
  notes?: string | null;
}

interface BikeRow {
  id: string;
  profile_id: string;
  name: string;
  bike_type: string;
  crank_length_mm: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

type PublicBikeRow = Omit<BikeRow, "notes">;

function toBike(row: BikeRow): Bike {
  return {
    id: row.id,
    profileId: row.profile_id,
    name: row.name,
    bikeType: (row.bike_type as BikeType) || "road",
    crankLengthMm: row.crank_length_mm,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPublicBike(row: PublicBikeRow): PublicBike {
  return {
    id: row.id,
    profileId: row.profile_id,
    name: row.name,
    bikeType: (row.bike_type as BikeType) || "road",
    crankLengthMm: row.crank_length_mm,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Lädt alle Räder eines bestimmten Profils/Athleten.
 */
export async function getBikes(profileId: string): Promise<Result<{ bikes: Bike[] }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  if (!profileId) return { ok: true, bikes: [] };

  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("bikes")
    .select("id, profile_id, name, bike_type, crank_length_mm, notes, created_at, updated_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: true });

  if (error) {
    return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  }

  return { ok: true, bikes: ((data as BikeRow[]) || []).map(toBike) };
}

/**
 * Lädt alle Räder eines Athleten OHNE `notes` (Migration 0051, bikes_public-
 * View) — für Aufrufstellen, die den Athleten nur ansehen (z. B. den
 * Bike-Fit-Tab eines fremden Athleten über den Athleten-Toggle), nicht für
 * dessen eigene Settings-Verwaltung. Dort weiter getBikes() (volle Zeile,
 * durch RLS ohnehin nur für Eigentümer/Coach/Admin erreichbar).
 */
export async function getBikesPublic(profileId: string): Promise<Result<{ bikes: PublicBike[] }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  if (!profileId) return { ok: true, bikes: [] };

  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("bikes_public")
    .select("id, profile_id, name, bike_type, crank_length_mm, created_at, updated_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: true });

  if (error) {
    return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  }

  return { ok: true, bikes: ((data as PublicBikeRow[]) || []).map(toPublicBike) };
}

/**
 * Legt ein neues Rad an.
 */
export async function createBike(profileId: string, input: BikeInput): Promise<Result<{ bike: Bike }>> {
  const client = await getAuthedClient();
  if (!client) return { ok: false, error: { code: "UNKNOWN", message: "Nicht eingeloggt" } };

  const { data, error } = await client
    .from("bikes")
    .insert({
      profile_id: profileId,
      name: input.name.trim(),
      bike_type: input.bikeType,
      crank_length_mm: input.crankLengthMm ?? null,
      notes: input.notes?.trim() || null,
    })
    .select("id, profile_id, name, bike_type, crank_length_mm, notes, created_at, updated_at")
    .single<BikeRow>();

  if (error || !data) {
    return { ok: false, error: { code: "UNKNOWN", message: error?.message || "Fehler beim Anlegen" } };
  }

  return { ok: true, bike: toBike(data) };
}

/**
 * Aktualisiert ein bestehendes Rad.
 */
export async function updateBike(bikeId: string, input: Partial<BikeInput>): Promise<Result<{ bike: Bike }>> {
  const client = await getAuthedClient();
  if (!client) return { ok: false, error: { code: "UNKNOWN", message: "Nicht eingeloggt" } };

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.bikeType !== undefined) patch.bike_type = input.bikeType;
  if (input.crankLengthMm !== undefined) patch.crank_length_mm = input.crankLengthMm;
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;

  const { data, error } = await client
    .from("bikes")
    .update(patch)
    .eq("id", bikeId)
    .select("id, profile_id, name, bike_type, crank_length_mm, notes, created_at, updated_at")
    .single<BikeRow>();

  if (error || !data) {
    return { ok: false, error: { code: "UNKNOWN", message: error?.message || "Fehler beim Aktualisieren" } };
  }

  return { ok: true, bike: toBike(data) };
}

/**
 * Löscht ein Rad.
 */
export async function deleteBike(bikeId: string): Promise<Result<{ deletedId: string }>> {
  const client = await getAuthedClient();
  if (!client) return { ok: false, error: { code: "UNKNOWN", message: "Nicht eingeloggt" } };

  const { error } = await client.from("bikes").delete().eq("id", bikeId);

  if (error) {
    return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  }

  return { ok: true, deletedId: bikeId };
}
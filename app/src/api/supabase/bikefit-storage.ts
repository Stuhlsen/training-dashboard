import { supabase, getAuthedClient } from "./client";
import type { Result } from "../types";

const BUCKET_NAME = "bikefit-photos";
const NOT_CONFIGURED = { code: "UNKNOWN" as const, message: "Supabase nicht konfiguriert" };

/**
 * Lädt ein Foto (Legs oder Riding) für eine Fitting-Iteration in den privaten Storage-Bucket.
 * Pfad-Konvention: "{profileId}/{fittingId}/{sequence}_{photoType}.{ext}"
 */
export async function uploadBikefitPhoto(
  profileId: string,
  fittingId: string,
  sequence: number,
  photoType: "legs" | "riding",
  file: File
): Promise<Result<{ path: string }>> {
  const client = await getAuthedClient();
  if (!client) return { ok: false, error: { code: "UNKNOWN", message: "Nicht eingeloggt" } };

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${profileId}/${fittingId}/${sequence}_${photoType}.${ext}`;

  const { error } = await client.storage
    .from(BUCKET_NAME)
    .upload(path, file, { upsert: true });

  if (error) {
    return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  }

  return { ok: true, path };
}

/**
 * Erzeugt eine zeitlich begrenzte signierte URL für ein Foto im privaten Storage-Bucket.
 */
export async function createSignedPhotoUrl(
  path: string,
  expiresInSeconds = 3600
): Promise<Result<{ signedUrl: string }>> {
  const client = (await getAuthedClient()) ?? supabase;
  if (!client) return { ok: false, error: NOT_CONFIGURED };

  const { data, error } = await client.storage
    .from(BUCKET_NAME)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    return { ok: false, error: { code: "UNKNOWN", message: error?.message || "Konnte signierte URL nicht erstellen" } };
  }

  return { ok: true, signedUrl: data.signedUrl };
}

/**
 * Löscht Fotos aus dem Storage Bucket (z. B. beim Abschließen eines Fittings).
 */
export async function deleteBikefitPhotos(paths: string[]): Promise<Result<{ deleted: boolean }>> {
  if (paths.length === 0) return { ok: true, deleted: true };

  const client = await getAuthedClient();
  if (!client) return { ok: false, error: { code: "UNKNOWN", message: "Nicht eingeloggt" } };

  const { error } = await client.storage.from(BUCKET_NAME).remove(paths);
  if (error) {
    return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  }

  return { ok: true, deleted: true };
}
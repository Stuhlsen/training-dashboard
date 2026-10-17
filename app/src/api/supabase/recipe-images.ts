/* ============================================================
   API/SUPABASE/RECIPE-IMAGES.TS — eigenes Rezeptfoto in den Bucket
   (Fahrplan 25, S2a; Bucket `recipe-images`, Migration 0065)

   Der Client lädt direkt hoch, der Pfad MUSS `<JWT-sub>/<datei>` sein —
   die Storage-RLS und der Server (checkImagePath) prüfen genau das.
   ============================================================ */

import { supabase, getAuthedClient } from "./client";
import type { Result } from "../types";

const BUCKET = "recipe-images";

/** Lädt ein (schon verkleinertes) WebP hoch; liefert den Pfad für `image_url`. */
export async function uploadRecipePhoto(photo: Blob): Promise<Result<{ path: string }>> {
  if (!supabase) return { ok: false, error: { code: "UNKNOWN", message: "Supabase nicht konfiguriert" } };

  const { data } = await supabase.auth.getSession();
  const sub = data.session?.user.id;
  const client = await getAuthedClient();
  if (!sub || !client) return { ok: false, error: { code: "TOKEN_INVALID", message: "Nicht eingeloggt" } };

  const path = `${sub}/${crypto.randomUUID()}.webp`;
  const { error } = await client.storage.from(BUCKET).upload(path, photo, {
    contentType: "image/webp",
    upsert: false,
  });
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, path };
}

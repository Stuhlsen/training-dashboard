/* ============================================================
   SCRIPTS/LIB/SYNC-PROFILES.JS — welche Profile ein eigenes Sync-Verhalten
   haben (Plan-Vorlage, feste FTP, Plan-1-Historie).

   Fahrplan 26 E5: Dateien (rides*.json) gibt es nicht mehr, alle Accounts
   landen in den Tabellen training_*. Geblieben ist nur das VERHALTEN, das
   an vier Profilen hängt (athlete1 = eigener Pfad in generate-data.js,
   athlete2–4 = Eintrag in athletes.js). Der Schlüssel dafür ist der
   Anzeigename (profiles.display_name) — ein Spiegel von
   app/src/config.ts::ATHLETES[].name, bei einem neuen Sonderfall BEIDE
   Stellen pflegen. Keine Klarnamen, nur die selbstgewählten Pseudonyme.

   Lookup case-insensitiv + getrimmt: display_name ist in Settings
   editierbar, ein Tippfehler in Groß/Kleinschreibung darf einen Athleten
   nicht aus dem Sync fallen lassen.
   ============================================================ */

const SYNC_PROFILE_SLUGS = {
  Stuhlsen: "athlete1",
  hc_diZee: "athlete2",
  Hendrik: "athlete3",
  bentastiic: "athlete4",
};

const SLUG_BY_LC = new Map(
  Object.entries(SYNC_PROFILE_SLUGS).map(([name, slug]) => [name.trim().toLowerCase(), slug]),
);
const SPECIAL_SLUGS = new Set(Object.values(SYNC_PROFILE_SLUGS));

/** display_name → Slug des Profils mit eigenem Sync-Verhalten, sonst `undefined`. */
export function slugForName(displayName) {
  if (!displayName) return undefined;
  return SLUG_BY_LC.get(displayName.trim().toLowerCase());
}

/** Hat dieser Schlüssel (aus loadSyncConfig) ein eigenes Sync-Verhalten? */
export function hasOwnSyncBehavior(key) {
  return SPECIAL_SLUGS.has(key);
}

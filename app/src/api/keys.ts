/** Zentrale Query-Key-Fabrik (Etappe 2b).
 *
 *  Der Grund, warum das an EINER Stelle steht: die Keys tragen die
 *  `athleteId`, und genau das ersetzt den `loadedForAthleteId`-/requestGuard-
 *  Apparat der alten `state/*.js`-Module. Dort musste jede Antwort selbst
 *  prüfen, ob sie noch zum aktuell angezeigten Athleten gehört (sonst schrieb
 *  eine überholte Antwort fremde Daten in den geteilten Modul-State). Mit
 *  keyed Queries kann das strukturell nicht mehr passieren — eine Antwort
 *  landet immer nur unter ihrem eigenen Key.
 *
 *  Voraussetzung dafür ist, dass niemand Keys ad hoc zusammensetzt: ein
 *  getipptes `["planCards", id]` neben einem `["plan-cards", id]` wären zwei
 *  Caches derselben Daten. Deshalb ausschließlich über diese Fabrik. */
export const qk = {
  /** athleteId ("athlete1"/"athlete2") → Supabase-Profil-UUID */
  athleteProfileId: (athleteId: string) => ["athlete-profile-id", athleteId] as const,
  /** Profil des eingeloggten Users (Session-gebunden, nicht Toggle-gebunden) */
  profile: (userId: string) => ["profile", userId] as const,

  planCards: (athleteId: string) => ["plan-cards", athleteId] as const,
  events: (athleteId: string) => ["events", athleteId] as const,
  proposals: (athleteId: string) => ["proposals", athleteId] as const,

  /** Check-in des EINGELOGGTEN Users — hängt an der auth.uid(), nicht am
   *  Athleten-Toggle (s. state/wellbeing.js: der Toggle betrifft ihn
   *  bewusst nicht). */
  wellbeingRange: (userId: string, fromIso: string, toIso: string) =>
    ["wellbeing", userId, fromIso, toIso] as const,
  /** Freigegebener Check-in eines BELIEBIGEN Athleten (öffentliche View) */
  wellbeingShared: (athleteId: string, isoDate: string) =>
    ["wellbeing-shared", athleteId, isoDate] as const,

  /** Darf der eingeloggte User für diesen Athleten schreiben? Hängt an
   *  beiden Seiten — Session-Wechsel und Toggle-Wechsel müssen je einen
   *  eigenen Eintrag ergeben. */
  writeAuthorization: (userId: string | null, athleteId: string) =>
    ["write-authorization", userId, athleteId] as const,

  /** JSON-Pipeline (5.5): die per Cron erzeugten data/*.json */
  rides: (athleteId: string) => ["rides", athleteId] as const,
} as const;

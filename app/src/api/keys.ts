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
  /** plan_offset_weeks (Migration 0026) des betrachteten Athleten — mit
   *  Viewer-UID, weil der Wert autorisierungsabhängig ist (Nicht-Coach → 0). */
  athletePlanOffset: (userId: string, athleteId: string) =>
    ["athlete-plan-offset", userId, athleteId] as const,
  /** Profil des eingeloggten Users (Session-gebunden, nicht Toggle-gebunden) */
  profile: (userId: string) => ["profile", userId] as const,

  planCards: (athleteId: string) => ["plan-cards", athleteId] as const,
  /** Aktive training_plans-Zeile des betrachteten Athleten (Fahrplan 8 E6/E7).
   *  athletenscharf wie planCards — eine Antwort kann nicht im Cache eines
   *  anderen Athleten landen. */
  activeTrainingPlan: (athleteId: string) => ["active-training-plan", athleteId] as const,
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

  /** Ist der eingeloggte User der Trainer DIESES Athleten (+ dessen
   *  Supabase-Profil-UUID für trainer_view_prefs)? Etappe 7a. */
  trainerContext: (userId: string | null, athleteId: string) =>
    ["trainer-context", userId, athleteId] as const,
  /** Kacheln-Auswahl der Trainer-Leiste, pro Trainer-Athlet-Paar. */
  trainerViewPrefs: (trainerId: string, athleteProfileId: string) =>
    ["trainer-view-prefs", trainerId, athleteProfileId] as const,

  /** JSON-Pipeline (5.5): die per Cron erzeugten data/*.json */
  rides: (athleteId: string) => ["rides", athleteId] as const,

  /** Export-Richtungsvorgabe (Etappe 7c) — Preset+Zielevent, ein Eintrag pro
   *  eingeloggtem Profil. */
  exportPrefs: (profileId: string) => ["export-prefs", profileId] as const,
  /** Leiterzustand (aktive Formate × Stufe × Nachbarn) des eingeloggten
   *  Profils, für die Export-Panel-Zeile und das Briefing-Gedächtnis. */
  ladderState: (profileId: string) => ["ladder-state", profileId] as const,
  /** FTP-Historie des eingeloggten Profils. */
  ftpHistory: (profileId: string) => ["ftp-history", profileId] as const,
  /** Aktive Ziele des eingeloggten Profils (Settings, Etappe 9). */
  goals: (profileId: string) => ["goals", profileId] as const,
  /** Formatkatalog + Aktiv-Status des eingeloggten Profils (Settings,
   *  Etappe 9) — anders als qk.ladderState() der VOLLE Katalog, nicht nur
   *  die aktiven Formate. */
  athleteFormats: (profileId: string) => ["athlete-formats", profileId] as const,
  /** Blockstart-Dialog-Erkennung (E2) — hängt zusätzlich an einem
   *  Cards-Fingerprint, weil ein Kartenwechsel (Verschieben/Anlegen) das
   *  Blockziel verschieben kann, ohne dass sich profileId/athleteId ändern. */
  blockTransition: (profileId: string, cardsFingerprint: string) =>
    ["block-transition", profileId, cardsFingerprint] as const,

  /** intervals.icu-Zugangsdaten des eingeloggten Users (Wahoo-Push +
   *  Streams-Abruf, Migration 0019). */
  intervalsCredentials: (userId: string) => ["intervals-credentials", userId] as const,
  /** Grober Standort des eingeloggten Users für die Sync-Wettervorschau
   *  (Tabelle athlete_sync_config, Migration 0023, Fahrplan 7 CRED2). */
  syncLocation: (userId: string) => ["sync-location", userId] as const,
  /** Sekunden-Rohdaten (Watt/Puls) einer einzelnen intervals.icu-Aktivität —
   *  ändert sich nach Abschluss der Fahrt nie mehr (s. useActivityStreams). */
  activityStreams: (activityId: string) => ["activity-streams", activityId] as const,

  /** Anzeigename des verknüpften Trainers (Settings, Bereich "Daten") —
   *  gehört NICHT an qk.profile(), weil coachId ein anderes Profil betrifft
   *  als das gerade geladene. */
  coachName: (coachId: string) => ["coach-name", coachId] as const,
  /** Account-Löschantrag des eingeloggten Profils (Settings, Bereich
   *  "Datenschutz & Account"), Migration 0021. */
  accountDeletionRequest: (userId: string) => ["account-deletion-request", userId] as const,
  /** Zwei-Faktor-Faktoren (Supabase Auth MFA) des eingeloggten Users. */
  mfaFactors: (userId: string) => ["mfa-factors", userId] as const,
} as const;

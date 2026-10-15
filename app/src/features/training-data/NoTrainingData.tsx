import { GlassCard } from "../../components/GlassCard";

export const NO_TRAINING_DATA_TEXT = "Für dein Profil sind noch keine Trainingsdaten angebunden.";

/** Leer-Hinweis für Seiten, die Trainingsdaten aus `rides*.json` brauchen
 *  (Hero, Fahrtenbuch, Analyse), wenn der aktive Eintrag keine Datei hat —
 *  Accounts ohne Platz in `config.ts`. Bewusst nur Text, kein Link: ein
 *  Sync pro Account ist ein eigenes Vorhaben. */
export function NoTrainingData() {
  return (
    <GlassCard style={{ maxWidth: 560, margin: "32px auto", padding: "24px 28px" }}>
      <p role="status" style={{ margin: 0, color: "var(--ink-2)", fontSize: ".95rem", lineHeight: 1.5 }}>
        {NO_TRAINING_DATA_TEXT}
      </p>
    </GlassCard>
  );
}

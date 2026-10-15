import type { ReactNode } from "react";
import { useActiveAthlete } from "../../api/hooks/useActiveAthlete";
import { athleteConfig } from "../../config";
import { NoTrainingData } from "./NoTrainingData";

/** Schaltet vor Seiten, die ohne `rides*.json` nichts zu zeigen haben (Hero,
 *  Fahrtenbuch, Analyse): hat der aktive Eintrag keinen Platz in `config.ts`
 *  (eigener Eintrag eines Accounts ohne Platz), steht statt der Seite der
 *  Leer-Hinweis. Planung, Events, Ernährung, Bike-Fit und Einstellungen
 *  laufen über Supabase und bleiben unberührt. */
export function TrainingDataGate({ children }: { children: ReactNode }) {
  const { activeAthleteId } = useActiveAthlete();
  if (!athleteConfig(activeAthleteId)) return <NoTrainingData />;
  return <>{children}</>;
}

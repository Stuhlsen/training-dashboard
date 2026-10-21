import type { ReactNode } from "react";
import { useActiveAthlete } from "../../api/hooks/useActiveAthlete";
import { useIntervalsCredentials } from "../../api/hooks/useIntervalsCredentials";
import { useRides } from "../../api/hooks/useRides";
import { useIsSelfAthlete } from "../../api/hooks/useWriteAuthorization";
import { toResultError } from "../../api/result";
import { athleteConfig } from "../../config";
import { GlassCard } from "../../components/GlassCard";
import { NoTrainingData } from "./NoTrainingData";
import { pickNoDataReason } from "./no-data-reason";

/** Schaltet vor Seiten, die Trainingsdaten brauchen (Hero, Fahrtenbuch,
 *  Analyse). Ein Platz aus `config.ts` liest weiter seine Datei und kommt
 *  ohne Prüfung durch. Jeder andere Eintrag (Account ohne Platz) liest über
 *  die Profil-UUID die Tabellen (Fahrplan 26 E3):
 *  - lädt noch → Hinweis „Lädt …"
 *  - Lesefehler → Fehlermeldung (kein Leerzustand)
 *  - Tabellen leer → Leer-Hinweis; beim eigenen Profil mit Weg in die
 *    Einstellungen (Zugangsdaten fehlen) oder „nach dem nächsten Sync" (E4)
 *  - sonst die Seite.
 *  Planung, Events, Ernährung, Bike-Fit und Einstellungen laufen über
 *  Supabase und bleiben unberührt. */
export function TrainingDataGate({ children }: { children: ReactNode }) {
  const { activeAthleteId } = useActiveAthlete();
  // Dieselbe Query wie die Seite darunter (gleicher Key) — kein zweiter Abruf.
  const { data, isLoading, error } = useRides(activeAthleteId);
  if (athleteConfig(activeAthleteId)) return <>{children}</>;
  if (isLoading) return <GateMessage>Lädt …</GateMessage>;
  if (error) {
    return (
      <GateMessage role="alert">
        Trainingsdaten konnten nicht geladen werden: {toResultError(error).message}
      </GateMessage>
    );
  }
  if (!data || data.trainingDataEmpty) return <EmptyHint athleteId={activeAthleteId} />;
  return <>{children}</>;
}

/** Eigene Komponente, damit die Zugangsdaten nur im Leerfall geladen werden
 *  (nicht für jeden Seitenaufruf, auch nicht für Bestandsathleten). */
function EmptyHint({ athleteId }: { athleteId: string }) {
  const { isSelf } = useIsSelfAthlete(athleteId);
  const { credentials, isLoading: credentialsLoading } = useIntervalsCredentials();
  const reason = pickNoDataReason({ isSelf, credentialsLoading, hasCredentials: credentials !== null });
  return <NoTrainingData reason={reason} />;
}

function GateMessage({ children, role = "status" }: { children: ReactNode; role?: "status" | "alert" }) {
  return (
    <GlassCard style={{ maxWidth: 560, margin: "32px auto", padding: "24px 28px" }}>
      <p role={role} style={{ margin: 0, color: "var(--ink-2)", fontSize: ".95rem", lineHeight: 1.5 }}>
        {children}
      </p>
    </GlassCard>
  );
}

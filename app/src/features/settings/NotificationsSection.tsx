import { ComingSoonNote } from "./ComingSoonNote";

/** Rein statisch — es gibt im Projekt keine E-Mail-Versand-Infrastruktur
 *  (kein SMTP/Provider, kein Edge-Function-Cron außer dem 6h-Datensync).
 *  Eine Präferenz-Spalte ohne Konsument wäre ein Halbfertig-Feature. */
export function NotificationsSection() {
  return (
    <ComingSoonNote
      heading="Benachrichtigungen"
      body="E-Mail-Hinweise (z. B. bei erreichtem Ziel oder als Check-in-Erinnerung) sind geplant, brauchen aber noch einen E-Mail-Versand, den es im Projekt bisher nicht gibt."
    />
  );
}

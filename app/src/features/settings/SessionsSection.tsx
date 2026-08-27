import { ComingSoonNote } from "./ComingSoonNote";

/** Rein statisch — eine Liste eigener aktiver Sitzungen/Geräte bräuchte die
 *  Supabase Admin-API (service_role), die nie clientseitig laufen darf. */
export function SessionsSection() {
  return (
    <ComingSoonNote
      heading="Aktive Sitzungen"
      body="Eine Übersicht angemeldeter Geräte ist geplant, braucht aber Zugriff, der aus Sicherheitsgründen nicht direkt im Browser laufen darf."
    />
  );
}

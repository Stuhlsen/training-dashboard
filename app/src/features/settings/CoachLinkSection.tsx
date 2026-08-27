import { useSessionProfile } from "../../api/hooks/useSession";
import { useCoachName } from "../../api/hooks/useCoachName";
import { HEADING_STYLE, SECTION_STYLE } from "./section-styles";

/** Read-only — KEIN "Trainer verknüpfen"-Button. Eine Verknüpfungs-Aktion
 *  bräuchte einen eigenen Einladungs-/Bestätigungsablauf (Coach muss
 *  zustimmen), das ist hier bewusst nicht gebaut. Ein deaktivierter Button
 *  würde eine Funktion versprechen, die es nicht gibt — deshalb reiner
 *  Fließtext statt <button disabled>. */
export function CoachLinkSection() {
  const profile = useSessionProfile();
  const { name, isLoading } = useCoachName(profile?.coachId);

  if (!profile) return null;

  return (
    <div style={SECTION_STYLE}>
      <div style={HEADING_STYLE}>Trainer-Verknüpfung</div>
      <p style={{ fontFamily: "var(--font-body)", fontSize: ".8rem", color: "var(--ink)", margin: "0 0 8px" }}>
        {profile.coachId
          ? isLoading
            ? "Lädt …"
            : `Verknüpft mit: ${name ?? "unbekannt"}`
          : "Kein Trainer verknüpft"}
      </p>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: ".62rem", color: "var(--ink-3)", margin: 0 }}>
        Trainer-Verknüpfung erfolgt aktuell nur serverseitig.
      </p>
    </div>
  );
}

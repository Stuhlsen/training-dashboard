import { useIsSelfAthlete } from "../../api/hooks/useWriteAuthorization";
import { useProposals } from "../../api/hooks/useProposals";

/** Athleten-Banner für offene Vorschläge — Port von ui/proposal-banner.js
 *  (Etappe 7b). Einziger Einstieg, über den der Athlet selbst tatsächlich
 *  annehmen/ablehnen kann (RLS "proposals: Athlet entscheidet" erlaubt das
 *  nur ihm) — die Trainer-Leiste zeigt den Zähler nur zur Information. */
export function ProposalBanner({ athleteId, onOpen }: { athleteId: string; onOpen: () => void }) {
  const { isSelf } = useIsSelfAthlete(athleteId);
  const { data: proposalsData } = useProposals(athleteId, { enabled: isSelf });

  if (!isSelf) return null;
  const openCount = (proposalsData ?? []).filter((p) => p.status === "open").length;
  if (!openCount) return null;

  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 2,
        padding: "12px 16px",
        borderRadius: "var(--radius-sm)",
        background: "rgba(224,138,60,.08)",
        border: "1px solid rgba(224,138,60,.3)",
        color: "var(--ink)",
        font: "inherit",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <span style={{ fontSize: ".88rem", fontWeight: 600 }}>
        {openCount} Vorschlag{openCount === 1 ? "" : "e"} offen
      </span>
      <span style={{ fontSize: ".76rem", color: "var(--ink-3)" }}>
        von deinem Trainer oder Claude — klicken zum Prüfen
      </span>
    </button>
  );
}

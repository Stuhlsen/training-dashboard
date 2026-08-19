import { useState } from "react";
import { GlassCard } from "../../components/GlassCard";
import { useIsSelfAthlete } from "../../api/hooks/useWriteAuthorization";
import { useAcceptGroup, useAcceptProposal, useProposals } from "../../api/hooks/useProposals";
import { usePlanCards } from "../../api/hooks/usePlanCards";
import { useRides } from "../../api/hooks/useRides";
import { useEvents } from "../../api/hooks/useEvents";
import { localISODate } from "../../core/format.js";
import { groupOpenProposals } from "../../core/proposal-groups.js";
import { resolvePlanningFtp } from "./planning-view-model";
import { describeProposal, impactSummary } from "./proposal-review-view-model";
import type { Proposal } from "../../api/types";

type Ride = import("../../types.js").Ride;

const TODAY = localISODate();

const ROW_BTN_STYLE: React.CSSProperties = {
  border: "1px solid var(--hair)",
  borderRadius: "var(--pill)",
  padding: "6px 12px",
  background: "transparent",
  color: "var(--ink-2)",
  font: "inherit",
  fontSize: ".76rem",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const ACCEPT_BTN_STYLE: React.CSSProperties = {
  ...ROW_BTN_STYLE,
  background: "var(--ss)",
  borderColor: "var(--ss)",
  color: "#17110a",
  fontWeight: 600,
};

/** Vorschlagsliste — Port von ui/proposal-list.js (Etappe 7b). Gruppen
 *  (`group_id`, z. B. ein Claude-Import) erscheinen mit "Alle übernehmen",
 *  ungruppierte Vorschläge einzeln. Athlet: Vergleichen/Übernehmen; Trainer
 *  (nur zur Kontrolle, RLS erlaubt Entscheiden nur dem Athleten selbst):
 *  read-only "Ansehen…". */
export function ProposalList({
  athleteId,
  onClose,
  onCompare,
}: {
  athleteId: string;
  onClose: () => void;
  onCompare: (proposal: Proposal) => void;
}) {
  const { isSelf } = useIsSelfAthlete(athleteId);
  const { data: proposalsData } = useProposals(athleteId);
  const { data: cards } = usePlanCards(athleteId);
  const { data: rideData } = useRides(athleteId);
  const { data: events } = useEvents(athleteId);
  const { accept } = useAcceptProposal(athleteId);
  const { acceptGroup } = useAcceptGroup(athleteId);

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const proposals = proposalsData ?? [];
  const groups = groupOpenProposals(proposals);
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const ftp = resolvePlanningFtp(athleteId, rideData?.athleteFtp ?? null);
  const rides = (rideData?.rides as Ride[] | undefined) ?? [];
  const ctx = { cards: cards ?? [], rides, events: events ?? [], ftp, today: TODAY };

  async function handleAccept(p: Proposal) {
    setPendingId(p.id);
    setError("");
    const result = await accept(p);
    setPendingId(null);
    if (!result.ok) setError(result.error?.message || "Vorschlag konnte nicht übernommen werden.");
  }

  async function handleAcceptGroup(groupId: string) {
    setPendingId(groupId);
    setError("");
    const result = await acceptGroup(groupId);
    setPendingId(null);
    if (!result.ok) {
      const firstFailed = result.failed[0]?.result;
      const firstMessage = firstFailed && !firstFailed.ok ? firstFailed.error?.message : undefined;
      setError(
        `${result.failed.length} von ${result.results.length} Vorschlägen konnten nicht übernommen werden${firstMessage ? `: ${firstMessage}` : "."}`,
      );
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(7,9,14,.75)",
        backdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <GlassCard
        variant="strong"
        radius="22px"
        style={{ width: "100%", maxWidth: 560, maxHeight: "85vh", overflowY: "auto", padding: "26px 24px" }}
      >
        <div style={{ fontFamily: "var(--font-disp)", fontWeight: 700, fontSize: "1rem", color: "var(--ink)" }}>
          {total} Vorschläge offen
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
          {!groups.length && <p style={{ color: "var(--ink-3)", fontSize: ".84rem" }}>Keine offenen Vorschläge.</p>}

          {groups.map((g) => (
            <div key={g.groupId ?? g.items[0].id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {g.groupId && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span aria-hidden="true">{g.items[0].source === "claude" ? "⚡" : "🧑‍🏫"}</span>
                  <span style={{ fontSize: ".78rem", color: "var(--ink-3)", flex: 1 }}>
                    Vorschlagsrunde · {g.items[0].source === "claude" ? "Claude" : "Trainer"} · {g.items.length} Vorschläge
                  </span>
                  {isSelf && (
                    <button
                      type="button"
                      style={ACCEPT_BTN_STYLE}
                      disabled={pendingId === g.groupId}
                      onClick={() => void handleAcceptGroup(g.groupId!)}
                    >
                      {pendingId === g.groupId ? "⏳…" : "Alle übernehmen"}
                    </button>
                  )}
                </div>
              )}
              {g.items.map((p) => {
                const impact = impactSummary(p, ctx);
                return (
                  <div
                    key={p.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      borderRadius: "var(--radius-sm)",
                      background: "rgba(255,255,255,.03)",
                      border: "1px solid var(--hair)",
                    }}
                  >
                    {!g.groupId && <span aria-hidden="true">{p.source === "claude" ? "⚡" : "🧑‍🏫"}</span>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: ".86rem", color: "var(--ink)" }}>{describeProposal(p, cards ?? [])}</div>
                      <div style={{ fontSize: ".72rem", color: "var(--ink-3)" }}>
                        {p.op}
                        {impact ? ` · ${impact}` : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button type="button" style={ROW_BTN_STYLE} onClick={() => onCompare(p)}>
                        {isSelf ? "Vergleichen…" : "Ansehen…"}
                      </button>
                      {isSelf && (
                        <button
                          type="button"
                          style={ACCEPT_BTN_STYLE}
                          disabled={pendingId === p.id}
                          onClick={() => void handleAccept(p)}
                        >
                          {pendingId === p.id ? "⏳…" : "Übernehmen"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {error && <div style={{ color: "var(--danger)", fontSize: ".78rem", marginTop: 12 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
          <button type="button" style={ROW_BTN_STYLE} onClick={onClose}>
            Schließen
          </button>
        </div>
      </GlassCard>
    </div>
  );
}

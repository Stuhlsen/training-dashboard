import { useState } from "react";
import { GlassCard } from "../../components/GlassCard";
import { useIsSelfAthlete } from "../../api/hooks/useWriteAuthorization";
import { useAcceptProposal, useRejectProposal, useWithdrawProposal } from "../../api/hooks/useProposals";
import { usePlanCards } from "../../api/hooks/usePlanCards";
import { useRides } from "../../api/hooks/useRides";
import { useEvents } from "../../api/hooks/useEvents";
import { localISODate, fmtDate, fmtDateFull } from "../../core/format.js";
import { resolvePlanningFtp } from "./planning-view-model";
import { asWorkoutBlocks } from "./planning-view-model";
import { impactDetail, sidesFor, type CompareCardData } from "./proposal-review-view-model";
import type { Proposal } from "../../api/types";

type Ride = import("../../types.js").Ride;

const TODAY = localISODate();

const FOOTER_BTN_STYLE: React.CSSProperties = {
  border: "1px solid var(--hair)",
  borderRadius: "var(--pill)",
  padding: "9px 16px",
  background: "transparent",
  color: "var(--ink-2)",
  font: "inherit",
  fontSize: ".82rem",
  cursor: "pointer",
};

const ACCEPT_BTN_STYLE: React.CSSProperties = {
  ...FOOTER_BTN_STYLE,
  background: "var(--ss)",
  borderColor: "var(--ss)",
  color: "#17110a",
  fontWeight: 600,
};

function badgeColor(severity: "info" | "warning" | "resolved"): string {
  if (severity === "resolved") return "var(--ok)";
  return severity === "warning" ? "var(--danger)" : "var(--warn)";
}

function Card({ data, accent, changed }: { data: CompareCardData | null; accent?: boolean; changed?: string[] }) {
  if (!data) {
    return (
      <div style={{ padding: "12px 14px", borderRadius: "var(--radius-sm)", border: "1px dashed var(--hair)", color: "var(--ink-3)", fontSize: ".82rem" }}>
        –
      </div>
    );
  }
  const mark = (f: string) => (accent && changed?.includes(f) ? "var(--ss)" : "var(--ink)");
  const blocks = asWorkoutBlocks(data.workout);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "12px 14px",
        borderRadius: "var(--radius-sm)",
        background: "rgba(255,255,255,.03)",
        border: accent ? "1px solid var(--ss)" : "1px solid var(--hair)",
      }}
    >
      <div style={{ fontSize: ".9rem", fontWeight: 600, color: mark("name") }}>{data.name || "–"}</div>
      <div style={{ display: "flex", gap: 10, fontSize: ".76rem" }}>
        <span style={{ color: mark("date") }}>{data.date ? fmtDate(data.date) : "–"}</span>
        <span style={{ color: mark("typ") }}>{data.typ || "–"}</span>
      </div>
      {data.tssPlanned != null && <div style={{ fontSize: ".76rem", color: mark("tssPlanned") }}>{data.tssPlanned} TSS</div>}
      {blocks && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {blocks.blocks.map((b, i) => (
            <span
              key={i}
              style={{
                fontSize: ".68rem",
                padding: "2px 8px",
                borderRadius: "var(--pill)",
                background: "rgba(255,255,255,.06)",
                color: "var(--ink-2)",
              }}
            >
              {b.text}
            </span>
          ))}
        </div>
      )}
      {data.cancelled && <div style={{ fontSize: ".76rem", color: "var(--danger)" }}>❌ Ausgefallen</div>}
    </div>
  );
}

/** Vergleichsansicht — Port von ui/proposal-compare.js (Etappe 7b). Aktuell/
 *  Vorgeschlagen nebeneinander, geänderte Felder akzentuiert, darunter TSB-
 *  Delta am Eventtag + gelöste/neu eingeführte Konflikt-Badges
 *  (core/proposal-preview.js). Annehmen/Ablehnen nur für den Athleten selbst
 *  (RLS "proposals: Athlet entscheidet") — der Trainer sieht nur zur
 *  Kontrolle, ein eigener (per Claude importierter) Vorschlag lässt sich
 *  "zurückziehen" statt "ablehnen". */
export function ProposalCompare({
  athleteId,
  proposal,
  onClose,
}: {
  athleteId: string;
  proposal: Proposal;
  onClose: () => void;
}) {
  const { isSelf } = useIsSelfAthlete(athleteId);
  const { data: cards } = usePlanCards(athleteId);
  const { data: rideData } = useRides(athleteId);
  const { data: events } = useEvents(athleteId);
  const { accept } = useAcceptProposal(athleteId);
  const { reject } = useRejectProposal(athleteId);
  const { withdraw } = useWithdrawProposal(athleteId);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const ftp = resolvePlanningFtp(athleteId, rideData?.athleteFtp ?? null);
  const rides = (rideData?.rides as Ride[] | undefined) ?? [];
  const ctx = { cards: cards ?? [], rides, events: events ?? [], ftp, today: TODAY };
  const { left, right, changed } = sidesFor(proposal, cards ?? []);
  const detail = impactDetail(proposal, ctx);
  const isOwn = proposal.source === "claude";

  async function handleAccept() {
    setPending(true);
    setError("");
    const result = await accept(proposal);
    setPending(false);
    if (!result.ok) {
      setError(result.error?.message || "Vorschlag konnte nicht übernommen werden.");
      return;
    }
    onClose();
  }

  async function handleReject() {
    setPending(true);
    setError("");
    const result = isOwn ? await withdraw(proposal.id) : await reject(proposal.id);
    setPending(false);
    if (!result.ok) {
      setError(result.error?.message || (isOwn ? "Zurückziehen fehlgeschlagen." : "Ablehnen fehlgeschlagen."));
      return;
    }
    onClose();
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(7,9,14,.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <GlassCard
        variant="strong"
        radius="22px"
        style={{ width: "100%", maxWidth: 620, maxHeight: "90vh", overflowY: "auto", padding: "26px 24px" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".84rem", color: "var(--ink-2)" }}>
          <span aria-hidden="true">{proposal.source === "claude" ? "⚡" : "🧑‍🏫"}</span>
          <span>
            Vorschlag von {proposal.source === "claude" ? "Claude" : "Trainer"} · {proposal.createdAt.slice(0, 10)}
          </span>
          {proposal.groupId && <span style={{ color: "var(--ink-3)" }}>· Teil einer Vorschlagsrunde</span>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: ".7rem", textTransform: "uppercase", letterSpacing: ".05em", color: "var(--ink-3)" }}>
              Aktuell
            </span>
            <Card data={left} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: ".7rem", textTransform: "uppercase", letterSpacing: ".05em", color: "var(--ink-3)" }}>
              Vorgeschlagen
            </span>
            <Card data={right} accent changed={changed} />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
          {proposal.reason && <div style={{ fontSize: ".82rem", color: "var(--ink-2)" }}>{proposal.reason}</div>}
          {detail.tsb && (
            <div style={{ fontSize: ".82rem", color: "var(--ink-2)" }}>
              TSB am Eventtag ({detail.tsb.eventTitle}, {fmtDateFull(detail.tsb.eventDate)}):{" "}
              {Math.round(detail.tsb.before)} → {Math.round(detail.tsb.after)}
            </div>
          )}
          {(detail.resolved.length > 0 || detail.introduced.length > 0) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {detail.resolved.map((c, i) => (
                <span
                  key={`resolved-${i}`}
                  style={{
                    fontSize: ".72rem",
                    borderRadius: "var(--pill)",
                    padding: "4px 12px",
                    border: `1px solid ${badgeColor("resolved")}`,
                    color: badgeColor("resolved"),
                  }}
                >
                  ✓ löst {c.rule}: {c.message}
                </span>
              ))}
              {detail.introduced.map((c, i) => (
                <span
                  key={`introduced-${i}`}
                  style={{
                    fontSize: ".72rem",
                    borderRadius: "var(--pill)",
                    padding: "4px 12px",
                    border: `1px solid ${badgeColor(c.severity)}`,
                    color: badgeColor(c.severity),
                  }}
                >
                  {c.message}
                </span>
              ))}
            </div>
          )}
        </div>

        {error && <div style={{ color: "var(--danger)", fontSize: ".78rem", marginTop: 12 }}>{error}</div>}

        {!isSelf && (
          <p style={{ fontSize: ".76rem", color: "var(--ink-3)", marginTop: 16 }}>
            Nur der Athlet selbst kann Vorschläge annehmen oder ablehnen — diese Ansicht ist hier nur zur Kontrolle.
          </p>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          {isSelf ? (
            <>
              <button type="button" style={FOOTER_BTN_STYLE} disabled={pending} onClick={() => void handleReject()}>
                {pending ? "⏳…" : isOwn ? "Zurückziehen" : "Aktuelle behalten"}
              </button>
              <button type="button" style={ACCEPT_BTN_STYLE} disabled={pending} onClick={() => void handleAccept()}>
                {pending ? "⏳ Übernehmen…" : "Vorschlag übernehmen"}
              </button>
            </>
          ) : (
            <button type="button" style={FOOTER_BTN_STYLE} onClick={onClose}>
              Schließen
            </button>
          )}
        </div>
      </GlassCard>
    </div>
  );
}

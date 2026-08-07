import { useState } from "react";
import { AthleteToggle } from "../../components/AthleteToggle";
import { GlassCard } from "../../components/GlassCard";
import { PRIMARY_ATHLETE_ID, phaseColor } from "../../config";
import { useActiveAthlete } from "../../api/hooks/useActiveAthlete";
import { useCanWriteForAthlete } from "../../api/hooks/useWriteAuthorization";
import { useRides } from "../../api/hooks/useRides";
import {
  useCancelPlanCard,
  useMovePlanCard,
  usePlanCards,
  useUndoAdjustment,
} from "../../api/hooks/usePlanCards";
import { localISODate } from "../../core/format.js";
import { weekDisplayLabels } from "../../core/week-labels.js";
import { PlanCard } from "./PlanCard";
import { PlanCardForm } from "./PlanCardForm";
import { buildPlanningSections } from "./planning-view-model";
import type { PlanCard as PlanCardT } from "../../api/types";

type Ride = import("../../types.js").Ride;

const TODAY = localISODate();

type DialogState = "closed" | "new" | PlanCardT;

const SECTION_TITLE_STYLE: React.CSSProperties = {
  fontSize: ".7rem",
  letterSpacing: ".14em",
  textTransform: "uppercase",
  color: "var(--ink-3)",
  fontWeight: 600,
};

export function PlanningPage() {
  const { activeAthleteId, setActiveAthleteId } = useActiveAthlete();
  const { data: cards, isLoading, error } = usePlanCards(activeAthleteId);
  const { data: rideData } = useRides(activeAthleteId);
  const { canWrite } = useCanWriteForAthlete(activeAthleteId);

  const { move } = useMovePlanCard(activeAthleteId);
  const { cancel } = useCancelPlanCard(activeAthleteId);
  const { undo } = useUndoAdjustment(activeAthleteId);

  const [dialog, setDialog] = useState<DialogState>("closed");

  const rides = (rideData?.rides as Ride[] | undefined) ?? [];
  const sections = buildPlanningSections(cards ?? [], rides, TODAY);
  const editable = canWrite && activeAthleteId === PRIMARY_ATHLETE_ID;

  const heroTitle = editable ? "Trainingsplan" : "Trainingsplan — Übersicht";
  const heroDesc = editable
    ? "Alle geplanten Trainingseinheiten. Absolvierte Sessions werden automatisch erkannt, sobald die Fahrt erfasst ist."
    : "Alle geplanten Trainingseinheiten im Überblick. Absolvierte Sessions werden automatisch erkannt, sobald die Fahrt erfasst ist.";

  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: "48px 24px", display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontFamily: "var(--font-disp)", fontSize: "1.6rem", fontWeight: 600, color: "var(--ink)" }}>
          Planungstab
        </h1>
        <AthleteToggle activeAthleteId={activeAthleteId} onChange={setActiveAthleteId} />
      </div>

      {isLoading && <p style={{ color: "var(--ink-3)" }}>Lädt …</p>}

      {!isLoading && error && (
        <p style={{ color: "var(--danger)" }}>⚠️ Trainingsplan konnte nicht geladen werden.</p>
      )}

      {!isLoading && !error && !sections.weeks.length && !sections.done.length && (
        <p style={{ color: "var(--ink-3)" }}>Alle geplanten Sessions sind abgeschlossen 🎉</p>
      )}

      {!isLoading && !error && (sections.weeks.length > 0 || sections.done.length > 0) && (
        <>
          <GlassCard variant="soft" style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <h2 style={{ margin: "0 0 4px", fontFamily: "var(--font-disp)", fontSize: "1.15rem", color: "var(--ink)" }}>
                {heroTitle}
              </h2>
              <p style={{ margin: 0, fontSize: ".84rem", color: "var(--ink-3)" }}>{heroDesc}</p>
            </div>

            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              <Stat value={sections.stats.doneCount} label="absolviert" />
              <Stat value={sections.stats.upcomingCount} label="ausstehend" />
              <Stat value={sections.stats.weeksLeft} label="Wochen" />
              <Stat
                value={sections.stats.currentWeekLabel ? weekDisplayLabels([sections.stats.currentWeekLabel])[0] : "–"}
                label="aktuell"
              />
              {sections.stats.cancelledCount > 0 && (
                <Stat value={sections.stats.cancelledCount} label="ausgefallen" color="var(--danger)" />
              )}
              {sections.stats.missedCount > 0 && (
                <Stat value={sections.stats.missedCount} label="verpasst" color="var(--gold)" />
              )}
            </div>

            <div>
              <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${sections.stats.pct}%`, background: "var(--ss)" }} />
              </div>
              <div style={{ marginTop: 6, fontSize: ".76rem", color: "var(--ink-3)" }}>
                {sections.stats.pct}% abgeschlossen · {sections.stats.totalSessions} Sessions gesamt
              </div>
            </div>

            {editable && (
              <button
                type="button"
                onClick={() => setDialog("new")}
                style={{
                  alignSelf: "flex-start",
                  padding: "9px 18px",
                  borderRadius: "var(--pill)",
                  border: "1px solid var(--hair)",
                  background: "transparent",
                  color: "var(--ink)",
                  fontSize: ".84rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                + Karte
              </button>
            )}
          </GlassCard>

          {sections.weeks.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <span style={SECTION_TITLE_STYLE}>📅 Ausstehend — {sections.stats.upcomingCount} Sessions</span>
              {sections.weeks.map((week) => {
                const color = phaseColor(week.phase);
                return (
                  <div key={week.week} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: ".72rem",
                          fontWeight: 600,
                          padding: "3px 10px",
                          borderRadius: "var(--pill)",
                          background: `${color}22`,
                          color,
                          boxShadow: `inset 0 0 0 1px ${color}44`,
                        }}
                      >
                        {weekDisplayLabels([week.week])[0]}
                      </span>
                      <span style={{ fontSize: ".78rem", color: "var(--ink-3)" }}>{week.phase}</span>
                      {week.isRecoveryWeek && (
                        <span style={{ fontSize: ".78rem", color: "var(--accent)" }} title="Erholungswoche (aus den Plankarten erkannt)">
                          🌙 Erholungswoche
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {week.cards.map((card) => (
                        <PlanCard
                          key={card.id}
                          card={card}
                          canEdit={editable}
                          onEdit={() => setDialog(card)}
                          onMove={move}
                          onCancel={cancel}
                          onUndo={undo}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <CardSection
            title={`✅ Absolviert — ${sections.done.length}`}
            cards={sections.done}
            emptyLabel={null}
            editable={editable}
            isDone
            onEdit={setDialog}
            move={move}
            cancel={cancel}
            undo={undo}
          />
          <CardSection
            title={`⚠️ Verpasst — ${sections.missed.length}`}
            cards={sections.missed}
            emptyLabel={null}
            editable={editable}
            onEdit={setDialog}
            move={move}
            cancel={cancel}
            undo={undo}
          />
          <CardSection
            title={`🚫 Ausgefallen — ${sections.cancelled.length}`}
            cards={sections.cancelled}
            emptyLabel={null}
            editable={editable}
            onEdit={setDialog}
            move={move}
            cancel={cancel}
            undo={undo}
          />
        </>
      )}

      {dialog !== "closed" && (
        <PlanCardForm
          athleteId={activeAthleteId}
          editingCard={dialog === "new" ? null : dialog}
          onClose={() => setDialog("closed")}
        />
      )}
    </div>
  );
}

function Stat({ value, label, color }: { value: number | string; label: string; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontFamily: "var(--font-disp)", fontSize: "1.3rem", fontWeight: 600, color: color ?? "var(--ink)" }}>
        {value}
      </span>
      <span style={{ fontSize: ".68rem", color: "var(--ink-3)" }}>{label}</span>
    </div>
  );
}

function CardSection({
  title,
  cards,
  emptyLabel,
  editable,
  isDone,
  onEdit,
  move,
  cancel,
  undo,
}: {
  title: string;
  cards: PlanCardT[];
  emptyLabel: string | null;
  editable: boolean;
  isDone?: boolean;
  onEdit: (card: PlanCardT) => void;
  move: ReturnType<typeof useMovePlanCard>["move"];
  cancel: ReturnType<typeof useCancelPlanCard>["cancel"];
  undo: ReturnType<typeof useUndoAdjustment>["undo"];
}) {
  if (!cards.length && !emptyLabel) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <span style={SECTION_TITLE_STYLE}>{title}</span>
      {!cards.length ? (
        <p style={{ color: "var(--ink-3)", fontSize: ".84rem", margin: 0 }}>{emptyLabel}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {cards.map((card) => (
            <PlanCard
              key={card.id}
              card={card}
              canEdit={editable}
              isDone={isDone}
              onEdit={() => onEdit(card)}
              onMove={move}
              onCancel={cancel}
              onUndo={undo}
            />
          ))}
        </div>
      )}
    </div>
  );
}

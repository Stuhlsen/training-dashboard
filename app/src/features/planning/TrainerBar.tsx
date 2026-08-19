/* ============================================================
   FEATURES/PLANNING/TRAINERBAR.TSX — Trainer-Leiste über dem Planungstab
   (Etappe 7a, Port von assets/js/ui/trainer-bar.js)

   Sichtbar nur, wenn der eingeloggte User der Trainer des gerade
   angezeigten Athleten ist (useTrainerContext) — IMMER frisch aus dem Hook
   gelesen, nie gecacht (Bugfix-Pattern aus dem Vanilla-Original, s. dortiger
   Kommentar: ohne das erschien die Leiste live nachweislich fälschlich beim
   Athleten selbst).

   Governor/TSB-Werte werden bewusst NICHT athletenspezifisch neu erfunden,
   sondern mit derselben Kette wie die Hero-Seite berechnet
   (buildBriefingInfo aus features/hero/hero-view-model.ts), nur gefüttert
   mit den Check-ins DES ATHLETEN (useCheckinRange) statt des eingeloggten
   Trainers (useTodayCheckin wäre hier falsch).

   "Vorschläge"-Kachel öffnet seit Etappe 7b den Review-Dialog
   (ProposalList, in PlanningPage.tsx gerendert) — Annehmen/Ablehnen/
   Vergleichen darf laut RLS ("proposals: Athlet entscheidet") nur der
   Athlet selbst, der Trainer sieht dort nur zur Kontrolle (Port von
   ui/trainer-bar.js::proposalsTile()s Klick-Handler).
   ============================================================ */

import { useState } from "react";
import { GlassCard } from "../../components/GlassCard";
import { useTrainerContext } from "../../api/hooks/useTrainerContext";
import { useTrainerViewPrefs } from "../../api/hooks/useTrainerViewPrefs";
import { useCheckinRange } from "../../api/hooks/useWellbeing";
import { useProposals } from "../../api/hooks/useProposals";
import { useAuthUserId } from "../../api/hooks/useSession";
import { athleteConfig } from "../../config";
import { addDaysISO, localISODate } from "../../core/format.js";
import { getSubjectiveReadiness } from "../../core/readiness.js";
import { currentPmc } from "../../core/pmc.js";
import { projectLoad } from "../../core/projection.js";
import { detectConflicts } from "../../core/conflicts.js";
import { buildBriefingInfo, doneDatesOf } from "../hero/hero-view-model";
import {
  CATEGORY_LABELS,
  OPTIONAL_CATEGORIES,
  checkinToday,
  governorColor,
  lastRidesAvgRpe,
  sparklinePoints,
  tsbTileData,
  visibleTileKeys,
  wellbeing7dAverages,
  type SaveMode,
  type TileKey,
} from "./trainer-bar-view-model";
import type { EventItem, PlanCard as PlanCardT } from "../../api/types";

type Ride = import("../../types.js").Ride;
type WellnessDay = import("../../types.js").WellnessDay;

interface TrainerBarProps {
  athleteId: string;
  saveMode: SaveMode;
  onSaveModeChange: (mode: SaveMode) => void;
  cards: PlanCardT[];
  rides: Ride[];
  wellness: WellnessDay[];
  events: EventItem[];
  projection: ReturnType<typeof projectLoad>;
  conflicts: ReturnType<typeof detectConflicts>;
  onOpenProposals: () => void;
}

const TODAY = localISODate();

const TITLE_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-disp)",
  fontSize: "1.02rem",
  color: "var(--ink)",
};

const ADJUST_BTN_STYLE: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--hair)",
  borderRadius: "var(--radius-sm)",
  padding: "7px 12px",
  color: "var(--ink-2)",
  font: "inherit",
  fontSize: ".78rem",
  cursor: "pointer",
};

export function TrainerBar({
  athleteId,
  saveMode,
  onSaveModeChange,
  cards,
  rides,
  wellness,
  events,
  projection,
  conflicts,
  onOpenProposals,
}: TrainerBarProps) {
  const { isTrainer, athleteProfileId } = useTrainerContext(athleteId);
  const trainerId = useAuthUserId();
  // athleteProfileId wird schon aufgelöst, sobald der Betrachter irgendein
  // Coach ist — auch für einen Athleten, dessen Trainer er NICHT ist (RLS
  // blockt das nur serverseitig). Erst ab isTrainer wirklich anfragen, sonst
  // feuert jeder Planungstab-Besuch (auch der eines Athleten auf der eigenen
  // Seite) unnötig Prefs-/Check-in-/Proposals-Requests, die ohnehin verworfen
  // werden, sobald `!isTrainer` unten früh zurückkehrt.
  const { categories, setCategories } = useTrainerViewPrefs(isTrainer ? trainerId : null, isTrainer ? athleteProfileId : null);
  const { data: weekCheckinsData } = useCheckinRange(isTrainer ? athleteProfileId : null, addDaysISO(TODAY, -6), TODAY);
  const { data: proposalsData } = useProposals(athleteId, { enabled: isTrainer });
  const [panelOpen, setPanelOpen] = useState(false);

  if (!isTrainer) return null;

  const weekCheckins = weekCheckinsData ?? [];
  const today = checkinToday(weekCheckins, TODAY);
  const subjective = getSubjectiveReadiness(weekCheckins, TODAY);
  const doneDates = doneDatesOf(rides);
  const briefing = buildBriefingInfo(rides, wellness, cards, doneDates, subjective, TODAY);
  const tsb = currentPmc(rides, TODAY)?.tsb ?? null;
  const tsbData = tsbTileData(tsb, events, projection, TODAY);
  const openCount = (proposalsData ?? []).filter((p) => p.status === "open").length;
  const athleteName = athleteConfig(athleteId)?.name ?? "";
  const visible = visibleTileKeys(categories);

  function toggleCategory(key: TileKey, checked: boolean) {
    const next = checked ? [...categories, key] : categories.filter((c) => c !== key);
    setCategories(next);
  }

  return (
    <GlassCard variant="soft" style={{ padding: 20, marginBottom: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={TITLE_STYLE}>Du trainierst {athleteName}</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button type="button" style={ADJUST_BTN_STYLE} onClick={() => setPanelOpen((v) => !v)}>
            ⚙ Ansicht anpassen
          </button>
          <SaveModeToggle mode={saveMode} onChange={onSaveModeChange} />
        </div>
      </div>

      {panelOpen && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
          {OPTIONAL_CATEGORIES.map((key) => (
            <label
              key={key}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: ".82rem", color: "var(--ink-2)" }}
            >
              <input type="checkbox" checked={categories.includes(key)} onChange={(e) => toggleCategory(key, e.target.checked)} />
              {CATEGORY_LABELS[key]}
            </label>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 12 }}>
        {visible.map((key) => {
          switch (key) {
            case "checkin":
              return (
                <Tile key={key} title={CATEGORY_LABELS.checkin}>
                  {today ? (
                    <>
                      <TileRow label="Energie" value={`${today.energy}/5`} />
                      <TileRow label="Muskeln" value={`${today.muscleFeel}/5`} />
                      <TileRow label="Stimmung" value={`${today.mood}/5`} />
                    </>
                  ) : (
                    <TileEmpty>kein Check-in</TileEmpty>
                  )}
                </Tile>
              );
            case "governor":
              return (
                <Tile key={key} title={CATEGORY_LABELS.governor}>
                  <div style={{ fontSize: ".92rem", fontWeight: 600, color: governorColor(briefing.level) }}>
                    {briefing.headline}
                  </div>
                  <div style={{ fontSize: ".78rem", color: "var(--ink-3)", marginTop: 4 }}>{briefing.recommendation}</div>
                </Tile>
              );
            case "tsb":
              return (
                <Tile key={key} title={CATEGORY_LABELS.tsb}>
                  <TileBig>{tsbData.current}</TileBig>
                  {tsbData.goal && (
                    <div style={{ fontSize: ".78rem", color: "var(--ink-3)", marginTop: 4 }}>
                      Ziel ({tsbData.goal.eventTitle}): {tsbData.goal.value}
                    </div>
                  )}
                </Tile>
              );
            case "proposals":
              return (
                <button
                  key={key}
                  type="button"
                  onClick={onOpenProposals}
                  style={{ all: "unset", display: "block", width: "100%", cursor: "pointer" }}
                >
                  <Tile title={CATEGORY_LABELS.proposals}>
                    <TileBig>{openCount}</TileBig>
                    <div style={{ fontSize: ".78rem", color: "var(--ink-3)", marginTop: 4 }}>offen</div>
                  </Tile>
                </button>
              );
            case "wellbeing7d": {
              const avg = wellbeing7dAverages(weekCheckins);
              return (
                <Tile key={key} title={CATEGORY_LABELS.wellbeing7d}>
                  {avg ? (
                    <>
                      <TileRow label="Ø Energie" value={avg.avgEnergy} />
                      <TileRow label="Ø Stimmung" value={avg.avgMood} />
                    </>
                  ) : (
                    <TileEmpty>keine Daten</TileEmpty>
                  )}
                </Tile>
              );
            }
            case "lastRides": {
              const avgRpe = lastRidesAvgRpe(rides);
              return (
                <Tile key={key} title={CATEGORY_LABELS.lastRides}>
                  {avgRpe ? <TileRow label="Ø RPE" value={avgRpe} /> : <TileEmpty>keine RPE-Daten</TileEmpty>}
                </Tile>
              );
            }
            case "conflicts":
              return (
                <Tile key={key} title={CATEGORY_LABELS.conflicts}>
                  <TileBig>{conflicts.length}</TileBig>
                </Tile>
              );
            case "ctlAtl": {
              const ctlPoints = sparklinePoints(projection.days.map((d) => d.ctl));
              const atlPoints = sparklinePoints(projection.days.map((d) => d.atl));
              return (
                <Tile key={key} title={CATEGORY_LABELS.ctlAtl}>
                  <TileRow label="CTL" value={Math.round(projection.startCtl)} points={ctlPoints} color="#4a9eff" />
                  <TileRow label="ATL" value={Math.round(projection.startAtl)} points={atlPoints} color="#e0736b" />
                </Tile>
              );
            }
            default:
              return null;
          }
        })}
      </div>
    </GlassCard>
  );
}

function SaveModeToggle({ mode, onChange }: { mode: SaveMode; onChange: (mode: SaveMode) => void }) {
  const modeBtnStyle = (active: boolean): React.CSSProperties => ({
    border: 0,
    borderRadius: "var(--pill)",
    padding: "7px 14px",
    font: "inherit",
    fontSize: ".78rem",
    fontWeight: 600,
    cursor: "pointer",
    background: active ? "rgba(255,255,255,0.18)" : "transparent",
    color: active ? "var(--ink)" : "var(--ink-3)",
  });
  return (
    <div style={{ display: "flex", background: "var(--hair)", borderRadius: "var(--pill)", padding: 3 }}>
      <button type="button" style={modeBtnStyle(mode === "proposal")} onClick={() => onChange("proposal")}>
        Vorschlag
      </button>
      <button type="button" style={modeBtnStyle(mode === "direct")} onClick={() => onChange("direct")}>
        Direkt
      </button>
    </div>
  );
}

function Tile({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,.03)",
        border: "1px solid var(--hair)",
        borderRadius: "var(--radius-sm)",
        padding: "12px 14px",
      }}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-label)", textTransform: "uppercase", letterSpacing: ".05em", color: "var(--ink-3)", marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function TileRow({ label, value, points, color }: { label: string; value: string | number; points?: string | null; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: ".82rem" }}>
      <span style={{ color: "var(--ink-3)" }}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <b>{value}</b>
        {points && (
          <svg width={72} height={22} viewBox="0 0 72 22">
            <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
          </svg>
        )}
      </span>
    </div>
  );
}

function TileBig({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: "var(--font-disp)", fontSize: "1.6rem" }}>{children}</div>;
}

function TileEmpty({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: ".78rem", color: "var(--ink-3)" }}>{children}</span>;
}

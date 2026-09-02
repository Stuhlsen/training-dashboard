import { useState } from "react";
import { GlassCard } from "../../components/GlassCard";
import { useAuthUserId, useSessionProfile } from "../../api/hooks/useSession";
import { useTodayCheckin, useSharedCheckin } from "../../api/hooks/useWellbeing";
import { athleteConfig } from "../../config";
import { localISODate } from "../../core/format.js";
import { useCheckinEnabled } from "../../hooks/useCheckinEnabled";
import { CheckinDialog } from "../settings/CheckinDialog";

function promptSeenKey(userId: string, todayISO: string) {
  return `checkin_prompt_seen_${userId}_${todayISO}`;
}

interface Status {
  label: string;
  color: string;
}

function selfStatus(isLoading: boolean, isError: boolean, hasCheckin: boolean): Status {
  if (isLoading) return { label: "Lädt …", color: "var(--ink-3)" };
  if (isError) return { label: "Nicht geladen", color: "var(--ink-3)" };
  if (hasCheckin) return { label: "Heute erfasst ✓", color: "var(--ok)" };
  return { label: "Check-in offen", color: "var(--warn)" };
}

/** Eigener, editierbarer Check-in des eingeloggten Athleten — bewusst
 *  UNABHÄNGIG vom Athleten-Toggle (Port von ui/wellbeing-card.js::renderSelf,
 *  s. dortigen Kommentar: der Morgen-Check-in hängt an auth.uid(), nicht an
 *  der gerade betrachteten Athletenseite). */
function SelfCard() {
  const userId = useAuthUserId();
  const { data, isLoading, isError } = useTodayCheckin();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [promptChecked, setPromptChecked] = useState(false);
  const hasCheckin = !!data?.checkin;
  const today = localISODate();

  // Bietet den Check-in-Dialog einmal pro Tag an, sobald der heutige Stand
  // geladen ist und noch kein Eintrag existiert (Konzept D4) — Guard-beim-
  // Rendern statt useEffect+setState (react-hooks/set-state-in-effect,
  // gleiches Muster wie CheckinDialog.tsx's `filled`-Guard). localStorage
  // dedupliziert zusätzlich über mehrere Render-Durchläufe hinweg.
  if (!isLoading && !promptChecked) {
    setPromptChecked(true);
    if (userId && !isError && !hasCheckin) {
      const key = promptSeenKey(userId, today);
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, "1");
        setDialogOpen(true);
      }
    }
  }

  const status = selfStatus(isLoading, isError, hasCheckin);

  return (
    <GlassCard variant="soft" style={{ padding: "20px 22px" }}>
      <span style={{ fontSize: "var(--fs-tile-title)", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--ink)", fontWeight: 700 }}>
        Befinden heute
      </span>
      <button
        type="button"
        title="Klicken für den Morgen-Check-in"
        onClick={() => setDialogOpen(true)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          textAlign: "left",
          background: "none",
          border: "none",
          padding: 0,
          marginTop: 12,
          cursor: "pointer",
          font: "inherit",
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: status.color, flexShrink: 0 }} />
        <span style={{ fontFamily: "var(--font-disp)", fontWeight: 600, fontSize: ".85rem", color: status.color }}>{status.label}</span>
      </button>
      {dialogOpen && <CheckinDialog onClose={() => setDialogOpen(false)} />}
    </GlassCard>
  );
}

/** Freigegebene Werte (wellbeing_shared) des per Toggle betrachteten
 *  Athleten — für Betrachter ohne Athlet-Rolle (Besucher, fremder Coach;
 *  Port von ui/wellbeing-card.js::renderShared). Rendert nichts (statt einer
 *  leeren Kachel), solange kein freigegebener Eintrag vorliegt — entspricht
 *  Vanillas `display:none`-Sonderfall, hier durch `return null` sogar
 *  vollständig aus dem Grid entfernt statt nur versteckt. */
function SharedCard({ athleteId }: { athleteId: string }) {
  const { data: shared, isLoading } = useSharedCheckin(athleteId);
  const athleteName = athleteConfig(athleteId)?.name ?? "";

  if (isLoading) {
    return (
      <GlassCard variant="soft" style={{ padding: "20px 22px" }}>
        <span style={{ fontSize: "var(--fs-tile-title)", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--ink)", fontWeight: 700 }}>
          Befinden heute — {athleteName}
        </span>
        <p style={{ margin: "10px 0 0", fontSize: ".85rem", color: "var(--ink-3)" }}>Lädt …</p>
      </GlassCard>
    );
  }

  if (!shared) return null;

  return (
    <GlassCard variant="soft" style={{ padding: "20px 22px" }}>
      <span style={{ fontSize: "var(--fs-tile-title)", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--ink)", fontWeight: 700 }}>
        Befinden heute — {athleteName}
      </span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 12, fontSize: ".85rem", color: "var(--ink-2)" }}>
        <span>
          Energie <b style={{ color: "var(--ink)" }}>{shared.energy}/5</b>
        </span>
        <span>
          Muskeln <b style={{ color: "var(--ink)" }}>{shared.muscleFeel}/5</b>
        </span>
        <span>
          Stimmung <b style={{ color: "var(--ink)" }}>{shared.mood}/5</b>
        </span>
      </div>
    </GlassCard>
  );
}

/** Port von `ui/wellbeing-card.js`. Verzweigt wie das Vanilla-Original nach
 *  der ROLLE des eingeloggten Users (nicht nach `isSelfAthlete`/Toggle):
 *  ein eingeloggter Athlet sieht immer seinen EIGENEN Check-in, unabhängig
 *  davon, wessen Seite gerade per Athleten-Toggle angezeigt wird — nur
 *  Besucher und Trainer sehen den freigegebenen Check-in des Toggle-Athleten. */
export function WellbeingCard({ activeAthleteId }: { activeAthleteId: string }) {
  const userId = useAuthUserId();
  const isAthleteRole = useSessionProfile()?.role === "athlete";
  const { enabled: checkinEnabled } = useCheckinEnabled();

  if (userId && isAthleteRole) {
    // Settings → Training → „Morgen-Check-in" aus: weder die eigene Kachel
    // noch (über SelfCard) das tägliche Auto-Popup. SharedCard ist für den
    // eingeloggten Athleten nicht der richtige Fallback (das sind fremde,
    // freigegebene Werte) — hier bewusst gar keine Kachel.
    return checkinEnabled ? <SelfCard /> : null;
  }
  return <SharedCard athleteId={activeAthleteId} />;
}

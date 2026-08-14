/* ============================================================
   FEATURES/PLANNING/EXPORTPANEL.TSX — Export für Claude
   (Etappe 7c, Port von ui/export-panel.js)

   Zeigt das fertige Prompt+Briefing als eine Zeichenkette (Konzept §2) —
   Textfeld + Kopieren-Button + Datei-Download, beide aus derselben
   generierten Zeichenkette. Preset-Kachelreihe (R1), optionales
   Zusatzkontext-Freitextfeld (R2, nie persistiert) und bei Preset "event"
   eine Zielevent-Auswahl (R3, Export-Richtungsvorgabe-Konzept). Preset +
   Zielevent werden über useExportPrefs() pro Profil gemerkt (R5/R6).
   ============================================================ */

import { useEffect, useRef, useState } from "react";
import { GlassCard } from "../../components/GlassCard";
import { useEscapeToClose } from "../../hooks/useEscapeToClose";
import { athleteConfig } from "../../config";
import { useSessionProfile, useAuthUserId } from "../../api/hooks/useSession";
import { useCheckinRange } from "../../api/hooks/useWellbeing";
import { useProposals } from "../../api/hooks/useProposals";
import { useLadderState, useLadderPresetSuggestion, type ExportPreset } from "../../api/hooks/useLadderState";
import { useFtpHistory } from "../../api/hooks/useFtpHistory";
import { useExportPrefs } from "../../api/hooks/useExportPrefs";
import { nextRaceEvent, isUpcomingEvent } from "../../api/hooks/useEvents";
import { localISODate, fmtDateFull } from "../../core/format.js";
import { lastComplianceForFormat } from "../../core/ladder.js";
import { isInEventTaper } from "../../core/event-taper.js";
import { buildExportText, exportFileName, EXTRA_CONTEXT_MAX_LENGTH } from "../../core/export-briefing.js";
import { buildExportBriefingCtx, wellbeingWindow } from "./export-briefing-view-model";
import { projectLoad } from "../../core/projection.js";
import { EventForm } from "../events/EventForm";
import type { EventItem, PlanCard as PlanCardT } from "../../api/types";

type Ride = import("../../types.js").Ride;
type WellnessDay = import("../../types.js").WellnessDay;

interface ExportPanelProps {
  athleteId: string;
  ftp: number | null;
  cards: PlanCardT[];
  rides: Ride[];
  wellness: WellnessDay[];
  powerCurveBlocks: Array<{ key: string; curve?: object | null }>;
  events: EventItem[];
  projection: ReturnType<typeof projectLoad>;
  conflicts: Array<{ rule: string; severity: string; message: string }>;
  onClose: () => void;
}

interface PresetTile {
  key: ExportPreset;
  label: string;
  icon: string;
  explainer: string;
}

const PRESETS: PresetTile[] = [
  { key: "general", label: "Allgemein prüfen", icon: "🧭", explainer: "Form, Plan und Events ansehen, Änderungen wo sinnvoll" },
  { key: "event", label: "Auf Event hin", icon: "🎯", explainer: "Form auf den Zieltermin ausrichten, Taper einplanen" },
  { key: "check", label: "Nur prüfen", icon: "✅", explainer: "Einschätzung ohne Änderungsvorschläge" },
  { key: "reduce", label: "Entlasten", icon: "🔋", explainer: "Entlastung einbauen, Intensität zurücknehmen" },
  { key: "build", label: "Aufbau steigern", icon: "📈", explainer: "Mehr Reiz, sofern die Daten es zulassen" },
];

const PRIORITY_LABEL: Record<string, string> = { main: "Hauptziel", secondary: "Nebenziel" };

const TILE_STYLE = (active: boolean): React.CSSProperties => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 4,
  padding: "10px 6px",
  borderRadius: "var(--radius-sm)",
  border: `1px solid ${active ? "var(--ss)" : "var(--hair)"}`,
  background: active ? "rgba(224,138,60,.15)" : "rgba(255,255,255,.03)",
  color: active ? "var(--ink)" : "var(--ink-2)",
  fontSize: ".72rem",
  fontWeight: active ? 600 : 400,
  cursor: "pointer",
  textAlign: "center",
});

const FIELD_LABEL_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: ".64rem",
  textTransform: "uppercase",
  letterSpacing: ".06em",
  color: "var(--ink-3)",
};

const INPUT_STYLE: React.CSSProperties = {
  background: "rgba(255,255,255,.04)",
  border: "1px solid var(--hair)",
  borderRadius: "var(--radius-sm)",
  padding: "9px 11px",
  color: "var(--ink)",
  font: "inherit",
  fontSize: ".86rem",
};

const ROW_BTN_STYLE: React.CSSProperties = {
  border: "1px solid var(--hair)",
  borderRadius: "var(--pill)",
  padding: "8px 16px",
  background: "transparent",
  color: "var(--ink-2)",
  font: "inherit",
  fontSize: ".82rem",
  cursor: "pointer",
};

const PRIMARY_BTN_STYLE: React.CSSProperties = {
  ...ROW_BTN_STYLE,
  background: "var(--ss)",
  borderColor: "var(--ss)",
  color: "#17110a",
  fontWeight: 600,
};

const TODAY = localISODate();

export function ExportPanel({
  athleteId,
  ftp,
  cards,
  rides,
  wellness,
  powerCurveBlocks,
  events,
  projection,
  conflicts,
  onClose,
}: ExportPanelProps) {
  const profile = useSessionProfile();
  const userId = useAuthUserId();
  const athleteCfg = athleteConfig(athleteId);

  const { preset: savedPreset, eventId: savedEventId, save: saveExportPrefs, isLoading: prefsLoading } = useExportPrefs();
  const { data: proposalsData } = useProposals(athleteId);
  const { formats: ladderFormats } = useLadderState();
  const getPresetSuggestion = useLadderPresetSuggestion();
  const { entries: ftpHistoryEntries } = useFtpHistory();
  const wellbeingRange = wellbeingWindow(TODAY);
  const { data: wellbeingData } = useCheckinRange(userId, wellbeingRange.from, wellbeingRange.to);

  const [selectedPreset, setSelectedPreset] = useState<ExportPreset>("general");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [extraContext, setExtraContext] = useState("");
  const [debouncedExtraContext, setDebouncedExtraContext] = useState("");
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [text, setText] = useState("Lade Briefing …");
  const [fileName, setFileName] = useState(() => exportFileName(athleteId, TODAY));
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const appliedPrefsRef = useRef(false);

  useEscapeToClose(onClose);

  // R2: Zusatzkontext debounced neu generieren, statt bei jedem Tastenanschlag.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedExtraContext(extraContext), 400);
    return () => clearTimeout(timer);
  }, [extraContext]);

  // Einmalig nach dem Laden der gespeicherten Vorgabe übernehmen (R5/R6).
  useEffect(() => {
    if (prefsLoading || appliedPrefsRef.current) return;
    appliedPrefsRef.current = true;
    setSelectedPreset((savedPreset as ExportPreset) ?? "general");
    setSelectedEventId(savedEventId);
  }, [prefsLoading, savedPreset, savedEventId]);

  const upcomingEvents = events
    .filter((e) => isUpcomingEvent(e, TODAY))
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));

  // Sicherheitsnetz: hält die Auswahl gültig, falls Events erst NACH dem
  // Öffnen des Dialogs nachladen oder das gemerkte Event inzwischen verfiel.
  // Zustand direkt während des Renderns korrigieren (wie PlanningPage.tsx::
  // deltaBannerAthleteId) statt über einen Effekt — setState in einem Effekt
  // löst sonst unnötige Folge-Renders aus. Persistiert selbst nichts, das
  // übernehmen selectPreset()/selectEvent().
  if (selectedPreset === "event") {
    const stillValid = selectedEventId && upcomingEvents.some((e) => e.id === selectedEventId);
    if (!stillValid) {
      const next = nextRaceEvent(events, TODAY)?.id ?? upcomingEvents[0]?.id ?? null;
      if (next !== selectedEventId) setSelectedEventId(next);
    }
  }

  function selectPreset(key: ExportPreset) {
    if (key === selectedPreset) return;
    let nextEventId = selectedEventId;
    if (key === "event") {
      const stillValid = selectedEventId && upcomingEvents.some((e) => e.id === selectedEventId);
      nextEventId = stillValid ? selectedEventId : (nextRaceEvent(events, TODAY)?.id ?? upcomingEvents[0]?.id ?? null);
    }
    setSelectedPreset(key);
    setSelectedEventId(nextEventId);
    saveExportPrefs(key, key === "event" ? nextEventId : null);
  }

  function selectEvent(id: string) {
    setSelectedEventId(id);
    saveExportPrefs(selectedPreset, id);
  }

  // Text-Generierung: Preset/Event/Zusatzkontext-Wechsel oder frisch
  // geladene Daten bauen den Export neu — reine Anzeigefolge, kein Schreiben.
  useEffect(() => {
    let cancelled = false;

    async function run() {
      const selectedEvent = selectedEventId ? (events.find((e) => e.id === selectedEventId) ?? null) : null;
      const inTaper = isInEventTaper(selectedEvent, TODAY);

      const presetSuggestions: Array<{
        formatId: string;
        label: string;
        inTaper: boolean;
        step: number;
        action: string;
        lockedUntil?: string;
      }> = [];
      for (const f of ladderFormats) {
        const last = lastComplianceForFormat(rides, f.formatId);
        const result = await getPresetSuggestion(selectedPreset, f.formatId, {
          rating: (last?.rating as "green" | "yellow" | "red" | null) ?? null,
          rpe: last?.rpe ?? null,
          isTestEvent: selectedEvent?.isTest ?? false,
          inTaper,
        });
        if (result.ok && result.enabled && result.suggestion) {
          presetSuggestions.push({ formatId: f.formatId, label: f.label, inTaper, ...result.suggestion });
        }
      }
      if (cancelled) return;

      const ctx = buildExportBriefingCtx(athleteId, {
        displayName: profile?.displayName ?? null,
        ftp,
        ftpGoal: athleteCfg?.ftpGoal ?? null,
        dataSources: athleteCfg?.dataSources ?? [],
        events,
        cards,
        rides,
        wellness,
        wellbeing: wellbeingData ?? [],
        powerCurveBlocks,
        ftpHistoryEntries,
        projection,
        conflicts,
        proposals: proposalsData ?? [],
        ladderState: ladderFormats,
        presetSuggestions,
        today: TODAY,
      });

      // Über eine Variable statt eines Objektliterals reichen — core/export-
      // briefing.js::buildExportText()s eigene JSDoc-Signatur deklariert nur
      // title/eventDate, obwohl buildAuftragBlock() intern auch isTest liest
      // (core-Kopfkommentar dort); core/ bleibt byte-identisch zur Vanilla-
      // Quelle, deshalb hier der Umweg statt einer Korrektur am core-Modul.
      const eventArg = selectedEvent
        ? { title: selectedEvent.title, eventDate: selectedEvent.eventDate, isTest: selectedEvent.isTest }
        : null;
      const generated = buildExportText(ctx, {
        preset: selectedPreset,
        event: eventArg,
        extraContext: debouncedExtraContext,
      });
      if (cancelled) return;
      setText(generated);
      setFileName(exportFileName(athleteId, TODAY));
      setError("");
    }

    run().catch(() => {
      if (!cancelled) setError("Export konnte nicht erstellt werden.");
    });
    return () => {
      cancelled = true;
    };
  }, [
    athleteId,
    selectedPreset,
    selectedEventId,
    debouncedExtraContext,
    events,
    cards,
    rides,
    wellness,
    wellbeingData,
    powerCurveBlocks,
    ftpHistoryEntries,
    projection,
    conflicts,
    proposalsData,
    ladderFormats,
    getPresetSuggestion,
    profile?.displayName,
    ftp,
    athleteCfg?.ftpGoal,
    athleteCfg?.dataSources,
  ]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Kopieren nicht möglich — Text manuell markieren und kopieren.");
    }
  }

  function handleDownload() {
    const blob = new Blob([text], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const activeExplainer = PRESETS.find((p) => p.key === selectedPreset)?.explainer ?? "";

  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(7,9,14,.75)",
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
          style={{ width: "100%", maxWidth: 600, maxHeight: "92vh", overflowY: "auto", padding: "26px 24px" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div style={{ fontFamily: "var(--font-disp)", fontWeight: 700, fontSize: "1rem", color: "var(--ink)" }}>
              Export für Claude
            </div>
            <div style={{ fontSize: ".78rem", color: "var(--ink-3)" }}>{athleteCfg?.name ?? ""}</div>
          </div>
          <p style={{ margin: "10px 0 12px", fontSize: ".84rem", color: "var(--ink-2)" }}>
            Was soll Claude in dieser Runde für dich tun?
          </p>

          <div role="radiogroup" aria-label="Was soll Claude tun?" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                role="radio"
                aria-checked={selectedPreset === p.key}
                title={p.explainer}
                style={TILE_STYLE(selectedPreset === p.key)}
                onClick={() => selectPreset(p.key)}
              >
                <span aria-hidden="true" style={{ fontSize: "1.1rem" }}>{p.icon}</span>
                <span>{p.label}</span>
              </button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: ".78rem", color: "var(--ink-3)" }}>
            <span aria-hidden="true">ℹ</span>
            <span>{activeExplainer}</span>
          </div>

          {ladderFormats.length > 0 && (
            <div style={{ marginTop: 8, fontSize: ".72rem", color: "var(--ink-3)" }}>
              Aktuell: {ladderFormats.map((f) => f.summary).join(" — ")}
            </div>
          )}

          {selectedPreset === "event" && (
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={FIELD_LABEL_STYLE} htmlFor="export-event-select">Zielevent</label>
              {upcomingEvents.length ? (
                <select
                  id="export-event-select"
                  value={selectedEventId ?? ""}
                  onChange={(e) => selectEvent(e.target.value)}
                  style={INPUT_STYLE}
                >
                  {upcomingEvents.map((e) => (
                    <option key={e.id} value={e.id}>
                      {fmtDateFull(e.eventDate)} — {e.title || "(ohne Titel)"}
                      {e.type === "race" && e.priority ? ` (${PRIORITY_LABEL[e.priority] ?? e.priority})` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: ".8rem", color: "var(--ink-3)" }}>
                  <span>
                    Kein künftiges Event hinterlegt. Trage zuerst ein Ziel ein — etwa einen Test- oder Wettkampftermin —,
                    damit Claude die Form darauf ausrichten kann.
                  </span>
                  <a
                    href="#"
                    style={{ color: "var(--ss)" }}
                    onClick={(e) => {
                      e.preventDefault();
                      setEventFormOpen(true);
                    }}
                  >
                    Event eintragen
                  </a>
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={FIELD_LABEL_STYLE} htmlFor="export-context">Zusatzkontext (optional)</label>
            <textarea
              id="export-context"
              rows={2}
              maxLength={EXTRA_CONTEXT_MAX_LENGTH}
              placeholder="z. B. diese Woche wenig Zeit, fahre nur am Wochenende"
              value={extraContext}
              onChange={(e) => setExtraContext(e.target.value)}
              style={{ ...INPUT_STYLE, resize: "vertical", fontFamily: "var(--font-body)" }}
            />
          </div>

          <textarea
            readOnly
            rows={14}
            value={text}
            style={{
              ...INPUT_STYLE,
              width: "100%",
              boxSizing: "border-box",
              marginTop: 14,
              fontFamily: "var(--font-mono)",
              fontSize: ".78rem",
              resize: "vertical",
            }}
          />

          {error && <div style={{ color: "var(--danger)", fontSize: ".8rem", marginTop: 10 }}>{error}</div>}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <span style={{ fontSize: ".74rem", color: "var(--ink-3)" }}>Gilt nur für diesen Export</span>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" style={PRIMARY_BTN_STYLE} onClick={() => void handleCopy()}>
                {copied ? "Kopiert ✓" : "In Zwischenablage kopieren"}
              </button>
              <button type="button" style={ROW_BTN_STYLE} onClick={handleDownload}>
                Als Datei herunterladen
              </button>
              <button type="button" style={ROW_BTN_STYLE} onClick={onClose}>
                Schließen
              </button>
            </div>
          </div>
        </GlassCard>
      </div>

      {eventFormOpen && (
        <EventForm athleteId={athleteId} editingEvent={null} onClose={() => setEventFormOpen(false)} />
      )}
    </>
  );
}

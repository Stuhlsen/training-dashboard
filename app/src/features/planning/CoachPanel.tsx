/* ============================================================
   FEATURES/PLANNING/COACHPANEL.TSX — KI-Coach-Loop in einem Stufen-Panel
   (Fahrplan 9 Etappe B — docs/fahrplan-9-coach-loop.md)

   Ersetzt ExportPanel.tsx + ImportDialog.tsx. Vier Abschnitte:
     1. Auftrag  — Preset-Kacheln, Zusatzkontext, Zielevent (aus ExportPanel)
     2. Prompt   — generiertes Briefing, „Prompt kopieren" → „In Claude öffnen ↗"
     3. Antwort  — Claudes Antwort einfügen/hochladen, entprelltes Live-Feedback
     4. Verlauf  — coach_exchanges, aufklappbar, Löschen pro Zeile

   Auswertungslogik liegt in reinen Funktionen mit Test (Schichtenregel):
   Prompt-Zusammenbau → core/export-briefing.js + export-briefing-view-model.ts,
   Parser-Feedback → coach-import-view-model.ts,
   Ausgang je Verlaufszeile → core/coach-exchange-outcome.js (im Hook gejoint).
   ============================================================ */

import { useEffect, useMemo, useRef, useState } from "react";
import { GlassCard } from "../../components/GlassCard";
import { useEscapeToClose } from "../../hooks/useEscapeToClose";
import { athleteConfig } from "../../config";
import { useSessionProfile, useAuthUserId } from "../../api/hooks/useSession";
import { useEffectiveSport } from "../../api/hooks/useActiveSport";
import { useCheckinRange } from "../../api/hooks/useWellbeing";
import { useProposals } from "../../api/hooks/useProposals";
import { usePreviewClaudeImport, useImportClaudeProposals } from "../../api/hooks/useProposals";
import {
  useLadderState,
  useLadderPresetSuggestion,
  type ExportPreset,
} from "../../api/hooks/useLadderState";
import { useFtpHistory } from "../../api/hooks/useFtpHistory";
import { useExportPrefs } from "../../api/hooks/useExportPrefs";
import { nextRaceEvent, isUpcomingEvent } from "../../api/hooks/useEvents";
import {
  useCoachExchanges,
  useCreateCoachExchange,
  useDeleteCoachExchange,
} from "../../api/hooks/useCoachExchanges";
import { localISODate, fmtDateFull } from "../../core/format.js";
import { lastComplianceForFormat } from "../../core/ladder.js";
import { isInEventTaper } from "../../core/event-taper.js";
import { buildExportText, exportFileName, EXTRA_CONTEXT_MAX_LENGTH } from "../../core/export-briefing.js";
import { buildExportBriefingCtx, wellbeingWindow } from "./export-briefing-view-model";
import {
  buildCoachImportFeedback,
  type CoachImportPreview,
} from "./coach-import-view-model";
import { projectLoad } from "../../core/projection.js";
import { EventForm } from "../events/EventForm";
import type { CoachExchangeOutcome, EventItem, PlanCard as PlanCardT } from "../../api/types";

type Ride = import("../../types.js").Ride;
type WellnessDay = import("../../types.js").WellnessDay;

interface CoachPanelProps {
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

const PRESET_LABEL: Record<string, string> = Object.fromEntries(PRESETS.map((p) => [p.key, p.label]));

const OUTCOME_LABEL: Record<CoachExchangeOutcome, string> = {
  pending: "offen",
  accepted: "angenommen",
  rejected: "abgelehnt",
  mixed: "gemischt",
  empty: "kein Vorschlag",
};

const OUTCOME_COLOR: Record<CoachExchangeOutcome, string> = {
  pending: "var(--z2)",
  accepted: "var(--z1)",
  rejected: "var(--ink-3)",
  mixed: "var(--ss)",
  empty: "var(--ink-3)",
};

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

const SECTION_TITLE_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: ".66rem",
  textTransform: "uppercase",
  letterSpacing: ".08em",
  color: "var(--ink-3)",
  margin: "22px 0 10px",
};

const HR_STYLE: React.CSSProperties = { border: 0, borderTop: "1px solid var(--hair)", margin: "4px 0 0" };

const TODAY = localISODate();

export function CoachPanel({
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
}: CoachPanelProps) {
  const profile = useSessionProfile();
  const userId = useAuthUserId();
  const athleteCfg = athleteConfig(athleteId);
  // Fahrplan 12 E6: folgt dem aktiven Sport-Umschalter, kein eigener
  // Selektor im Panel (G24). Swim fällt mangels eigener Vorlage auf Rad
  // zurück (außerhalb des Fahrplan-12-Scopes).
  const { effectiveSport } = useEffectiveSport(athleteId);

  const { preset: savedPreset, eventId: savedEventId, save: saveExportPrefs, isLoading: prefsLoading } = useExportPrefs();
  const { data: proposalsData } = useProposals(athleteId);
  const { formats: ladderFormats } = useLadderState();
  const getPresetSuggestion = useLadderPresetSuggestion();
  const { entries: ftpHistoryEntries } = useFtpHistory();
  const wellbeingRange = wellbeingWindow(TODAY);
  const { data: wellbeingData } = useCheckinRange(userId, wellbeingRange.from, wellbeingRange.to);

  const previewClaudeImport = usePreviewClaudeImport(athleteId);
  const { importProposals } = useImportClaudeProposals(athleteId);
  const { createExchange } = useCreateCoachExchange(athleteId);
  const { exchanges, isLoading: historyLoading, isError: historyError } = useCoachExchanges(athleteId);
  const { removeExchange } = useDeleteCoachExchange(athleteId);

  // ── Abschnitt 1: Auftrag ─────────────────────────────────────────────
  const [selectedPreset, setSelectedPreset] = useState<ExportPreset>("general");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [extraContext, setExtraContext] = useState("");
  const [debouncedExtraContext, setDebouncedExtraContext] = useState("");
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const appliedPrefsRef = useRef(false);

  // ── Abschnitt 2: Prompt ──────────────────────────────────────────────
  const [text, setText] = useState("Lade Briefing …");
  const [fileName, setFileName] = useState(() => exportFileName(athleteId, TODAY));
  const [promptError, setPromptError] = useState("");
  // Der Prompt-Stand, der zuletzt in die Zwischenablage ging. „Kopiert ✓" gilt
  // nur, solange dieser mit dem aktuell angezeigten `text` übereinstimmt —
  // baut Preset/Event/Zusatzkontext den Prompt neu, ist das Kopierte veraltet
  // und der Knopf springt zurück (abgeleitet, kein Effekt).
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // ── Abschnitt 3/3b: Antwort + Live-Feedback ──────────────────────────
  const [answerText, setAnswerText] = useState("");
  const [debouncedAnswer, setDebouncedAnswer] = useState("");
  const [importError, setImportError] = useState("");
  // Deckt die GANZE Import-Runde ab (importProposals → createExchange). Der
  // isPending der Import-Mutation allein reicht nicht: er fällt zwischen den
  // beiden Awaits zurück auf false, und bei 0 Vorschlägen wird er nie gesetzt
  // — ein zweiter Klick würde sonst doppelt importieren + zwei Verlaufszeilen
  // schreiben.
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Abschnitt 4: Verlauf ─────────────────────────────────────────────
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEscapeToClose(onClose);

  // R2: Zusatzkontext entprellt (400 ms wie im früheren ExportPanel).
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedExtraContext(extraContext), 400);
    return () => clearTimeout(timer);
  }, [extraContext]);

  // Antwort-Feld entprellt (300 ms, Grill Q4) — Feedback beim Einfügen.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedAnswer(answerText), 300);
    return () => clearTimeout(timer);
  }, [answerText]);

  const copied = copiedText !== null && copiedText === text;

  // Live-Parser-Feedback: aus dem entprellten Antwort-Stand abgeleitet (reine
  // Auswertung über usePreviewClaudeImport, kein I/O) — kein Effekt/State.
  const preview = useMemo<CoachImportPreview | null>(() => {
    if (!debouncedAnswer.trim()) return null;
    return previewClaudeImport(debouncedAnswer) as CoachImportPreview;
  }, [debouncedAnswer, previewClaudeImport]);

  const feedback = useMemo(
    () => (preview ? buildCoachImportFeedback(preview) : null),
    [preview],
  );

  // Einmalig gespeicherte Vorgabe übernehmen (R5/R6).
  useEffect(() => {
    if (prefsLoading || appliedPrefsRef.current) return;
    appliedPrefsRef.current = true;
    setSelectedPreset((savedPreset as ExportPreset) ?? "general");
    setSelectedEventId(savedEventId);
  }, [prefsLoading, savedPreset, savedEventId]);

  const upcomingEvents = events
    .filter((e) => isUpcomingEvent(e, TODAY))
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));

  // Sicherheitsnetz: hält die Event-Auswahl gültig (wie im früheren ExportPanel).
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

  // Prompt-Generierung — reine Anzeigefolge, kein Schreiben (1:1 aus ExportPanel).
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

      // Das `athlete`-Feld im JSON-Anhang muss die Profil-UUID tragen, nicht
      // den "athlete1"-Slug: usePreviewClaudeImport() prüft die eingefügte
      // Antwort gegen `ownAthleteId: userId` (die auth.uid()). Mit dem Slug
      // scheiterte jede getreue Antwort an „gehört zu einem anderen Account"
      // (Contract in core/export-briefing.test.js — dort ist athleteId eine
      // UUID). Das Panel ist self-only (useIsSelfAthlete-Gate), userId ist
      // hier also genau die Profil-UUID des angezeigten Athleten.
      const ctx = buildExportBriefingCtx(userId ?? athleteId, {
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

      const eventArg = selectedEvent
        ? { title: selectedEvent.title, eventDate: selectedEvent.eventDate, isTest: selectedEvent.isTest }
        : null;
      const generated = buildExportText(ctx, {
        preset: selectedPreset,
        event: eventArg,
        extraContext: debouncedExtraContext,
        sport: effectiveSport === "run" ? "run" : "ride",
      });
      if (cancelled) return;
      setText(generated);
      setFileName(exportFileName(athleteId, TODAY));
      setPromptError("");
    }

    run().catch(() => {
      if (!cancelled) setPromptError("Prompt konnte nicht erstellt werden.");
    });
    return () => {
      cancelled = true;
    };
  }, [
    athleteId,
    userId,
    effectiveSport,
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
      setCopiedText(text);
    } catch {
      setPromptError("Kopieren nicht möglich — Text manuell markieren und kopieren.");
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

  function openClaude() {
    window.open("https://claude.ai/new", "_blank", "noopener");
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => setAnswerText(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!preview || submitting) return;
    const valid = preview.ok ? preview.results.filter((r) => r.valid).map((r) => r.proposal) : [];
    setImportError("");
    setSubmitting(true);
    try {
      const res = await importProposals(valid);
      if (!res.ok) {
        setImportError(res.error?.message || "Import fehlgeschlagen.");
        return;
      }
      const groupId = res.proposals[0]?.groupId ?? null;

      const exRes = await createExchange({
        preset: selectedPreset,
        rawResponse: answerText,
        proposalGroupId: groupId,
      });
      if (!exRes.ok) {
        // Der Import selbst ist durch — nur die Verlaufszeile fehlt.
        setImportError(
          `Vorschläge importiert, aber der Verlauf ließ sich nicht speichern: ${exRes.error?.message ?? ""}`,
        );
      }

      // Antwort-Abschnitt zurücksetzen; `preview` folgt dem leeren
      // debouncedAnswer. Verlauf zeigt die neue Zeile oben.
      setAnswerText("");
      setDebouncedAnswer("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setSubmitting(false);
    }
  }

  const activeExplainer = PRESETS.find((p) => p.key === selectedPreset)?.explainer ?? "";
  const canImport = feedback?.canImport ?? false;

  return (
    <>
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
          style={{ width: "100%", maxWidth: 640, maxHeight: "92vh", overflowY: "auto", padding: "26px 24px" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div style={{ fontFamily: "var(--font-disp)", fontWeight: 700, fontSize: "1rem", color: "var(--ink)" }}>
              Coach
            </div>
            <div style={{ fontSize: ".78rem", color: "var(--ink-3)" }}>{athleteCfg?.name ?? ""}</div>
          </div>
          <p style={{ margin: "8px 0 0", fontSize: ".82rem", color: "var(--ink-2)" }}>
            Briefing erzeugen → in Claude einfügen → Antwort zurückbringen. Jede Runde landet im Verlauf.
          </p>

          {/* ── 1. Auftrag ─────────────────────────────────────────── */}
          <div style={SECTION_TITLE_STYLE}>1 · Auftrag</div>
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
              <label style={FIELD_LABEL_STYLE} htmlFor="coach-event-select">Zielevent</label>
              {upcomingEvents.length ? (
                <select
                  id="coach-event-select"
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
            <label style={FIELD_LABEL_STYLE} htmlFor="coach-context">Zusatzkontext (optional)</label>
            <textarea
              id="coach-context"
              rows={2}
              maxLength={EXTRA_CONTEXT_MAX_LENGTH}
              placeholder="z. B. diese Woche wenig Zeit, fahre nur am Wochenende"
              value={extraContext}
              onChange={(e) => setExtraContext(e.target.value)}
              style={{ ...INPUT_STYLE, resize: "vertical", fontFamily: "var(--font-body)" }}
            />
          </div>

          <hr style={HR_STYLE} />

          {/* ── 2. Prompt ──────────────────────────────────────────── */}
          <div style={SECTION_TITLE_STYLE}>2 · Prompt</div>
          <textarea
            readOnly
            rows={12}
            value={text}
            style={{
              ...INPUT_STYLE,
              width: "100%",
              boxSizing: "border-box",
              fontFamily: "var(--font-mono)",
              fontSize: ".78rem",
              resize: "vertical",
            }}
          />
          {promptError && <div style={{ color: "var(--danger)", fontSize: ".8rem", marginTop: 10 }}>{promptError}</div>}

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            <button type="button" style={copied ? ROW_BTN_STYLE : PRIMARY_BTN_STYLE} onClick={() => void handleCopy()}>
              {copied ? "Kopiert ✓" : "Prompt kopieren"}
            </button>
            <button type="button" style={copied ? PRIMARY_BTN_STYLE : ROW_BTN_STYLE} onClick={openClaude}>
              In Claude öffnen ↗
            </button>
            <button type="button" style={ROW_BTN_STYLE} onClick={handleDownload}>
              Als Datei
            </button>
          </div>
          {copied && (
            <div style={{ fontSize: ".76rem", color: "var(--ink-3)", marginTop: 8 }}>
              Jetzt in Claude einfügen (Strg+V) und die Antwort unten zurückbringen.
            </div>
          )}

          <hr style={{ ...HR_STYLE, marginTop: 20 }} />

          {/* ── 3. Antwort + 3b. Live-Feedback ─────────────────────── */}
          <div style={SECTION_TITLE_STYLE}>3 · Antwort</div>
          <textarea
            rows={9}
            placeholder="Claudes komplette Antwort hier einfügen (Text + JSON-Block) …"
            value={answerText}
            onChange={(e) => setAnswerText(e.target.value)}
            style={{
              ...INPUT_STYLE,
              width: "100%",
              boxSizing: "border-box",
              fontFamily: "var(--font-mono)",
              fontSize: ".8rem",
              resize: "vertical",
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.txt"
            style={{ marginTop: 10, fontSize: ".8rem", color: "var(--ink-3)" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />

          {feedback && (
            <div style={{ marginTop: 14 }}>
              {feedback.parseError ? (
                <div style={{ color: "var(--danger)", fontSize: ".82rem" }}>{feedback.parseError.message}</div>
              ) : feedback.items.length === 0 ? (
                <p style={{ color: "var(--ink-3)", fontSize: ".84rem", margin: 0 }}>
                  Keine Vorschläge in der Antwort — Claude schlägt keine Änderung vor.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontSize: ".76rem", color: "var(--ink-3)" }}>
                    {feedback.recognised} von {feedback.items.length} erkannt
                  </div>
                  {feedback.items.map((it, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        gap: 10,
                        padding: "10px 12px",
                        borderRadius: "var(--radius-sm)",
                        background: "rgba(255,255,255,.03)",
                        border: `1px solid ${it.valid ? "var(--hair)" : "var(--danger)"}`,
                      }}
                    >
                      <span aria-hidden="true">{it.valid ? "✅" : "❌"}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: ".84rem", color: "var(--ink)" }}>
                          {it.op} · {it.describe}
                        </div>
                        {it.reason && (
                          <div style={{ fontSize: ".74rem", color: "var(--ink-3)", marginTop: 2 }}>{it.reason}</div>
                        )}
                        {!it.valid && (
                          <ul style={{ margin: "4px 0 0", paddingLeft: 18, color: "var(--danger)", fontSize: ".74rem" }}>
                            {it.errors.map((e, j) => (
                              <li key={j}>{e}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {importError && <div style={{ color: "var(--danger)", fontSize: ".8rem", marginTop: 12 }}>{importError}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
            <button
              type="button"
              style={PRIMARY_BTN_STYLE}
              disabled={!canImport || submitting}
              onClick={() => void handleImport()}
            >
              {submitting ? "⏳ …" : "Importieren"}
            </button>
          </div>

          <hr style={{ ...HR_STYLE, marginTop: 20 }} />

          {/* ── 4. Verlauf ─────────────────────────────────────────── */}
          <div style={SECTION_TITLE_STYLE}>4 · Verlauf</div>
          {historyLoading ? (
            <p style={{ color: "var(--ink-3)", fontSize: ".84rem", margin: 0 }}>Lädt …</p>
          ) : historyError ? (
            <p style={{ color: "var(--danger)", fontSize: ".84rem", margin: 0 }}>
              Verlauf konnte nicht geladen werden.
            </p>
          ) : exchanges.length === 0 ? (
            <p style={{ color: "var(--ink-3)", fontSize: ".84rem", margin: 0 }}>Noch keine Coach-Runden.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {exchanges.map((ex) => {
                const open = expandedId === ex.id;
                const badge =
                  ex.outcome === "pending" && ex.openCount > 0
                    ? `${OUTCOME_LABEL.pending} (${ex.openCount})`
                    : OUTCOME_LABEL[ex.outcome];
                return (
                  <div
                    key={ex.id}
                    style={{
                      borderRadius: "var(--radius-sm)",
                      background: "rgba(255,255,255,.03)",
                      border: "1px solid var(--hair)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px" }}>
                      <button
                        type="button"
                        onClick={() => setExpandedId(open ? null : ex.id)}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          background: "transparent",
                          border: 0,
                          color: "var(--ink)",
                          font: "inherit",
                          fontSize: ".82rem",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <span aria-hidden="true" style={{ color: "var(--ink-3)" }}>{open ? "▾" : "▸"}</span>
                        <span style={{ color: "var(--ink-3)" }}>{fmtDateFull(ex.createdAt.slice(0, 10))}</span>
                        <span>{PRESET_LABEL[ex.preset] ?? ex.preset}</span>
                        <span
                          style={{
                            marginLeft: "auto",
                            fontFamily: "var(--font-mono)",
                            fontSize: ".7rem",
                            color: OUTCOME_COLOR[ex.outcome],
                          }}
                        >
                          {badge}
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label="Verlaufszeile löschen"
                        onClick={() => void removeExchange(ex.id)}
                        style={{ ...ROW_BTN_STYLE, padding: "4px 10px", fontSize: ".72rem" }}
                      >
                        Löschen
                      </button>
                    </div>
                    {open && (
                      <pre
                        style={{
                          margin: 0,
                          padding: "10px 12px",
                          borderTop: "1px solid var(--hair)",
                          fontFamily: "var(--font-mono)",
                          fontSize: ".74rem",
                          color: "var(--ink-2)",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          maxHeight: 260,
                          overflowY: "auto",
                        }}
                      >
                        {ex.rawResponse}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
            <button type="button" style={ROW_BTN_STYLE} onClick={onClose}>
              Schließen
            </button>
          </div>
        </GlassCard>
      </div>

      {eventFormOpen && (
        <EventForm athleteId={athleteId} editingEvent={null} onClose={() => setEventFormOpen(false)} />
      )}
    </>
  );
}

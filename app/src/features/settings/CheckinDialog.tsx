/* ============================================================
   FEATURES/SETTINGS/CHECKINDIALOG.TSX — Morgen-Check-in

   Bisher hatte der React-Port KEINE UI für den täglichen Befinden-
   Check-in — useTodayCheckin()/useSaveCheckin() (Etappe 2b) existierten
   unbenutzt. Erreichbar über ProfileSection ("Befinden anpassen") und als
   tägliches Auto-Popup über dem Hero (WellbeingCard.tsx::SelfCard).

   Zwei Layout-Bugs behoben (2026-09-08):
   - Der Dialog rutschte HINTER die Hero-Kacheln und schien durch. Ursache:
     `position:fixed` wird von einem `backdrop-filter`-Elternteil (jede
     Hero-Kachel via GlassCard) eingefangen — der Dialog füllte dann nur
     die kleine "Befinden heute"-Kachel statt des Viewports. Fix: per
     `createPortal` an `document.body` (raus aus dem Kachel-Stacking-Context)
     + deckende Fläche `--card-solid` statt transluzentem Glas.

   Interaktiver (Grilling 2026-09-08): 1–5-Schieberegler → antippbare
   Zahlen-Pills, dazu eine Live-Vorschau der subjektiven Tagesform
   (getSubjectiveReadiness), die sich beim Tippen mitbewegt.

   Kein `openGuard`-Äquivalent nötig (anders als das Vanilla-Original):
   die Komponente wird bei `onClose` komplett unmounted, eine spät
   eintreffende Query-Antwort aktualisiert nur noch den Cache einer
   bereits verlassenen Instanz — dasselbe Argument wie in EventForm.tsx.
   ============================================================ */

import { useState } from "react";
import { createPortal } from "react-dom";
import { GlassCard } from "../../components/GlassCard";
import { useEscapeToClose } from "../../hooks/useEscapeToClose";
import { useTodayCheckin, useSaveCheckin } from "../../api/hooks/useWellbeing";
import { getSubjectiveReadiness, LEVEL_LABEL } from "../../core/readiness.js";
import { localISODate } from "../../core/format.js";

interface CheckinDialogProps {
  onClose: () => void;
}

interface SliderDef {
  key: "energy" | "muscleFeel" | "mood";
  label: string;
  min: string;
  max: string;
}

const SLIDER_DEFS: SliderDef[] = [
  { key: "energy", label: "Energie", min: "ausgelaugt", max: "voll da / spritzig" },
  { key: "muscleFeel", label: "Muskelgefühl", min: "schwer / platt / Muskelkater", max: "frisch & locker" },
  { key: "mood", label: "Stimmung", min: "mies / gereizt", max: "top / motiviert" },
];

/** Ampelfarbe + fester Vorschau-Satz je subjektivem Level. Der Wortlaut
 *  lehnt sich an core/readiness.js::assessReadiness an, ohne ihn zu kopieren
 *  (der objektive Kanal hat eine eigene, HRV-/schlafbasierte Empfehlung). */
const LEVEL_PREVIEW: Record<"green" | "yellow" | "red", { color: string; hint: string }> = {
  green: { color: "var(--ok)", hint: "Gute Ausgangslage — Einheit wie geplant angehen." },
  yellow: { color: "var(--warn)", hint: "Etwas platt — heute eher Intensität rausnehmen, Umfang ok." },
  red: { color: "var(--danger)", hint: "Deutlich unter Normal — Ruhetag oder lockeres Ausrollen erwägen." },
};

/** Antippbare 1–5-Skala (ersetzt den <input type=range>). Pfeiltasten
 *  verschieben den Wert, damit Tastatur-/Screenreader-Nutzer nichts verlieren. */
function PillScale({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(Math.min(5, value + 1));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(Math.max(1, value - 1));
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={`${label} (1 bis 5)`}
      onKeyDown={onKeyDown}
      style={{ display: "flex", gap: 6 }}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const active = n === value;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={String(n)}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(n)}
            style={{
              flex: 1,
              padding: "9px 0",
              borderRadius: "var(--pill)",
              border: active ? "1px solid var(--ss)" : "1px solid var(--hair)",
              background: active ? "var(--ss)" : "transparent",
              color: active ? "#17110a" : "var(--ink-3)",
              fontFamily: "var(--font-disp)",
              fontWeight: 700,
              fontSize: ".9rem",
              cursor: "pointer",
              transition: "background .15s, color .15s, border-color .15s",
            }}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

export function CheckinDialog({ onClose }: CheckinDialogProps) {
  const { data, isLoading } = useTodayCheckin();
  const { save, isPending } = useSaveCheckin();

  const [touched, setTouched] = useState(false);
  const [energy, setEnergy] = useState(3);
  const [muscleFeel, setMuscleFeel] = useState(3);
  const [mood, setMood] = useState(3);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [filled, setFilled] = useState(false);

  useEscapeToClose(onClose);

  // Regler auf den geladenen Check-in nachziehen — fehlende Werte fallen
  // auf den neutralen Default 3 zurück (Konzept D1), keinen leeren Regler.
  // Nur EINMAL nach dem Laden (filled-Guard), und nur, solange der Athlet
  // noch nichts eingegeben hat (touched) — sonst würde eine späte Antwort
  // laufende Eingaben überschreiben (Port des Vanilla-Verhaltens).
  if (!isLoading && !filled) {
    setFilled(true);
    if (!touched) {
      const checkin = data?.checkin;
      setEnergy(checkin?.energy ?? 3);
      setMuscleFeel(checkin?.muscleFeel ?? 3);
      setMood(checkin?.mood ?? 3);
      setNote(checkin?.note ?? "");
    }
  }

  const values: Record<SliderDef["key"], number> = { energy, muscleFeel, mood };
  const setters: Record<SliderDef["key"], (v: number) => void> = {
    energy: setEnergy,
    muscleFeel: setMuscleFeel,
    mood: setMood,
  };

  function setValue(key: SliderDef["key"], v: number) {
    setTouched(true);
    setters[key](v);
  }

  // Live-Vorschau: subjektive Tagesform aus den drei aktuellen Reglern.
  // getSubjectiveReadiness erwartet die Check-ins als Daten (nicht als IDs)
  // — hier ein synthetischer "heute"-Eintrag aus dem lokalen State.
  const today = localISODate();
  const preview = getSubjectiveReadiness([{ date: today, energy, muscleFeel, mood }], today);
  const previewLevel = (preview.level ?? "yellow") as "green" | "yellow" | "red";
  const previewStyle = LEVEL_PREVIEW[previewLevel];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const result = await save({ energy, muscleFeel, mood, note: note.trim() || null });
    if (!result.ok) {
      setError(result.error?.message || "Check-in konnte nicht gespeichert werden.");
      return;
    }
    onClose();
  }

  return createPortal(
    <div
      className="checkin-overlay"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(7,9,14,.8)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <GlassCard
        variant="strong"
        radius="22px"
        style={{
          background: "var(--card-solid)",
          border: "1px solid var(--hair)",
          width: "100%",
          maxWidth: 380,
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "26px 24px",
        }}
      >
        <div className="checkin-card">
          <div style={{ fontFamily: "var(--font-disp)", fontWeight: 700, fontSize: "1rem", color: "var(--ink)" }}>
            Morgen-Check-in
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: ".64rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink-3)", marginTop: 4 }}>
            Wie geht's dir heute?
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} style={{ marginTop: 20 }}>
            {SLIDER_DEFS.map((def) => (
              <div key={def.key} style={{ marginBottom: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: ".68rem", textTransform: "uppercase", letterSpacing: ".06em", color: "var(--ink-3)" }}>
                    {def.label}
                  </span>
                  <b style={{ fontFamily: "var(--font-disp)", fontWeight: 700, fontSize: ".85rem", color: "var(--ss)" }}>
                    {values[def.key]}
                  </b>
                </div>
                <PillScale label={def.label} value={values[def.key]} onChange={(v) => setValue(def.key, v)} />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                  <span style={{ fontFamily: "var(--font-body)", fontSize: ".66rem", color: "var(--ink-3)" }}>{def.min}</span>
                  <span style={{ fontFamily: "var(--font-body)", fontSize: ".66rem", color: "var(--ink-3)", textAlign: "right" }}>{def.max}</span>
                </div>
              </div>
            ))}

            {/* Live-Vorschau der subjektiven Tagesform */}
            <div
              style={{
                marginTop: 4,
                padding: "12px 14px",
                background: "rgba(255,255,255,.03)",
                border: "1px solid var(--hair)",
                borderRadius: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    background: previewStyle.color,
                    flexShrink: 0,
                    transition: "background .2s",
                  }}
                />
                <span style={{ fontFamily: "var(--font-disp)", fontWeight: 700, fontSize: ".82rem", color: previewStyle.color, transition: "color .2s" }}>
                  {LEVEL_LABEL[previewLevel]}
                </span>
                <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: ".64rem", color: "var(--ink-3)" }}>
                  Ø {preview.score?.toFixed(1)}
                </span>
              </div>
              <p style={{ margin: "6px 0 0", fontFamily: "var(--font-body)", fontSize: ".74rem", lineHeight: 1.4, color: "var(--ink-2)" }}>
                {previewStyle.hint}
              </p>
              <p style={{ margin: "8px 0 0", fontFamily: "var(--font-mono)", fontSize: ".6rem", color: "var(--ink-3)" }}>
                Schlaf-Score kommt automatisch aus intervals.icu
              </p>
            </div>

            <label style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 18 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: ".64rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink-3)" }}>
                Notiz (optional)
              </span>
              <textarea
                rows={2}
                placeholder="z. B. Kopf dicht, evtl. was im Anflug"
                value={note}
                onChange={(e) => {
                  setTouched(true);
                  setNote(e.target.value);
                }}
                style={{
                  background: "rgba(255,255,255,.04)",
                  border: "1px solid var(--hair)",
                  borderRadius: "var(--radius-sm)",
                  padding: "9px 11px",
                  color: "var(--ink)",
                  font: "inherit",
                  fontSize: ".85rem",
                  resize: "vertical",
                }}
              />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: ".6rem", color: "var(--ink-3)" }}>
                Notiz nie öffentlich sichtbar
              </span>
            </label>

            {error && (
              <div style={{ color: "var(--danger)", fontFamily: "var(--font-mono)", fontSize: ".7rem", minHeight: "1em", marginTop: 10 }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button
                type="submit"
                disabled={isPending}
                style={{
                  flex: 1,
                  padding: "11px 0",
                  borderRadius: "var(--pill)",
                  border: "none",
                  background: "var(--ss)",
                  color: "#17110a",
                  fontWeight: 600,
                  cursor: isPending ? "default" : "pointer",
                  opacity: isPending ? 0.7 : 1,
                }}
              >
                {isPending ? "Speichern …" : "Speichern"}
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: "11px 0",
                  background: "transparent",
                  border: "1px solid var(--hair)",
                  borderRadius: "var(--pill)",
                  color: "var(--ink-3)",
                  fontFamily: "var(--font-body)",
                  cursor: "pointer",
                }}
              >
                Überspringen
              </button>
            </div>
          </form>
        </div>
      </GlassCard>
    </div>,
    document.body,
  );
}

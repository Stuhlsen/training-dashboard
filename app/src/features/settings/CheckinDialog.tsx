/* ============================================================
   FEATURES/SETTINGS/CHECKINDIALOG.TSX — Morgen-Check-in (neu, Port von
   ui/checkin-dialog.js)

   Bisher hatte der React-Port KEINE UI für den täglichen Befinden-
   Check-in — useTodayCheckin()/useSaveCheckin() (Etappe 2b) existierten
   unbenutzt. Erreichbar über ProfileSection ("Befinden anpassen"), wie im
   Vanilla-Original wo der Dialog ebenfalls nur über Settings geöffnet wird.

   Kein `openGuard`-Äquivalent nötig (anders als das Vanilla-Original):
   die Komponente wird bei `onClose` komplett unmounted, eine spät
   eintreffende Query-Antwort aktualisiert nur noch den Cache einer
   bereits verlassenen Instanz — dasselbe Argument wie in EventForm.tsx.
   ============================================================ */

import { useState } from "react";
import { GlassCard } from "../../components/GlassCard";
import { useEscapeToClose } from "../../hooks/useEscapeToClose";
import { useTodayCheckin, useSaveCheckin } from "../../api/hooks/useWellbeing";

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

  return (
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
        style={{ width: "100%", maxWidth: 360, maxHeight: "90vh", overflowY: "auto", padding: "26px 24px" }}
      >
        <div style={{ fontFamily: "var(--font-disp)", fontWeight: 700, fontSize: "1rem", color: "var(--ink)" }}>
          Morgen-Check-in
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: ".64rem", textTransform: "uppercase", color: "var(--ink-3)", marginTop: 4 }}>
          Wie geht's dir heute?
        </div>

        <div
          style={{
            marginTop: 16,
            padding: "10px 12px",
            background: "rgba(255,255,255,.03)",
            border: "1px solid var(--hair)",
            borderRadius: 12,
            fontFamily: "var(--font-body)",
            fontSize: ".72rem",
            color: "var(--ink-3)",
          }}
        >
          Schlaf: Score kommt automatisch aus intervals.icu
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} style={{ marginTop: 18 }}>
          {SLIDER_DEFS.map((def) => (
            <div key={def.key} style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: ".68rem", textTransform: "uppercase", letterSpacing: ".06em", color: "var(--ink-3)" }}>
                  {def.label}
                </span>
                <b style={{ fontFamily: "var(--font-disp)", fontWeight: 700, fontSize: ".85rem", color: "var(--ss)" }}>
                  {values[def.key]}
                </b>
              </div>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={values[def.key]}
                aria-label={`${def.label} (1 bis 5)`}
                onChange={(e) => {
                  setTouched(true);
                  setters[def.key](Number(e.target.value));
                }}
                style={{ width: "100%", accentColor: "var(--ss)", cursor: "pointer" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                <span style={{ fontFamily: "var(--font-body)", fontSize: ".66rem", color: "var(--ink-3)" }}>{def.min}</span>
                <span style={{ fontFamily: "var(--font-body)", fontSize: ".66rem", color: "var(--ink-3)", textAlign: "right" }}>{def.max}</span>
              </div>
            </div>
          ))}

          <label style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
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
            <div style={{ color: "var(--danger)", fontFamily: "var(--font-mono)", fontSize: ".7rem", minHeight: "1em", marginTop: 8 }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button
              type="submit"
              disabled={isPending}
              style={{
                flex: 1,
                padding: "10px 0",
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
      </GlassCard>
    </div>
  );
}

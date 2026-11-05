/* ============================================================
   FEATURES/PLANNING/ADDSPORTFLOW.TSX — „Sportart hinzufügen" in „Plan
   anpassen" (Fahrplan 44 E5).

   Eigene Ansicht im selben Overlay. Eingaben: Sportart, Stunden, Tage (kein
   Startdatum — der Plan startet am nächsten Montag, M5). Darunter die
   Vorschau im gemeinsamen Raster, die Hinweise der Verteilung, die Last je
   Sportart mit der Summe als Näherung (M8) und — falls nötig — die ruhige
   Warnung bei einem größeren Lastsprung (M4, keine Sperre).

   Der laufende Plan bleibt unberührt. Es wird erst nach „Hinzufügen"
   geschrieben; „Abbrechen" schreibt nichts. Reine Darstellung — Zustand
   liefert useAddSportFlow, Zahlen das View-Model.
   ============================================================ */

import { Link } from "react-router-dom";
import { GlassCard } from "../../components/GlassCard";
import { sportBadge } from "../../core/activity-sport.js";
import { fmtDate } from "../../core/format.js";
import { MULTI_SPORT_LABEL } from "./multi-sport-plan-view-model";
import { MultiSportPreview } from "./MultiSportPreview";
import { WEEKDAY_LABELS } from "./new-plan-dialog-view-model";
import {
  BTN_STYLE,
  FIELD_STYLE,
  LABEL_STYLE,
  PILL_STYLE,
  PRIMARY_BTN_STYLE,
} from "./new-plan-dialog-styles";
import { useAddSportFlow } from "./useAddSportFlow";

interface AddSportFlowProps {
  athleteId: string;
  /** Zurück zu „Plan anpassen" — ohne zu schreiben. */
  onBack: () => void;
  /** Ganzen Dialog schließen (nach dem Speichern oder „Abbrechen"). */
  onClose: () => void;
  /** Meldet dem Eltern-Dialog, ob gerade gespeichert wird — er sperrt dann Escape. */
  onBusyChange?: (busy: boolean) => void;
}

const BOX: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: "var(--radius-sm)",
  background: "rgba(224,138,60,.10)",
  border: "1px solid rgba(224,138,60,.35)",
  color: "var(--ink-2)",
  fontSize: ".78rem",
  lineHeight: 1.45,
};
const CALM_BOX: React.CSSProperties = { ...BOX, background: "rgba(255,255,255,.03)", border: "1px solid var(--hair)" };
const ERROR_BOX: React.CSSProperties = {
  ...BOX,
  color: "var(--danger)",
  borderColor: "rgba(217,79,79,.35)",
  background: "rgba(217,79,79,.10)",
};
const LINK_STYLE: React.CSSProperties = { color: "var(--ss)" };
const numberOrNull = (v: string): number | null => (v ? Number(v) : null);

export function AddSportFlow({ athleteId, onBack, onClose, onBusyChange }: AddSportFlowProps) {
  const flow = useAddSportFlow(athleteId);
  const { options, sport, draft, preview } = flow;
  const ok = preview?.ok ? preview : null;
  const errors = preview && !preview.ok ? Object.values(preview.errors) : [];
  const errorHints = preview && !preview.ok ? (preview.hints ?? []) : [];
  const planEnd = flow.activePlans.reduce((m, p) => (p.endDate > m ? p.endDate : m), "");
  const nothingToAdd =
    options.offered.length === 0 && options.missingInProfile.length === 0 && options.outranked.length === 0;

  async function handleConfirm() {
    onBusyChange?.(true);
    try {
      if (await flow.confirm()) onClose();
    } finally {
      onBusyChange?.(false);
    }
  }

  function toggleDay(iso: number) {
    if (!draft) return;
    const next = draft.weekdays.includes(iso)
      ? draft.weekdays.filter((d) => d !== iso)
      : [...draft.weekdays, iso].sort((a, b) => a - b);
    flow.setDraft({ weekdays: next });
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(7,9,14,.75)",
        backdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "40px 16px",
        overflowY: "auto",
        zIndex: 1000,
      }}
      onClick={(e) => {
        // Während des Speicherns bleibt der Dialog offen, damit ein Fehler sichtbar wird.
        if (e.target === e.currentTarget && !flow.isPending) onClose();
      }}
    >
      <GlassCard variant="strong" radius="22px" style={{ width: "100%", maxWidth: 560, padding: "26px 24px" }}>
        <div style={{ fontFamily: "var(--font-disp)", fontWeight: 700, fontSize: "1rem", color: "var(--ink)" }}>
          Sportart hinzufügen
        </div>
        <button
          type="button"
          onClick={onBack}
          disabled={flow.isPending}
          style={{ ...BTN_STYLE, marginTop: 8, padding: "4px 12px", fontSize: ".76rem" }}
        >
          ← Zurück zu „Plan anpassen“
        </button>
        <p style={{ margin: "10px 0 16px", fontSize: ".82rem", color: "var(--ink-3)" }}>
          Dein laufender Plan bleibt, wie er ist: Karten, Tage, Ziele und Wochenmodell ändern sich nicht. Der neue
          Plan kommt oben drauf und startet am Montag, {fmtDate(flow.startDate)}. Die Gesamtlast steigt dadurch. Es
          wird erst etwas gespeichert, wenn du unten bestätigst.
        </p>

        {flow.loading && <p style={{ color: "var(--ink-3)", fontSize: ".85rem" }}>Lädt …</p>}

        {!flow.loading && flow.activePlans.length === 0 && (
          <p style={{ color: "var(--ink-3)", fontSize: ".85rem" }}>
            Es läuft noch kein Plan. Lege zuerst über „Neuer Plan“ einen an.
          </p>
        )}

        {!flow.loading && flow.activePlans.length > 0 && (
          <div style={{ display: "grid", gap: 14 }}>
            {options.missingInProfile.length > 0 && (
              <div style={CALM_BOX} role="note" aria-label="Sportarten, die im Profil fehlen">
                {options.missingInProfile.map((s) => (
                  <div key={s}>{MULTI_SPORT_LABEL[s]} ist in deinem Profil nicht aktiviert.</div>
                ))}
                <div style={{ marginTop: 4 }}>
                  Du kannst sie in den{" "}
                  <Link to="/app/settings" style={LINK_STYLE}>
                    Einstellungen
                  </Link>{" "}
                  aktivieren und danach hier hinzufügen.
                </div>
              </div>
            )}
            {options.outranked.length > 0 && (
              <div style={CALM_BOX} role="note" aria-label="Sportarten, die hier nicht dazukommen können">
                {options.outranked.map((s) => (
                  <div key={s}>
                    {MULTI_SPORT_LABEL[s]} kann hier nicht dazukommen: Die Verteilung stellt Rad vor Laufen vor
                    Schwimmen, ein laufender Plan würde dabei verschoben.
                  </div>
                ))}
              </div>
            )}
            {nothingToAdd && (
              <p style={{ margin: 0, color: "var(--ink-3)", fontSize: ".85rem" }}>
                Für alle deine Sportarten läuft schon ein Plan.
              </p>
            )}

            {sport && draft && (
              <>
                <div style={LABEL_STYLE}>
                  Sportart
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} role="group" aria-label="Sportart wählen">
                    {options.offered.map((s) => {
                      const badge = sportBadge(s);
                      const on = s === sport;
                      return (
                        <button
                          key={s}
                          type="button"
                          aria-pressed={on}
                          style={on ? { ...PILL_STYLE, ...PRIMARY_BTN_STYLE, padding: "6px 12px" } : PILL_STYLE}
                          onClick={() => flow.pick(s)}
                        >
                          <span aria-hidden="true">{badge.icon}</span> {MULTI_SPORT_LABEL[s]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label style={LABEL_STYLE}>
                  Zeitbudget (h/Woche)
                  <input
                    type="number"
                    min={1}
                    max={25}
                    step={0.5}
                    style={{ ...FIELD_STYLE, maxWidth: 200 }}
                    value={draft.hours}
                    onChange={(e) => flow.setDraft({ hours: Number(e.target.value) || 0 })}
                  />
                  {flow.hoursNote && (
                    <span style={{ fontSize: ".72rem", color: "var(--ink-2)" }}>{flow.hoursNote}</span>
                  )}
                </label>

                <div style={LABEL_STYLE}>
                  Trainingstage
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {WEEKDAY_LABELS.map((d) => {
                      const on = draft.weekdays.includes(d.iso);
                      return (
                        <button
                          key={d.iso}
                          type="button"
                          aria-pressed={on}
                          style={on ? { ...PILL_STYLE, ...PRIMARY_BTN_STYLE, padding: "6px 12px" } : PILL_STYLE}
                          onClick={() => toggleDay(d.iso)}
                        >
                          {d.short}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {sport !== "ride" && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
                    <label style={LABEL_STYLE}>
                      Aktuelle Schwellen-Geschwindigkeit (km/h)
                      <input
                        type="number"
                        min={1}
                        max={30}
                        step={0.1}
                        style={FIELD_STYLE}
                        value={draft.currentThresholdSpeed ?? ""}
                        onChange={(e) => flow.setDraft({ currentThresholdSpeed: numberOrNull(e.target.value) })}
                      />
                    </label>
                    <label style={LABEL_STYLE}>
                      Ziel (km/h, optional)
                      <input
                        type="number"
                        min={1}
                        max={30}
                        step={0.1}
                        style={FIELD_STYLE}
                        value={draft.thresholdSpeedTarget ?? ""}
                        onChange={(e) => flow.setDraft({ thresholdSpeedTarget: numberOrNull(e.target.value) })}
                      />
                    </label>
                  </div>
                )}

                {sport === "run" && (
                  <label
                    style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: ".78rem", color: "var(--ink-2)" }}
                  >
                    <input type="checkbox" checked={flow.gentleOn} onChange={(e) => flow.setGentle(e.target.checked)} />
                    <span>
                      Sanfter Einstieg (Level Einsteiger, flachere Rampe, niedrigerer Start).{" "}
                      {flow.gentle.reason === "goal" && "Vorgeschlagen, weil dein Ziel „Laufen starten“ ist. "}
                      {flow.gentle.reason === "no-history" &&
                        "Vorgeschlagen, weil es noch keinen früheren Laufplan und keine Lauf-Historie gibt. "}
                      Du kannst ihn jederzeit an- oder ausschalten.
                    </span>
                  </label>
                )}
              </>
            )}

            {ok && (
              <>
                <p style={{ margin: 0, fontSize: ".8rem", color: "var(--ink-2)" }}>
                  Start: Montag, {fmtDate(ok.startDate)} · Dauer: {ok.duration.weeks} Wochen bis zum Ende des
                  laufenden Plans ({fmtDate(planEnd)}).
                </p>
                {ok.notes.map((n) => (
                  <div key={n} style={CALM_BOX} role="note">
                    {n}
                  </div>
                ))}
                {ok.hints.length > 0 && (
                  <div style={BOX} role="status" aria-label="Hinweise zur Verteilung">
                    <strong style={{ color: "var(--ink)" }}>Hinweise zur Verteilung</strong> — sie sperren nichts, du
                    entscheidest.
                    <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                      {ok.hints.map((h, i) => (
                        <li key={`${h.code}-${i}`}>{h.text}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {ok.jump.warn && ok.jump.text && (
                  <div style={BOX} role="status" aria-label="Hinweis zur Gesamtlast">
                    {ok.jump.text}
                  </div>
                )}
                <MultiSportPreview bundle={{ items: ok.gridItems, load: ok.load }} notes={[]} />
              </>
            )}

            {(errors.length > 0 || errorHints.length > 0) && (
              <div style={ERROR_BOX} role="alert">
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {errors.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
                {errorHints.length > 0 && (
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: "var(--ink-2)" }}>
                    {errorHints.map((h, i) => (
                      <li key={`${h.code}-${i}`}>{h.text}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {flow.saveError && (
          <div style={{ color: "var(--danger)", fontSize: ".8rem", marginTop: 12 }}>{flow.saveError}</div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
          <button type="button" style={BTN_STYLE} onClick={onClose} disabled={flow.isPending}>
            Abbrechen
          </button>
          <button
            type="button"
            style={!ok || flow.isPending ? { ...PRIMARY_BTN_STYLE, opacity: 0.5, cursor: "not-allowed" } : PRIMARY_BTN_STYLE}
            disabled={!ok || flow.isPending}
            onClick={() => void handleConfirm()}
          >
            {flow.isPending ? "Speichert…" : "Sportart hinzufügen"}
          </button>
        </div>
      </GlassCard>
    </div>
  );
}

/* ============================================================
   COMPONENTS/RUNNINGTIMERSBAR.TSX — Laufende-Timer-Leiste (E7a)
   Sichtbar in allen /app-Tabs, solange mindestens ein Timer läuft.
   Keine rohen console.*-Aufrufe (Schichtenregel).

   Bekannte Einschränkung (Issue #27, Edge Cases):
   Zwei Browser-Tabs mit derselben App-URL werden NICHT
   synchronisiert — jeder Tab hat seinen eigenen Timer-Zustand.
   ============================================================ */

import { useCallback } from "react";
import { useCookTimers } from "./cook-timer-context";
import { useConfirmTap } from "./useConfirmTap";
import type { CookTimer } from "../types.js";
import {
  remainingSeconds,
  formatRemaining,
  isExpired,
} from "../core/cook-timer";

/* ── Inline-Styles (Projekt-Konvention: kein CSS-Modul) ── */

const BAR_STYLE: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 39,
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "12px",
  padding: "8px clamp(20px, 3vw, 48px)",
  background: "color-mix(in oklab, var(--surface-page) 80%, transparent)",
  backdropFilter: "blur(10px)",
  borderBottom: "1px solid var(--hair)",
  fontSize: ".86rem",
};

const TIMER_ITEM_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "4px 10px",
  borderRadius: "var(--pill)",
  background: "var(--glass-2)",
};

const TIMER_LABEL_STYLE: React.CSSProperties = {
  maxWidth: "160px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const TIME_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: ".82rem",
  fontWeight: 600,
  minWidth: "64px",
  textAlign: "center",
};

const EXPIRED_LABEL_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: ".82rem",
  fontWeight: 600,
  color: "var(--danger)",
};

const BTN_STYLE: React.CSSProperties = {
  border: 0,
  background: "transparent",
  color: "var(--ink-3)",
  cursor: "pointer",
  fontSize: ".78rem",
  padding: "4px 6px",
  borderRadius: "4px",
  font: "inherit",
};

const CONFIRM_BTN_STYLE: React.CSSProperties = {
  ...BTN_STYLE,
  color: "var(--warn)",
  fontWeight: 600,
};

const DISMISS_BTN_STYLE: React.CSSProperties = {
  ...BTN_STYLE,
  color: "var(--danger)",
};

const MUTE_BTN_STYLE: React.CSSProperties = {
  ...BTN_STYLE,
  marginLeft: "auto",
  opacity: 0.6,
};

/** Nach welcher Taktik die Leiste ihre Position bekommt:
 *  - `sticky top: 0` mit z-index:38 (knapp unter .app-header (40)),
 *    damit Timer-Zeilen über dem Seiteninhalt kleben, ohne den Header
 *    zu überdecken. */
export function RunningTimersBar() {
  const { timers, reset, dismiss, muted, setMuted, now } = useCookTimers();

  // Nur Timer mit endAt anzeigen (laufend oder abgelaufen)
  const activeTimers = timers.filter((t): t is CookTimer & { endAt: number } => t.endAt != null);

  if (activeTimers.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Koch-Timer"
      style={BAR_STYLE}
    >
      {activeTimers.map((timer) => (
        <TimerItem
          key={timer.id}
          id={timer.id}
          label={timer.label}
          endAt={timer.endAt}
          durationSeconds={timer.durationSeconds}
          now={now}
          onReset={reset}
          onDismiss={dismiss}
        />
      ))}
      <button
        type="button"
        onClick={() => setMuted(!muted)}
        style={MUTE_BTN_STYLE}
        aria-label={muted ? "Stummschaltung aufheben" : "Stummschalten"}
        title={muted ? "Stumm (Ton aus)" : "Ton an"}
      >
        {muted ? "🔇" : "🔔"}
      </button>
    </div>
  );
}

/* ── Einzelner Timer in der Leiste ─────────────────────── */

interface TimerItemProps {
  id: string;
  label: string;
  endAt: number;
  durationSeconds: number;
  now: number;
  onReset: (id: string) => void;
  onDismiss: (id: string) => void;
}

function TimerItem({
  id,
  label,
  endAt,
  durationSeconds,
  now,
  onReset,
  onDismiss,
}: TimerItemProps) {
  const expired = isExpired({ id, label, durationSeconds, endAt }, now);
  const remaining = remainingSeconds(
    { id, label, durationSeconds, endAt },
    now,
  );

  const { pending: pendingReset, trigger: handleReset } = useConfirmTap(
    useCallback(() => onReset(id), [id, onReset]),
  );

  const handleDismiss = useCallback(() => {
    onDismiss(id);
  }, [id, onDismiss]);

  return (
    <div
      style={{
        ...TIMER_ITEM_STYLE,
        ...(expired ? { background: "var(--glass)" } : {}),
      }}
      role="timer"
      aria-live={expired ? "polite" : undefined}
      aria-atomic="true"
    >
      <span style={TIMER_LABEL_STYLE} title={label}>
        {label}
      </span>

      {expired ? (
        <>
          <span style={EXPIRED_LABEL_STYLE}>abgelaufen</span>
          <button
            type="button"
            onClick={handleDismiss}
            style={DISMISS_BTN_STYLE}
          >
            Schliessen
          </button>
        </>
      ) : (
        <>
          <span style={TIME_STYLE}>{formatRemaining(remaining)}</span>
          <button
            type="button"
            onClick={handleReset}
            style={pendingReset ? CONFIRM_BTN_STYLE : BTN_STYLE}
          >
            {pendingReset
              ? "Wirklich zurücksetzen?"
              : "Zurücksetzen"}
          </button>
        </>
      )}
    </div>
  );
}
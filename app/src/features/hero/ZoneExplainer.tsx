/* ============================================================
   FEATURES/HERO/ZONEEXPLAINER.TSX — Zonen-Erklärer (Fahrplan 24, E2)
   Auswahlleiste der Zonen + EIN Beschreibungsfeld + "ⓘ Quelle".
   Reiner UI-Teil: Zonenliste, Texte (core/zone-explanations.js) und der
   Auswahlzustand kommen vom Aufrufer (kontrolliert) — kein api/-Zugriff,
   keine eigene Berechnung. Rad (E2) und Lauf/Schwimmen (E3) docken über
   dieselben Props an (Lauf/Schwimmen: Pace- und HF-Kacheln, E3).

   Feste Höhe ohne Messen: ALLE Zonentexte liegen übereinander in derselben
   Rasterzelle, nur der gewählte ist sichtbar (`visibility`). Das Feld ist
   damit bei jeder Breite so hoch wie der längste Text — kein Springen beim
   Umschalten, kein Abschneiden, und unsichtbare Texte sind aus dem
   Accessibility-Tree raus.

   Degradiert (`degraded`): keine Bereichszahlen, neutrale Farben — die
   Beschreibungen bleiben lesbar.
   ============================================================ */

import { useRef, type CSSProperties, type KeyboardEvent } from "react";
import { SourceList, type SourceListItem } from "../nutrition/SourceList";
import { SOURCE_BY_KEY, ZONE_SOURCE_STATUS } from "../../core/zone-sources.js";

export interface ExplainerZone {
  id: string;
  label: string;
  color: string;
  /** Fertiger Bereichstext ("120–160 W", "130–150 bpm") oder `null` */
  range: string | null;
}

export interface ExplainerText {
  id: string;
  kurz: string;
  gefuehl: string;
  wofuer: string;
  dauer: string;
  quelleKeys: readonly string[];
}

/** Satz bzw. Hinweis mit Quellenverweis (z. B. HR_RICHTWERT_HINT). */
export interface ExplainerCallout {
  text: string;
  quelleKeys: readonly string[];
}

export interface ZoneExplainerProps {
  zones: readonly ExplainerZone[];
  explanations: readonly ExplainerText[];
  selectedId: string;
  onSelect: (id: string) => void;
  degraded: boolean;
  /** Zone, für die zusätzlich `shareSentence` erscheint (Easy-Zone) */
  easyZoneId?: string;
  shareSentence?: ExplainerCallout;
  /** Immer sichtbare Hinweise unter dem Beschreibungsfeld (z. B. Richtwert,
   *  Wasser-Herzfrequenz), in der gegebenen Reihenfolge */
  hints?: readonly ExplainerCallout[];
}

const STATUS_TEXT: Readonly<Record<string, string>> = {
  [ZONE_SOURCE_STATUS.PRIMAER]: "Originalquelle gelesen",
  [ZONE_SOURCE_STATUS.SEKUNDAER]: "nur Zusammenfassung gelesen",
  [ZONE_SOURCE_STATUS.UNBELEGT]: "übernommene Wahl, nicht belegt",
};

const NEUTRAL_COLOR = "rgba(255,255,255,.28)";

const LABEL_STYLE: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: ".66rem",
  letterSpacing: ".1em",
  textTransform: "uppercase",
  color: "var(--ink-3)",
};

const TEXT_STYLE: CSSProperties = { margin: 0, fontSize: ".86rem", lineHeight: 1.55, color: "var(--ink-2)" };

function sourceItems(keys: readonly string[]): SourceListItem[] {
  const seen = new Set<string>();
  const items: SourceListItem[] = [];
  for (const key of keys) {
    const s = SOURCE_BY_KEY.get(key);
    if (!s || seen.has(key)) continue;
    seen.add(key);
    items.push({ key, title: s.title, link: s.link, url: s.url, status: STATUS_TEXT[s.status] });
  }
  return items;
}

export function ZoneExplainer({
  zones,
  explanations,
  selectedId,
  onSelect,
  degraded,
  easyZoneId,
  shareSentence,
  hints = [],
}: ZoneExplainerProps) {
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const textById = new Map(explanations.map((e) => [e.id, e]));
  const selectedExplanation = textById.get(selectedId);
  const selectedIsEasy = easyZoneId != null && selectedId === easyZoneId;

  function moveTo(index: number) {
    const target = zones[(index + zones.length) % zones.length];
    onSelect(target.id);
    buttons.current.get(target.id)?.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const index = zones.findIndex((z) => z.id === selectedId);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") moveTo(index + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") moveTo(index - 1);
    else if (e.key === "Home") moveTo(0);
    else if (e.key === "End") moveTo(zones.length - 1);
    else return;
    e.preventDefault();
  }

  // Quellen der gewählten Zone + (bei Easy-Zone) des 80-%-Satzes + des Hinweises.
  const keys = [
    ...(selectedExplanation?.quelleKeys ?? []),
    ...(selectedIsEasy && shareSentence ? shareSentence.quelleKeys : []),
    ...hints.flatMap((h) => h.quelleKeys),
  ];
  const sources = sourceItems(keys);
  const ownWording = (selectedExplanation?.quelleKeys.length ?? 0) === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        role="group"
        aria-label="Zone auswählen"
        onKeyDown={handleKeyDown}
        style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
      >
        {zones.map((z) => {
          const selected = z.id === selectedId;
          return (
            <button
              key={z.id}
              type="button"
              ref={(el) => {
                if (el) buttons.current.set(z.id, el);
                else buttons.current.delete(z.id);
              }}
              aria-pressed={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(z.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px",
                borderRadius: "var(--pill)",
                border: `1px solid ${selected ? "var(--accent)" : "var(--hair)"}`,
                background: selected ? "color-mix(in oklab, var(--accent) 14%, transparent)" : "rgba(255,255,255,.04)",
                color: "var(--ink)",
                font: "inherit",
                fontSize: ".8rem",
                cursor: "pointer",
              }}
            >
              <span
                aria-hidden="true"
                style={{ width: 9, height: 9, borderRadius: "50%", background: degraded ? NEUTRAL_COLOR : z.color }}
              />
              <span>{z.label}</span>
              {!degraded && z.range && <span style={{ color: "var(--ink-3)", fontSize: ".74rem" }}>{z.range}</span>}
            </button>
          );
        })}
      </div>

      {/* Alle Texte in einer Rasterzelle: Höhe = längster Text */}
      <div style={{ display: "grid" }} aria-live="polite">
        {zones.map((z) => {
          const t = textById.get(z.id);
          const selected = z.id === selectedId;
          return (
            <div
              key={z.id}
              style={{
                gridArea: "1 / 1",
                visibility: selected ? "visible" : "hidden",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <strong style={{ fontSize: ".95rem", color: "var(--ink)" }}>{z.label}</strong>
                {!degraded && z.range && <span style={LABEL_STYLE}>{z.range}</span>}
              </div>
              {t && (
                <>
                  <p style={{ ...TEXT_STYLE, color: "var(--ink)" }}>{t.kurz}</p>
                  <p style={TEXT_STYLE}>
                    <span style={LABEL_STYLE}>Gefühl </span>
                    {t.gefuehl}
                  </p>
                  <p style={TEXT_STYLE}>
                    <span style={LABEL_STYLE}>Wofür </span>
                    {t.wofuer}
                  </p>
                  <p style={TEXT_STYLE}>
                    <span style={LABEL_STYLE}>Dauer </span>
                    {t.dauer}
                  </p>
                </>
              )}
              {easyZoneId === z.id && shareSentence && <p style={{ ...TEXT_STYLE, color: "var(--ink)" }}>{shareSentence.text}</p>}
            </div>
          );
        })}
      </div>

      {hints.map((h) => (
        <p key={h.text} style={{ ...TEXT_STYLE, fontSize: ".78rem", color: "var(--ink-3)" }}>
          {h.text}
        </p>
      ))}

      {/* Aufklappbereich als Overlay NACH OBEN: die Kachel hat eine feste
          Rasterhöhe, und eine Kachel darunter liegt im Stapel über jedem
          Overlay, das nach unten über den Rand hinausragt (im Docker-Build
          geprüft). Nach oben bleibt es innerhalb der eigenen Kachel. */}
      <details style={{ position: "relative" }}>
        <summary style={{ cursor: "pointer", color: "var(--ink-3)", fontSize: ".8rem" }}>ⓘ Quelle</summary>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: "100%",
            zIndex: 20,
            marginBottom: 6,
            maxHeight: 280,
            overflowY: "auto",
            padding: "10px 14px 12px",
            borderRadius: 12,
            border: "1px solid var(--hair)",
            background: "var(--surface-tooltip)",
            boxShadow: "0 10px 30px rgba(0,0,0,.45)",
          }}
        >
          {ownWording && (
            <p style={{ ...TEXT_STYLE, fontSize: ".8rem", color: "var(--ink-3)" }}>
              Eigene Formulierung dieses Dashboards, ohne Quelle.
            </p>
          )}
          {sources.length > 0 && <SourceList sources={sources} />}
        </div>
      </details>
    </div>
  );
}

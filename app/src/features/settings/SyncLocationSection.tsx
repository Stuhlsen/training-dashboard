/* ============================================================
   FEATURES/SETTINGS/SYNCLOCATIONSECTION.TSX — grober Standort für die
   Wettervorschau des Sync (Tabelle athlete_sync_config, Migration 0023,
   Fahrplan 7 CRED2). Seit Fahrplan 17 E4 Stadt-Suche statt roher
   Koordinatenfelder: Open-Meteo-Geocoding (api/geocoding.ts, kein Key)
   löst clientseitig in Koordinaten auf, der eingetippte Ortsname landet
   zusätzlich in weather_location_label (Migration 0039).

   DATENSCHUTZ: Der Wert wird serverseitig auf 2 Nachkommastellen gerundet
   gespeichert (numeric(x,2), ~1,1 km) und ausschließlich vom Sync gelesen —
   nie über einen Frontend-Lesepfad ausgeliefert, nie in rides.json. Der
   Hinweis darauf steht sichtbar im Formular.
   ============================================================ */

import { useEffect, useState } from "react";
import { useSyncLocation } from "../../api/hooks/useSyncLocation";
import { roundCoord } from "../../api/supabase/athlete-sync-config";
import { formatCityLabel, searchCities, type CityMatch } from "../../api/geocoding";
import { SavedCheck } from "./SavedCheck";
import { SECTION_STYLE, LABEL_STYLE, INPUT_STYLE, HEADING_STYLE, ERROR_STYLE } from "./section-styles";

const SEARCH_DEBOUNCE_MS = 350;

interface Picked {
  lat: number;
  lon: number;
  label: string;
}

export function SyncLocationSection() {
  const { location, isLoading, update, isPending } = useSyncLocation();

  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [matches, setMatches] = useState<CityMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Einmalig die geladenen Werte ins Formular übernehmen (Muster wie
  // IntervalsSection), danach gehört der Feldinhalt dem Nutzer.
  if (!hydrated && !isLoading) {
    setHydrated(true);
    const label = location.locationLabel ?? "";
    setQuery(label);
    setPicked(
      location.lat !== null && location.lon !== null ? { lat: location.lat, lon: location.lon, label } : null,
    );
  }

  // Eingabe entprellen (Muster wie CoachPanel.tsx) — kein Geocoding-Call je Tastendruck.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // Sucht Städte, sobald die entprellte Eingabe lang genug ist — außer sie
  // entspricht bereits der ausgewählten Stadt (direkt nach dem Klick auf
  // einen Vorschlag oder beim initialen Laden des gespeicherten Ortsnamens).
  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (trimmed.length < 2 || (picked !== null && trimmed === picked.label)) return;

    let cancelled = false;
    async function run() {
      setSearching(true);
      const result = await searchCities(trimmed);
      if (cancelled) return;
      setSearching(false);
      setMatches(result.ok ? result.matches : []);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, picked]);

  function pickMatch(match: CityMatch) {
    setQuery(formatCityLabel(match));
    setPicked({ lat: match.lat, lon: match.lon, label: formatCityLabel(match) });
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const trimmed = query.trim();

    if (!trimmed) {
      const result = await update({ lat: null, lon: null, locationLabel: null });
      if (!result.ok) {
        setError(result.error?.message || "Konnte nicht gespeichert werden.");
        return;
      }
      setPicked(null);
      finishSaved();
      return;
    }

    if (!picked || picked.label !== trimmed) {
      setError("Bitte eine Stadt aus der Vorschlagsliste auswählen.");
      return;
    }

    const result = await update({ lat: picked.lat, lon: picked.lon, locationLabel: trimmed });
    if (!result.ok) {
      setError(result.error?.message || "Konnte nicht gespeichert werden.");
      return;
    }
    finishSaved();
  }

  function finishSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  // Rein aus der aktuellen Eingabe abgeleitet statt per Effect zurückgesetzt
  // (React-Empfehlung: ableitbarer Zustand gehört ins Rendering, nicht in
  // ein setState() im Effekt) — verhindert veraltete Vorschläge, sobald das
  // Feld unter die Mindestlänge schrumpft.
  const queryLongEnough = query.trim().length >= 2;
  const showMatches = queryLongEnough ? matches : [];
  const showSearching = queryLongEnough && searching;

  return (
    <div style={SECTION_STYLE}>
      <div style={HEADING_STYLE}>Standort für die Wettervorschau</div>
      <p style={{ fontSize: ".72rem", color: "var(--ink-3)", margin: "0 0 12px" }}>
        Stadt eingeben und aus der Vorschlagsliste auswählen — die Koordinaten werden daraus ermittelt,
        auf 2 Nachkommastellen gerundet gespeichert (~1&nbsp;km) und nur vom Sync für die Wettervorschau
        im Planungstab gelesen. Nie öffentlich sichtbar, nie in exportierten Daten. Feld leeren und
        speichern entfernt den Standort wieder.
      </p>
      <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={LABEL_STYLE}>
          Stadt
          <input
            type="text"
            autoComplete="off"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPicked(null);
              setError("");
            }}
            placeholder="z. B. Bremen"
            style={INPUT_STYLE}
          />
        </label>
        {showSearching && (
          <span style={{ fontSize: "var(--fs-label)", color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>
            Suche …
          </span>
        )}
        {showMatches.length > 0 && (
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              background: "var(--card-solid)",
              border: "1px solid var(--hair)",
              borderRadius: "var(--radius-sm)",
              overflow: "hidden",
            }}
          >
            {showMatches.map((m, i) => (
              <li key={`${m.name}-${m.lat}-${m.lon}`} style={{ borderTop: i === 0 ? "none" : "1px solid var(--hair)" }}>
                <button
                  type="button"
                  onClick={() => pickMatch(m)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--ink)",
                    font: "inherit",
                    fontSize: "0.875rem",
                    padding: "8px 11px",
                  }}
                >
                  {formatCityLabel(m)}
                </button>
              </li>
            ))}
          </ul>
        )}
        {picked && (
          <p style={{ fontSize: "var(--fs-label)", color: "var(--ink-3)", fontFamily: "var(--font-mono)", margin: 0 }}>
            Koordinaten (gerundet): {roundCoord(picked.lat)}, {roundCoord(picked.lon)}
          </p>
        )}
        {error && <div style={ERROR_STYLE}>{error}</div>}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <button
            type="submit"
            disabled={isPending}
            style={{
              alignSelf: "flex-start",
              padding: "9px 18px",
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
          {saved && <SavedCheck />}
        </span>
      </form>
    </div>
  );
}

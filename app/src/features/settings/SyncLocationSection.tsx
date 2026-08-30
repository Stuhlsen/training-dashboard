/* ============================================================
   FEATURES/SETTINGS/SYNCLOCATIONSECTION.TSX — grober Standort für die
   Wettervorschau des Sync (Tabelle athlete_sync_config, Migration 0023,
   Fahrplan 7 CRED2). Steht im Settings-Bereich "Daten" neben
   IntervalsSection, gleiches Formular-Muster.

   DATENSCHUTZ: Der Wert wird serverseitig auf 2 Nachkommastellen gerundet
   gespeichert (numeric(x,2), ~1,1 km) und ausschließlich vom Sync gelesen —
   nie über einen Frontend-Lesepfad ausgeliefert, nie in rides.json. Der
   Hinweis darauf steht sichtbar im Formular.
   ============================================================ */

import { useState } from "react";
import { useSyncLocation } from "../../api/hooks/useSyncLocation";
import { roundCoord } from "../../api/supabase/athlete-sync-config";
import { SavedCheck } from "./SavedCheck";
import { SECTION_STYLE, LABEL_STYLE, INPUT_STYLE, HEADING_STYLE, ERROR_STYLE } from "./section-styles";

function fmt(n: number | null): string {
  return n === null ? "" : String(n);
}

export function SyncLocationSection() {
  const { location, isLoading, update, isPending } = useSyncLocation();

  const [hydrated, setHydrated] = useState(false);
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Einmalig die geladenen Werte ins Formular übernehmen (Muster wie
  // IntervalsSection), danach gehört der Feldinhalt dem Nutzer.
  if (!hydrated && !isLoading) {
    setHydrated(true);
    setLat(fmt(location.lat));
    setLon(fmt(location.lon));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const rawLat = lat.trim();
    const rawLon = lon.trim();

    // Beide leer → Standort zurücksetzen (null/null).
    if (!rawLat && !rawLon) {
      const result = await update({ lat: null, lon: null });
      if (!result.ok) {
        setError(result.error?.message || "Konnte nicht gespeichert werden.");
        return;
      }
      finishSaved();
      return;
    }

    if (!rawLat || !rawLon) {
      setError("Breite und Länge zusammen angeben (oder beide leer lassen).");
      return;
    }

    const nLat = Number(rawLat);
    const nLon = Number(rawLon);
    if (!Number.isFinite(nLat) || !Number.isFinite(nLon)) {
      setError("Bitte Zahlen eingeben (Dezimalgrad, z. B. 52.52).");
      return;
    }
    if (nLat < -90 || nLat > 90 || nLon < -180 || nLon > 180) {
      setError("Breite −90…90, Länge −180…180.");
      return;
    }

    const rLat = roundCoord(nLat);
    const rLon = roundCoord(nLon);
    const result = await update({ lat: rLat, lon: rLon });
    if (!result.ok) {
      setError(result.error?.message || "Konnte nicht gespeichert werden.");
      return;
    }
    setLat(fmt(rLat));
    setLon(fmt(rLon));
    finishSaved();
  }

  function finishSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div style={SECTION_STYLE}>
      <div style={HEADING_STYLE}>Standort für die Wettervorschau</div>
      <p style={{ fontSize: ".72rem", color: "var(--ink-3)", margin: "0 0 12px" }}>
        Grober Standort in Dezimalgrad für die Wettervorschau im Planungstab. Wird auf 2 Nachkommastellen
        gerundet gespeichert (~1&nbsp;km) und nur vom Sync gelesen — nie öffentlich sichtbar, nie in
        exportierten Daten. Beide Felder leeren und speichern entfernt den Standort wieder.
      </p>
      <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={LABEL_STYLE}>
          Breite (Latitude)
          <input
            type="number"
            inputMode="decimal"
            step="any"
            min={-90}
            max={90}
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            placeholder="z. B. 52.52"
            style={INPUT_STYLE}
          />
        </label>
        <label style={LABEL_STYLE}>
          Länge (Longitude)
          <input
            type="number"
            inputMode="decimal"
            step="any"
            min={-180}
            max={180}
            value={lon}
            onChange={(e) => setLon(e.target.value)}
            placeholder="z. B. 13.41"
            style={INPUT_STYLE}
          />
        </label>
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

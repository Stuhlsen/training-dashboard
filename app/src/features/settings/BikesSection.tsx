import { useState, useTransition } from "react";
import { useOwnBikes } from "../../api/hooks/useBikes";
import type { Bike, BikeType } from "../../api/supabase/bikes";
import { GlassCard } from "../../components/GlassCard";

const BIKE_TYPE_LABELS: Record<BikeType, string> = {
  road: "Rennrad",
  gravel: "Gravel",
  tt: "Zeitfahrrad (TT)",
  mtb: "Mountainbike (MTB)",
};

const LABEL_STYLE = {
  display: "block",
  fontFamily: "var(--font-mono)",
  fontSize: ".72rem",
  textTransform: "uppercase" as const,
  letterSpacing: ".06em",
  color: "var(--ink-3)",
  marginBottom: 6,
};

const INPUT_STYLE = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: "var(--radius-md)",
  background: "var(--glass-2)",
  border: "1px solid var(--border)",
  color: "var(--ink)",
  fontFamily: "var(--font-body)",
  fontSize: ".85rem",
  boxSizing: "border-box" as const,
};

export function BikesSection() {
  const { bikes, isLoading: loading, create, update, remove } = useOwnBikes();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Formular-Zustand für Neuanlage
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState("");
  const [bikeType, setBikeType] = useState<BikeType>("road");
  const [crankLengthMm, setCrankLengthMm] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();

  // Bearbeitungs-Zustand
  const [editingBikeId, setEditingBikeId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editBikeType, setEditBikeType] = useState<BikeType>("road");
  const [editCrankLengthMm, setEditCrankLengthMm] = useState<string>("");
  const [editNotes, setEditNotes] = useState("");

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    startTransition(async () => {
      setErrorMsg(null);
      const crankNum = crankLengthMm ? parseInt(crankLengthMm, 10) : null;
      const res = await create({
        name: name.trim(),
        bikeType,
        crankLengthMm: Number.isFinite(crankNum) ? crankNum : null,
        notes: notes.trim() || null,
      });

      if (res.ok) {
        setName("");
        setCrankLengthMm("");
        setNotes("");
        setShowAddForm(false);
      } else {
        setErrorMsg(res.error.message);
      }
    });
  };

  const handleStartEdit = (b: Bike) => {
    setEditingBikeId(b.id);
    setEditName(b.name);
    setEditBikeType(b.bikeType);
    setEditCrankLengthMm(b.crankLengthMm ? String(b.crankLengthMm) : "");
    setEditNotes(b.notes || "");
  };

  const handleSaveEdit = (bikeId: string) => {
    if (!editName.trim()) return;

    startTransition(async () => {
      setErrorMsg(null);
      const crankNum = editCrankLengthMm ? parseInt(editCrankLengthMm, 10) : null;
      const res = await update(bikeId, {
        name: editName.trim(),
        bikeType: editBikeType,
        crankLengthMm: Number.isFinite(crankNum) ? crankNum : null,
        notes: editNotes.trim() || null,
      });

      if (res.ok) {
        setEditingBikeId(null);
      } else {
        setErrorMsg(res.error.message);
      }
    });
  };

  const handleDelete = (bikeId: string) => {
    if (!window.confirm("Rad wirklich entfernen? Zugehörige Bike-Fittings bleiben erhalten.")) return;

    startTransition(async () => {
      setErrorMsg(null);
      const res = await remove(bikeId);
      if (!res.ok) {
        setErrorMsg(res.error.message);
      }
    });
  };

  return (
    <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h3
            style={{
              margin: 0,
              fontFamily: "var(--font-disp)",
              fontSize: "0.95rem",
              fontWeight: 600,
              color: "var(--ink)",
            }}
          >
            Meine Räder & Ausrüstung
          </h3>
          <p style={{ margin: "4px 0 0", fontSize: ".8rem", color: "var(--ink-3)" }}>
            Grundlage für Bike-Fitting, Cockpit-Geometrie und Ausrüstungs-Historie.
          </p>
        </div>

        {!showAddForm && (
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            style={{
              padding: "7px 14px",
              borderRadius: "var(--radius-pill)",
              background: "var(--glass-2)",
              border: "1px solid var(--border)",
              color: "var(--ink)",
              fontFamily: "var(--font-body)",
              fontSize: ".8rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            + Rad hinzufügen
          </button>
        )}
      </div>

      {errorMsg && (
        <div
          style={{
            padding: "8px 12px",
            marginBottom: 14,
            borderRadius: "var(--radius-sm)",
            background: "rgba(217, 79, 79, 0.15)",
            border: "1px solid var(--thr)",
            color: "var(--thr)",
            fontSize: ".8rem",
          }}
        >
          {errorMsg}
        </div>
      )}

      {loading && <p style={{ fontSize: ".85rem", color: "var(--ink-3)" }}>Lade Räder …</p>}

      {!loading && bikes.length === 0 && !showAddForm && (
        <p style={{ fontSize: ".85rem", color: "var(--ink-3)", fontStyle: "italic" }}>
          Noch keine Räder angelegt. Lege hier dein erstes Rad an, um den Bike-Fit-Tab zu nutzen.
        </p>
      )}

      {/* Liste der bestehenden Räder */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {bikes.map((b) => {
          const isEditing = editingBikeId === b.id;

          if (isEditing) {
            return (
              <GlassCard key={b.id} variant="soft" style={{ padding: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={LABEL_STYLE}>Bezeichnung</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      style={INPUT_STYLE}
                    />
                  </div>
                  <div>
                    <label style={LABEL_STYLE}>Radtyp</label>
                    <select
                      value={editBikeType}
                      onChange={(e) => setEditBikeType(e.target.value as BikeType)}
                      style={INPUT_STYLE}
                    >
                      <option value="road">Rennrad</option>
                      <option value="gravel">Gravel</option>
                      <option value="tt">Zeitfahrrad (TT)</option>
                      <option value="mtb">Mountainbike (MTB)</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={LABEL_STYLE}>Kurbel (mm)</label>
                    <input
                      type="number"
                      placeholder="172.5"
                      value={editCrankLengthMm}
                      onChange={(e) => setEditCrankLengthMm(e.target.value)}
                      style={INPUT_STYLE}
                    />
                  </div>
                  <div>
                    <label style={LABEL_STYLE}>Notizen</label>
                    <input
                      type="text"
                      placeholder="Setup, Lenkerbreite, Vorbau..."
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      style={INPUT_STYLE}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => setEditingBikeId(null)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "var(--radius-pill)",
                      background: "transparent",
                      border: "1px solid var(--border)",
                      color: "var(--ink-3)",
                      fontSize: ".8rem",
                      cursor: "pointer",
                    }}
                  >
                    Abbrechen
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleSaveEdit(b.id)}
                    style={{
                      padding: "6px 14px",
                      borderRadius: "var(--radius-pill)",
                      background: "var(--ss)",
                      border: "none",
                      color: "#17110a",
                      fontSize: ".8rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Speichern
                  </button>
                </div>
              </GlassCard>
            );
          }

          return (
            <div
              key={b.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                borderRadius: "var(--radius-md)",
                background: "var(--glass-2)",
                border: "1px solid var(--border)",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontWeight: 600, fontSize: ".9rem", color: "var(--ink)" }}>{b.name}</span>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: "var(--radius-pill)",
                      background: "rgba(255, 255, 255, 0.08)",
                      fontSize: ".72rem",
                      color: "var(--ink-2)",
                    }}
                  >
                    {BIKE_TYPE_LABELS[b.bikeType]}
                  </span>
                  {b.crankLengthMm && (
                    <span style={{ fontSize: ".75rem", color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>
                      {b.crankLengthMm} mm
                    </span>
                  )}
                </div>
                {b.notes && <div style={{ fontSize: ".78rem", color: "var(--ink-3)", marginTop: 4 }}>{b.notes}</div>}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => handleStartEdit(b)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "var(--radius-pill)",
                    background: "transparent",
                    border: "1px solid var(--border)",
                    color: "var(--ink-2)",
                    fontSize: ".75rem",
                    cursor: "pointer",
                  }}
                >
                  Bearbeiten
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(b.id)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "var(--radius-pill)",
                    background: "transparent",
                    border: "1px solid rgba(217, 79, 79, 0.3)",
                    color: "var(--thr)",
                    fontSize: ".75rem",
                    cursor: "pointer",
                  }}
                >
                  Entfernen
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Formular zum Hinzufügen */}
      {showAddForm && (
        <form
          onSubmit={handleCreate}
          style={{
            marginTop: 14,
            padding: 16,
            borderRadius: "var(--radius-md)",
            background: "var(--glass-2)",
            border: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={LABEL_STYLE}>Bezeichnung *</label>
              <input
                type="text"
                placeholder="z. B. Cube Nuroad Race"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={INPUT_STYLE}
              />
            </div>
            <div>
              <label style={LABEL_STYLE}>Radtyp *</label>
              <select
                value={bikeType}
                onChange={(e) => setBikeType(e.target.value as BikeType)}
                style={INPUT_STYLE}
              >
                <option value="road">Rennrad</option>
                <option value="gravel">Gravel</option>
                <option value="tt">Zeitfahrrad (TT)</option>
                <option value="mtb">Mountainbike (MTB)</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <label style={LABEL_STYLE}>Kurbel (mm)</label>
              <input
                type="number"
                placeholder="172.5"
                min="100"
                max="250"
                value={crankLengthMm}
                onChange={(e) => setCrankLengthMm(e.target.value)}
                style={INPUT_STYLE}
              />
            </div>
            <div>
              <label style={LABEL_STYLE}>Notizen (optional)</label>
              <input
                type="text"
                placeholder="Rahmengröße, Cockpit-Maße..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={INPUT_STYLE}
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              style={{
                padding: "6px 12px",
                borderRadius: "var(--radius-pill)",
                background: "transparent",
                border: "1px solid var(--border)",
                color: "var(--ink-3)",
                fontSize: ".8rem",
                cursor: "pointer",
              }}
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={isPending || !name.trim()}
              style={{
                padding: "6px 14px",
                borderRadius: "var(--radius-pill)",
                background: "var(--ss)",
                border: "none",
                color: "#17110a",
                fontSize: ".8rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Rad anlegen
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
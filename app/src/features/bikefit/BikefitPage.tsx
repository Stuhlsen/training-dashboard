import { useState, useTransition } from "react";
import { PageShell } from "../../components/PageShell";
import { GlassCard } from "../../components/GlassCard";
import { useActiveAthlete } from "../../api/hooks/useActiveAthlete";
import { useAthleteProfileId } from "../../api/hooks/useAthleteProfileId";
import { useCanWriteForAthlete } from "../../api/hooks/useWriteAuthorization";
import { ATHLETES } from "../../config";
import { useBikesPublic } from "../../api/hooks/useBikes";
import {
  useActiveFitting,
  useFittingIterations,
  useStartFitting,
  useCompleteFitting,
  useAddIteration,
} from "../../api/hooks/useBikefitState";
import type { TargetGoal } from "../../api/supabase/bikefit";
import { uploadBikefitPhoto, deleteBikefitPhotos } from "../../api/supabase/bikefit-storage";
import { PointMarker, type Point, type PointDef } from "./PointMarker";
import { IterationResult } from "./IterationResult";
import {
  computeJointAngles,
  compareToTargets,
} from "../../core/bikefit";

const CARD_STYLE = { padding: "28px 32px" };
const CARD_HEADING_STYLE = {
  margin: "0 0 16px",
  fontFamily: "var(--font-disp)",
  fontSize: "1.2rem",
  fontWeight: 600,
  color: "var(--ink)",
};

const LABEL_STYLE = {
  display: "block",
  fontFamily: "var(--font-mono)",
  fontSize: ".75rem",
  textTransform: "uppercase" as const,
  letterSpacing: ".06em",
  color: "var(--ink-3)",
  marginBottom: 6,
};

const SELECT_STYLE = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: "var(--radius-md)",
  background: "var(--glass-2)",
  border: "1px solid var(--border)",
  color: "var(--ink)",
  fontFamily: "var(--font-body)",
  fontSize: ".9rem",
  boxSizing: "border-box" as const,
};

const LEGS_POINTS: PointDef[] = [
  { key: "hip", label: "Hüfte (Trochanter major)", hint: "Spürbarer Knochenpunkt an der Außenseite der Hüfte", color: "#e08a3c" },
  { key: "knee", label: "Knie (Femurkondyle)", hint: "Drehpunkt des Kniegelenks", color: "#4a7fa8" },
  { key: "ankle", label: "Knöchel (Malleolus lat.)", hint: "Äußerer Knöchelknochen am Sprunggelenk", color: "#4a9a6e" },
  { key: "pedalAxle", label: "Pedalachse / Cleat", hint: "Zentrum der Pedalachse bzw. Cleat am Schuh", color: "#d94f4f" },
];

const RIDING_POINTS: PointDef[] = [
  { key: "shoulder", label: "Schulter (Acromion)", hint: "Oberer äußerer Knochenpunkt der Schulter", color: "#a24ad0" },
  { key: "elbow", label: "Ellbogen (Epikondyle)", hint: "Drehpunkt des Ellbogengelenks", color: "#e08a3c" },
  { key: "wrist", label: "Handgelenk (Griffposition)", hint: "Position am Lenker/Bremsgriff", color: "#4a9a6e" },
  { key: "hip", label: "Hüfte (Sitzhaltung)", hint: "Position des Beckens auf dem Sattel", color: "#4a7fa8" },
];

export function BikefitPage() {
  const { activeAthleteId } = useActiveAthlete();
  const { data: athleteProfileId } = useAthleteProfileId(activeAthleteId);
  const canWrite = useCanWriteForAthlete(activeAthleteId);
  const activeAthleteCfg = ATHLETES.find((a) => a.id === activeAthleteId);

  // Gating: Sportart Radsport aktiv?
  const athleteSports = activeAthleteCfg?.sports ?? ["ride"];
  const hasCycling = athleteSports.includes("ride");

  const { bikes, isLoading: loading } = useBikesPublic(activeAthleteId);
  // Explizite Auswahl bleibt nur der User-Klick — welches Rad WIRKLICH
  // angezeigt wird, ist eine reine Ableitung aus der geladenen Liste
  // (fällt auf das erste Rad zurück, wenn die Auswahl nicht mehr existiert,
  // z. B. nach Athleten-Wechsel). Kein Sync-Effekt nötig, s.
  // react-hooks/set-state-in-effect / "Resetting state when a prop changes".
  const [explicitBikeId, setExplicitBikeId] = useState<string>("");
  const selectedBikeId = bikes.some((b) => b.id === explicitBikeId) ? explicitBikeId : (bikes[0]?.id ?? "");
  const [targetGoal, setTargetGoal] = useState<TargetGoal>("balanced");
  const [notes, setNotes] = useState("");

  const { fitting: activeFitting } = useActiveFitting(selectedBikeId);
  const { iterations } = useFittingIterations(activeFitting?.id ?? "");
  const { start: startFittingMutation } = useStartFitting(selectedBikeId);
  const { complete: completeFittingMutation } = useCompleteFitting(selectedBikeId);
  const { addIteration: addIterationMutation } = useAddIteration(activeFitting?.id ?? "");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Neuer Iterations-Workflow
  const [isRecordingIteration, setIsRecordingIteration] = useState(false);
  const [legsFile, setLegsFile] = useState<File | null>(null);
  const [ridingFile, setRidingFile] = useState<File | null>(null);
  const [legsPreview, setLegsPreview] = useState<string | null>(null);
  const [ridingPreview, setRidingPreview] = useState<string | null>(null);

  const [legsPoints, setLegsPoints] = useState<Record<string, Point>>({});
  const [ridingPoints, setRidingPoints] = useState<Record<string, Point>>({});

  const [activeTabStep, setActiveTabStep] = useState<"upload" | "legs" | "riding" | "result">("upload");

  const [isPending, startTransition] = useTransition();

  const handleStartFitting = () => {
    if (!athleteProfileId || !selectedBikeId || !canWrite) return;

    startTransition(async () => {
      setErrorMsg(null);
      const res = await startFittingMutation({ profileId: athleteProfileId, targetGoal, notes });
      if (res.ok) {
        setIsRecordingIteration(true);
      } else {
        setErrorMsg(res.error.message);
      }
    });
  };

  const handleCompleteFitting = () => {
    if (!activeFitting || !canWrite) return;
    if (!window.confirm("Bike-Fitting abschließen? Die temporären Fotos werden aus Datenschutzgründen gelöscht.")) {
      return;
    }

    startTransition(async () => {
      setErrorMsg(null);

      // Alle Fotos der Iterationen löschen (E8 & B8)
      const pathsToDelete: string[] = [];
      for (const iter of iterations) {
        if (iter.photoPathLegs) pathsToDelete.push(iter.photoPathLegs);
        if (iter.photoPathRiding) pathsToDelete.push(iter.photoPathRiding);
      }
      if (pathsToDelete.length > 0) {
        await deleteBikefitPhotos(pathsToDelete);
      }

      const res = await completeFittingMutation(activeFitting.id);
      if (res.ok) {
        setIsRecordingIteration(false);
      } else {
        setErrorMsg(res.error.message);
      }
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: "legs" | "riding") => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    if (type === "legs") {
      setLegsFile(file);
      setLegsPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } else {
      setRidingFile(file);
      setRidingPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    }
  };

  const selectedBike = bikes.find((b) => b.id === selectedBikeId);
  const currentSequence = iterations.length + 1;

  // Berechnete Winkel für die aktuelle Markierung
  const rawPoints = {
    legs: legsPoints,
    riding: ridingPoints,
  };

  const calculatedAngles = computeJointAngles(rawPoints);
  const evaluatedRecommendations = compareToTargets(
    calculatedAngles,
    selectedBike?.bikeType || "road",
    activeFitting?.targetGoal || targetGoal
  );

  const handleSaveIteration = () => {
    if (!athleteProfileId || !activeFitting || !canWrite) return;

    startTransition(async () => {
      setErrorMsg(null);
      let pathLegs: string | null = null;
      let pathRiding: string | null = null;

      if (legsFile) {
        const upRes = await uploadBikefitPhoto(athleteProfileId, activeFitting.id, currentSequence, "legs", legsFile);
        if (upRes.ok) pathLegs = upRes.path;
      }

      if (ridingFile) {
        const upRes = await uploadBikefitPhoto(athleteProfileId, activeFitting.id, currentSequence, "riding", ridingFile);
        if (upRes.ok) pathRiding = upRes.path;
      }

      const res = await addIterationMutation({
        sequence: currentSequence,
        photoPathLegs: pathLegs,
        photoPathRiding: pathRiding,
        points: { legs: legsPoints, riding: ridingPoints },
        angles: calculatedAngles,
        recommendation: evaluatedRecommendations,
      });

      if (res.ok) {
        if (legsPreview) URL.revokeObjectURL(legsPreview);
        if (ridingPreview) URL.revokeObjectURL(ridingPreview);
        setIsRecordingIteration(false);
        setLegsFile(null);
        setRidingFile(null);
        setLegsPreview(null);
        setRidingPreview(null);
        setLegsPoints({});
        setRidingPoints({});
        setActiveTabStep("upload");
      } else {
        setErrorMsg(res.error.message);
      }
    });
  };

  if (!hasCycling) {
    return (
      <PageShell>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <GlassCard variant="soft" style={CARD_STYLE}>
            <h2 style={CARD_HEADING_STYLE}>Bike-Fit</h2>
            <p style={{ color: "var(--ink-3)" }}>
              Der Bike-Fitting-Tab steht nur Athleten mit der Sportart Radsport zur Verfügung.
            </p>
          </GlassCard>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
        <div>
          <h1
            style={{
              margin: 0,
              fontFamily: "var(--font-disp)",
              fontSize: "1.6rem",
              fontWeight: 600,
              color: "var(--ink)",
            }}
          >
            Bike-Fitting
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: ".85rem", color: "var(--ink-3)" }}>
            Winkelanalyse, Biomechanik und Sitzpositionsempfehlungen nach sportwissenschaftlichen Zielkorridoren.
          </p>
        </div>

        {/* Haftungshinweis (B9) */}
        <div
          style={{
            padding: "12px 18px",
            borderRadius: "var(--radius-md)",
            background: "rgba(224, 138, 60, 0.08)",
            border: "1px solid rgba(224, 138, 60, 0.25)",
            fontSize: ".8rem",
            color: "var(--ink-2)",
            lineHeight: 1.5,
          }}
        >
          <strong>Wichtiger Hinweis:</strong> Alle Auswertungen und Winkelkorridore basieren auf etablierten sportwissenschaftlichen Richtwerten (Holmes et al., Andy Pruitt). Sie dienen als datengestützte Orientierungshilfe und ersetzen kein medizinisches oder orthopädisches Fach-Fitting bei Schmerzen oder Verletzungen.
        </div>

        {errorMsg && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "var(--radius-md)",
              background: "rgba(217, 79, 79, 0.15)",
              border: "1px solid var(--thr)",
              color: "var(--thr)",
              fontSize: ".85rem",
            }}
          >
            {errorMsg}
          </div>
        )}

        {/* Rad-Auswahl */}
        <GlassCard variant="soft" style={CARD_STYLE}>
          <h2 style={CARD_HEADING_STYLE}>Fahrrad auswählen</h2>
          {loading && <p style={{ fontSize: ".85rem", color: "var(--ink-3)" }}>Lade Räder …</p>}

          {!loading && bikes.length === 0 && (
            <div>
              <p style={{ fontSize: ".85rem", color: "var(--ink-3)" }}>
                Du hast in deinem Profil noch keine Räder hinterlegt.
              </p>
              <a
                href="/settings#sec-training"
                style={{
                  display: "inline-block",
                  marginTop: 8,
                  padding: "8px 16px",
                  borderRadius: "var(--radius-pill)",
                  background: "var(--ss)",
                  color: "#17110a",
                  fontWeight: 600,
                  fontSize: ".8rem",
                  textDecoration: "none",
                }}
              >
                In Settings ein Rad anlegen
              </a>
            </div>
          )}

          {!loading && bikes.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={LABEL_STYLE}>Aktives Rad</label>
                <select
                  value={selectedBikeId}
                  disabled={!!activeFitting}
                  onChange={(e) => setExplicitBikeId(e.target.value)}
                  style={SELECT_STYLE}
                >
                  {bikes.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.bikeType.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={LABEL_STYLE}>Ausrichtung / Fahrziel</label>
                <select
                  value={activeFitting ? activeFitting.targetGoal : targetGoal}
                  disabled={!!activeFitting}
                  onChange={(e) => setTargetGoal(e.target.value as TargetGoal)}
                  style={SELECT_STYLE}
                >
                  <option value="comfort">Komfort (Aufrechter, entspannter Kniewinkel)</option>
                  <option value="balanced">Ausgewogen (Standard Allround/Langstrecke)</option>
                  <option value="aero">Aero (Sportlich/flacher Rumpf)</option>
                </select>
              </div>
            </div>
          )}
        </GlassCard>

        {/* Fitting Status / Start */}
        {selectedBike && !activeFitting && (
          <GlassCard variant="soft" style={CARD_STYLE}>
            <h2 style={CARD_HEADING_STYLE}>Neues Bike-Fitting starten</h2>
            <p style={{ fontSize: ".85rem", color: "var(--ink-2)", marginBottom: 16 }}>
              Ein Fitting besteht aus mehreren Iterationen. In jeder Iteration nimmst du zwei Fotos auf (Bein gestreckt am tiefsten Totpunkt + normale Fahrhaltung) und markierst die Gelenkpunkte.
            </p>

            {canWrite ? (
              <>
                <div style={{ marginBottom: 18 }}>
                  <label style={LABEL_STYLE}>Notizen zum aktuellen Setup (optional)</label>
                  <input
                    type="text"
                    placeholder="z. B. Neuer Sattel montiert, Vorbau um 10mm gekürzt..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    style={SELECT_STYLE}
                  />
                </div>

                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleStartFitting}
                  style={{
                    padding: "10px 20px",
                    borderRadius: "var(--radius-pill)",
                    background: "var(--ss)",
                    border: "none",
                    color: "#17110a",
                    fontFamily: "var(--font-body)",
                    fontSize: ".85rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Fitting für {selectedBike.name} starten
                </button>
              </>
            ) : (
              <p style={{ fontSize: ".85rem", color: "var(--ink-3)", fontStyle: "italic", margin: 0 }}>
                Nur-Lesemodus: Du hast keine Berechtigung, ein Fitting für diesen Athleten zu starten.
              </p>
            )}
          </GlassCard>
        )}

        {/* Aktives Fitting in Bearbeitung */}
        {selectedBike && activeFitting && (
          <GlassCard variant="soft" style={CARD_STYLE}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "var(--z1)",
                    }}
                  />
                  <h2 style={{ ...CARD_HEADING_STYLE, margin: 0 }}>Aktives Fitting läuft</h2>
                </div>
                <p style={{ margin: "4px 0 0", fontSize: ".8rem", color: "var(--ink-3)" }}>
                  Ziel: {activeFitting.targetGoal.toUpperCase()} · Gestartet am{" "}
                  {new Date(activeFitting.createdAt).toLocaleDateString("de-DE")}
                </p>
              </div>

              {canWrite && (
                <div style={{ display: "flex", gap: 10 }}>
                  {!isRecordingIteration && (
                    <button
                      type="button"
                      onClick={() => setIsRecordingIteration(true)}
                      style={{
                        padding: "8px 18px",
                        borderRadius: "var(--radius-pill)",
                        background: "var(--ss)",
                        border: "none",
                        color: "#17110a",
                        fontFamily: "var(--font-body)",
                        fontSize: ".8rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      + Neue Iteration #{currentSequence}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleCompleteFitting}
                    disabled={isPending}
                    style={{
                      padding: "7px 16px",
                      borderRadius: "var(--radius-pill)",
                      background: "transparent",
                      border: "1px solid var(--border)",
                      color: "var(--ink)",
                      fontFamily: "var(--font-body)",
                      fontSize: ".8rem",
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    Fitting abschließen
                  </button>
                </div>
              )}
            </div>

            {/* Iterations-Erfassungsbereich */}
            {isRecordingIteration && (
              <div
                style={{
                  marginTop: 20,
                  padding: "20px 24px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--glass-2)",
                  border: "1px solid var(--border)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 20,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ margin: 0, fontSize: "1.05rem", color: "var(--ink)" }}>
                    Iteration #{currentSequence} erfassen
                  </h3>

                  {/* Navigation durch die Erfassungsschritte */}
                  <div style={{ display: "flex", gap: 6 }}>
                    {(["upload", "legs", "riding", "result"] as const).map((step, idx) => (
                      <button
                        key={step}
                        type="button"
                        onClick={() => setActiveTabStep(step)}
                        style={{
                          padding: "5px 12px",
                          borderRadius: "var(--radius-pill)",
                          background: activeTabStep === step ? "var(--ss)" : "transparent",
                          border: `1px solid ${activeTabStep === step ? "var(--ss)" : "var(--hair)"}`,
                          color: activeTabStep === step ? "#17110a" : "var(--ink-2)",
                          fontSize: ".75rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {idx + 1}. {step === "upload" ? "Fotos" : step === "legs" ? "Beine" : step === "riding" ? "Oberkörper" : "Ergebnis"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 1. Schritt: Fotos hochladen */}
                {activeTabStep === "upload" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                    <div
                      style={{
                        padding: 16,
                        borderRadius: "var(--radius-md)",
                        border: "1px dashed var(--border)",
                        background: "rgba(255,255,255,0.02)",
                        textAlign: "center",
                      }}
                    >
                      <label style={LABEL_STYLE}>Foto 1: Tiefster Totpunkt (BDC)</label>
                      <p style={{ fontSize: ".75rem", color: "var(--ink-3)", marginBottom: 12 }}>
                        Rechtes Pedal ganz unten (6-Uhr-Stellung), Bein im gestreckten Zustand auf dem Pedal.
                      </p>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileChange(e, "legs")}
                        style={{ display: "none" }}
                        id="input-legs-photo"
                      />
                      <label
                        htmlFor="input-legs-photo"
                        style={{
                          display: "inline-block",
                          padding: "6px 14px",
                          borderRadius: "var(--radius-pill)",
                          background: "var(--glass-3)",
                          border: "1px solid var(--border)",
                          color: "var(--ink)",
                          fontSize: ".8rem",
                          cursor: "pointer",
                        }}
                      >
                        {legsPreview ? "Anderes Foto wählen" : "Foto auswählen"}
                      </label>
                      {legsPreview && (
                        <div style={{ marginTop: 12, height: 120 }}>
                          <img
                            src={legsPreview}
                            alt="Beine Vorschau"
                            style={{ maxHeight: "100%", maxWidth: "100%", borderRadius: 6, objectFit: "contain" }}
                          />
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        padding: 16,
                        borderRadius: "var(--radius-md)",
                        border: "1px dashed var(--border)",
                        background: "rgba(255,255,255,0.02)",
                        textAlign: "center",
                      }}
                    >
                      <label style={LABEL_STYLE}>Foto 2: Normale Fahrhaltung</label>
                      <p style={{ fontSize: ".75rem", color: "var(--ink-3)", marginBottom: 12 }}>
                        Hände am Lenker in gewohnter Griffposition, Rumpf und Arme in natürlicher Fahrhaltung.
                      </p>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileChange(e, "riding")}
                        style={{ display: "none" }}
                        id="input-riding-photo"
                      />
                      <label
                        htmlFor="input-riding-photo"
                        style={{
                          display: "inline-block",
                          padding: "6px 14px",
                          borderRadius: "var(--radius-pill)",
                          background: "var(--glass-3)",
                          border: "1px solid var(--border)",
                          color: "var(--ink)",
                          fontSize: ".8rem",
                          cursor: "pointer",
                        }}
                      >
                        {ridingPreview ? "Anderes Foto wählen" : "Foto auswählen"}
                      </label>
                      {ridingPreview && (
                        <div style={{ marginTop: 12, height: 120 }}>
                          <img
                            src={ridingPreview}
                            alt="Fahrhaltung Vorschau"
                            style={{ maxHeight: "100%", maxWidth: "100%", borderRadius: 6, objectFit: "contain" }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 2. Schritt: Beine markieren */}
                {activeTabStep === "legs" && legsPreview && (
                  <PointMarker
                    key={legsPreview}
                    title="Punkte: Beine am tiefsten Totpunkt"
                    description="Markiere Hüfte, Knie, Knöchel und Pedalachse im Bild."
                    imageUrl={legsPreview}
                    pointsToMark={LEGS_POINTS}
                    linesToDraw={[
                      ["hip", "knee"],
                      ["knee", "ankle"],
                      ["ankle", "pedalAxle"],
                    ]}
                    currentPoints={legsPoints}
                    onChange={setLegsPoints}
                  />
                )}
                {activeTabStep === "legs" && !legsPreview && (
                  <p style={{ color: "var(--ink-3)", fontSize: ".85rem" }}>
                    Bitte lade zuerst in Schritt 1 das Foto für den tiefsten Totpunkt hoch.
                  </p>
                )}

                {/* 3. Schritt: Oberkörper markieren */}
                {activeTabStep === "riding" && ridingPreview && (
                  <PointMarker
                    key={ridingPreview}
                    title="Punkte: Oberkörper & Cockpit"
                    description="Markiere Schulter, Ellbogen, Handgelenk und Hüfte im Bild."
                    imageUrl={ridingPreview}
                    pointsToMark={RIDING_POINTS}
                    linesToDraw={[
                      ["shoulder", "elbow"],
                      ["elbow", "wrist"],
                      ["shoulder", "hip"],
                    ]}
                    currentPoints={ridingPoints}
                    onChange={setRidingPoints}
                  />
                )}
                {activeTabStep === "riding" && !ridingPreview && (
                  <p style={{ color: "var(--ink-3)", fontSize: ".85rem" }}>
                    Bitte lade zuerst in Schritt 1 das Foto für die normale Fahrhaltung hoch.
                  </p>
                )}

                {/* 4. Schritt: Ergebnis & Speichern */}
                {activeTabStep === "result" && (
                  <div>
                    <IterationResult
                      bikeType={selectedBike?.bikeType || "road"}
                      goal={activeFitting?.targetGoal || targetGoal}
                      angles={calculatedAngles}
                      recommendations={evaluatedRecommendations}
                    />

                    <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end", gap: 12 }}>
                      <button
                        type="button"
                        onClick={() => setIsRecordingIteration(false)}
                        style={{
                          padding: "8px 16px",
                          borderRadius: "var(--radius-pill)",
                          background: "transparent",
                          border: "1px solid var(--border)",
                          color: "var(--ink)",
                          fontSize: ".8rem",
                          cursor: "pointer",
                        }}
                      >
                        Abbrechen
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={handleSaveIteration}
                        style={{
                          padding: "8px 20px",
                          borderRadius: "var(--radius-pill)",
                          background: "var(--ss)",
                          border: "none",
                          color: "#17110a",
                          fontSize: ".8rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Iteration #{currentSequence} speichern
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Bisherige Iterationen */}
            <div
              style={{
                marginTop: 20,
                padding: "16px 20px",
                borderRadius: "var(--radius-md)",
                background: "var(--glass-2)",
                border: "1px solid var(--border)",
              }}
            >
              <h3 style={{ margin: "0 0 12px", fontSize: ".95rem", color: "var(--ink)" }}>
                Bisherige Iterationen ({iterations.length})
              </h3>
              {iterations.length === 0 ? (
                <p style={{ margin: 0, fontSize: ".85rem", color: "var(--ink-3)", fontStyle: "italic" }}>
                  Noch keine Iterationen gespeichert. Starte oben die erste Iteration.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {iterations.map((it) => {
                    const knee = (it.angles as Record<string, number | null>)?.kneeAngle;
                    const torso = (it.angles as Record<string, number | null>)?.torsoAngle;
                    return (
                      <div
                        key={it.id}
                        style={{
                          padding: "10px 14px",
                          borderRadius: "var(--radius-sm)",
                          background: "rgba(255, 255, 255, 0.03)",
                          border: "1px solid var(--hair)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontSize: ".85rem",
                        }}
                      >
                        <div>
                          <strong style={{ color: "var(--ink)" }}>Iteration #{it.sequence}</strong>
                          <span style={{ marginLeft: 12, color: "var(--ink-3)" }}>
                            {new Date(it.createdAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: 16, fontFamily: "var(--font-mono)", fontSize: ".8rem", color: "var(--ink-2)" }}>
                          <span>Knie: {knee ? `${Math.round(knee)}°` : "–"}</span>
                          <span>Rumpf: {torso ? `${Math.round(torso)}°` : "–"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </GlassCard>
        )}
      </div>
    </PageShell>
  );
}
/* ============================================================
   FEATURES/NUTRITION/PHOTOFIELD.TSX — eigenes Foto (optional)
   (Fahrplan 25, S2a; Q9) — Verkleinerung auf WebP ≤ 1200 px im Browser,
   Pflicht-Haken zu den Rechten. Kein KI-Label auf Athleten-Fotos.
   Hochgeladen wird erst beim Absenden (useSubmitRecipe), nicht beim Wählen.
   ============================================================ */

import { useEffect, useId, useMemo, useState } from "react";
import { PhotoError, shrinkToWebp } from "./recipe-photo";
import { FIELD_ERROR_STYLE, LABEL_STYLE, META_STYLE, TAP_BUTTON_STYLE, TAP_MIN } from "./nutrition-styles";

interface Props {
  photo: Blob | null;
  rights: boolean;
  onPhoto: (photo: Blob | null) => void;
  onRights: (rights: boolean) => void;
  errors?: string[];
}

export function PhotoField({ photo, rights, onPhoto, onRights, errors }: Props) {
  const inputId = useId();
  const rightsId = useId();
  const errorId = useId();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const previewUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setProblem(null);
    setBusy(true);
    try {
      onPhoto(await shrinkToWebp(file));
    } catch (e) {
      setProblem(e instanceof PhotoError ? e.message : "Das Bild konnte nicht verarbeitet werden.");
    } finally {
      setBusy(false);
    }
  }

  const messages = [...(problem ? [problem] : []), ...(errors ?? [])];

  return (
    <fieldset style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }} aria-describedby={messages.length ? errorId : undefined}>
      <legend style={LABEL_STYLE}>Eigenes Foto (optional)</legend>

      {previewUrl && (
        <img
          src={previewUrl}
          alt="Vorschau deines Fotos"
          style={{ display: "block", maxWidth: "100%", maxHeight: 220, borderRadius: "var(--radius)", margin: "0 0 10px" }}
        />
      )}

      <label htmlFor={inputId} style={{ ...TAP_BUTTON_STYLE, display: "inline-flex", alignItems: "center" }}>
        {photo ? "Anderes Foto wählen" : "Foto wählen"}
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        // visuell versteckt, aber per Tastatur erreichbar; das Label ist der sichtbare Knopf
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" }}
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {photo && (
        <button
          type="button"
          style={{ ...TAP_BUTTON_STYLE, marginLeft: 8 }}
          onClick={() => {
            onPhoto(null);
            onRights(false);
          }}
        >
          Foto entfernen
        </button>
      )}
      {busy && (
        <p role="status" style={META_STYLE}>
          Foto wird verkleinert …
        </p>
      )}

      {photo && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, margin: "12px 0 0", minHeight: TAP_MIN }}>
          <input id={rightsId} type="checkbox" checked={rights} onChange={(e) => onRights(e.target.checked)} style={{ width: 22, height: 22, marginTop: 2 }} />
          <label htmlFor={rightsId} style={{ color: "var(--ink)", fontSize: ".9rem", lineHeight: 1.4 }}>
            Ich habe das Foto selbst gemacht oder darf es verwenden
          </label>
        </div>
      )}

      {messages.map((m) => (
        <p key={m} id={errorId} role="alert" style={FIELD_ERROR_STYLE}>
          {m}
        </p>
      ))}
    </fieldset>
  );
}

/* ============================================================
   FEATURES/NUTRITION/INGREDIENTWISHFORM.TSX — fehlende Zutat wünschen
   (Fahrplan 25, S2b; Q6: Zutaten nur aus der Tabelle, Fehlendes wird gemeldet)

   Steckt im Zutaten-Baustein des Einreichformulars, direkt unter der Meldung
   "Keine Zutat gefunden". Bewusst KEIN eigenes <form>: es liegt schon in einem
   Formular. Enter im Namensfeld sendet deshalb den Wunsch und nicht das Rezept.
   Server: POST /api/ingredient-requests (name 1–100, note bis 300, höchstens
   20 Wünsche je Athlet).
   ============================================================ */

import { useId, useState, type KeyboardEvent } from "react";
import { useIngredientRequest } from "../../api/hooks/useRecipeSubmission";
import {
  FIELD_ERROR_STYLE,
  FIELD_STYLE,
  GLASS,
  LABEL_STYLE,
  META_STYLE,
  PRIMARY_BUTTON_DISABLED_STYLE,
  PRIMARY_BUTTON_STYLE,
  TAP_BUTTON_STYLE,
  TEXT_STYLE,
} from "./nutrition-styles";

const LIMIT_MESSAGE = "Du hast schon 20 Wünsche offen. Warte, bis der Admin einige bearbeitet hat.";

export function IngredientWishForm({ defaultName, onClose }: { defaultName: string; onClose: () => void }) {
  const nameId = useId();
  const noteId = useId();
  const [name, setName] = useState(defaultName);
  const [note, setNote] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [sentName, setSentName] = useState<string | null>(null);
  const { request, isPending } = useIngredientRequest();

  async function send() {
    if (isPending) return;
    setFieldErrors({});
    setMessage(null);
    const trimmedNote = note.trim();
    const result = await request({ name: name.trim(), ...(trimmedNote ? { note: trimmedNote } : {}) });
    if (result.ok) {
      setSentName(name.trim());
      return;
    }
    const { code, message: text, details } = result.error;
    if (code === "VALIDATION") {
      if (details?.requests?.length) setMessage(LIMIT_MESSAGE);
      else if (details && Object.keys(details).length > 0) setFieldErrors(details);
      else setMessage(text);
    } else if (code === "NETWORK") {
      setMessage("Keine Verbindung zum Server. Bitte versuche es gleich noch einmal.");
    } else if (code === "TOKEN_INVALID") {
      setMessage("Du bist nicht angemeldet. Bitte melde dich neu an.");
    } else {
      setMessage(text);
    }
  }

  function onNameKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault(); // sonst würde das umgebende Rezept-Formular gesendet
      void send();
    }
  }

  if (sentName !== null) {
    return (
      <div role="status" style={{ ...GLASS, borderRadius: "var(--radius)", padding: "12px 14px", margin: "8px 0 0" }}>
        <p style={TEXT_STYLE}>Danke! „{sentName}“ ist als Wunsch angekommen. Ein Admin schaut es sich an.</p>
        <button type="button" style={TAP_BUTTON_STYLE} onClick={onClose}>
          Schließen
        </button>
      </div>
    );
  }

  return (
    <div role="group" aria-label="Zutat wünschen" style={{ ...GLASS, borderRadius: "var(--radius)", padding: "12px 14px", margin: "8px 0 0" }}>
      <p style={META_STYLE}>Fehlt eine Zutat? Sag dem Admin Bescheid.</p>

      {message && (
        <p role="alert" style={{ ...FIELD_ERROR_STYLE, margin: "0 0 10px" }}>
          {message}
        </p>
      )}

      <label htmlFor={nameId} style={LABEL_STYLE}>
        Name der Zutat
      </label>
      <input
        id={nameId}
        value={name}
        maxLength={100}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={onNameKey}
        aria-invalid={!!fieldErrors.name}
        style={{ ...FIELD_STYLE, width: "100%", boxSizing: "border-box" }}
      />
      {fieldErrors.name?.map((m) => (
        <p key={m} style={FIELD_ERROR_STYLE}>
          {m}
        </p>
      ))}

      <label htmlFor={noteId} style={{ ...LABEL_STYLE, marginTop: 12 }}>
        Hinweis (optional)
      </label>
      <textarea
        id={noteId}
        rows={2}
        maxLength={300}
        placeholder="z. B. Marke oder wofür du sie brauchst"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        aria-invalid={!!fieldErrors.note}
        style={{ ...FIELD_STYLE, minHeight: 64, resize: "vertical", width: "100%", boxSizing: "border-box" }}
      />
      {fieldErrors.note?.map((m) => (
        <p key={m} style={FIELD_ERROR_STYLE}>
          {m}
        </p>
      ))}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
        <button type="button" disabled={isPending} style={isPending ? PRIMARY_BUTTON_DISABLED_STYLE : PRIMARY_BUTTON_STYLE} onClick={() => void send()}>
          {isPending ? "Sende …" : "Wunsch senden"}
        </button>
        <button type="button" disabled={isPending} style={TAP_BUTTON_STYLE} onClick={onClose}>
          Abbrechen
        </button>
      </div>
    </div>
  );
}

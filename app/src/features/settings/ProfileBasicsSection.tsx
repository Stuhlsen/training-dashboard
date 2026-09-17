/* ============================================================
   FEATURES/SETTINGS/PROFILEBASICSSECTION.TSX — Geburtsdatum, Ruhepuls,
   Maximalherzfrequenz, Größe, Gewicht, Geschlecht (Migration 0039,
   Fahrplan 17 E3). Alle Felder einzeln speicherbar, alle optional.

   Soll später auch als Wizard-Schritt (E7, V5-Contract) laufen, ohne
   Änderung an der Feldlogik hier — deshalb schon jetzt die optionalen
   `onComplete`/`onSkip`-Props, auch wenn E3 sie noch nicht verwendet.
   ============================================================ */

import { useState } from "react";
import {
  useProfileBasics,
  useUpdateBirthdate,
  useUpdateRestingHr,
  useUpdateGender,
  useUpdateHeightCm,
  useUpdateWeightKg,
  useUpdateHrMax,
} from "../../api/hooks/useProfile";
import {
  parseRestingHrInput,
  parseHrMaxInput,
  parseHeightCmInput,
  parseWeightKgInput,
  parseBirthdateInput,
  type NumberFieldParse,
} from "./profile-basics-input";
import { SavedCheck } from "./SavedCheck";
import { LABEL_STYLE, INPUT_STYLE, HEADING_STYLE, ERROR_STYLE, SECTION_STYLE } from "./section-styles";
import type { Result, ProfileOwnFields } from "../../api/types";

/** Gestern, als YYYY-MM-DD — Obergrenze fürs Geburtsdatum (Migration 0035:
 *  `birthdate < current_date`). Modul-Konstante statt `Date.now()` im JSX,
 *  sonst verletzt der Aufruf die React-Reinheitsregel für Render. */
const MAX_BIRTHDATE = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

export interface ProfileBasicsSectionProps {
  /** Nur relevant, wenn diese Sektion als Onboarding-Wizard-Schritt läuft
   *  (E7) statt standalone in Settings — in E3 ungenutzt (V5-Contract). */
  onComplete?: () => void;
  onSkip?: () => void;
}

/** Ein Zahlenfeld: eigener Textentwurf, Parsen + Speichern bei Blur, Revert
 *  auf den zuletzt gespeicherten Text bei Client- oder Server-Fehler.
 *  Hydratisiert einmal aus dem geladenen Wert (Muster wie
 *  TrainingTargetsSection/SyncLocationSection). */
function useNumberFieldEditor(
  loaded: number | null | undefined,
  parse: (raw: string) => NumberFieldParse,
  save: (value: number | null) => Promise<Result>,
) {
  const [hydrated, setHydrated] = useState(false);
  const [text, setText] = useState("");
  const [lastGoodText, setLastGoodText] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  if (!hydrated && loaded !== undefined) {
    setHydrated(true);
    const initial = loaded === null ? "" : String(loaded);
    setText(initial);
    setLastGoodText(initial);
  }

  async function handleBlur() {
    setError("");
    const parsed = parse(text);
    if (!parsed.ok) {
      setError(parsed.error);
      setText(lastGoodText);
      return;
    }
    const normalized = parsed.value === null ? "" : String(parsed.value);
    if (normalized === lastGoodText) {
      setText(normalized);
      return;
    }
    const result = await save(parsed.value);
    if (!result.ok) {
      setError(result.error?.message || "Konnte nicht gespeichert werden.");
      setText(lastGoodText);
      return;
    }
    setText(normalized);
    setLastGoodText(normalized);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return { text, setText, handleBlur, saved, error };
}

/** Ein sofort speicherndes Feld (Datumspicker, Auswahlliste) — keine
 *  Blur-Verzögerung, committet direkt bei onChange. */
function useImmediateFieldEditor<T>(loaded: T | null | undefined, save: (value: T) => Promise<Result>) {
  const [hydrated, setHydrated] = useState(false);
  const [value, setValue] = useState<T | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  if (!hydrated && loaded !== undefined) {
    setHydrated(true);
    setValue(loaded);
  }

  async function commit(next: T) {
    setError("");
    const result = await save(next);
    if (!result.ok) {
      setError(result.error?.message || "Konnte nicht gespeichert werden.");
      return;
    }
    setValue(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return { value, commit, saved, error, setError };
}

export function ProfileBasicsSection(_props: ProfileBasicsSectionProps = {}) {
  const { data: basics, isLoading } = useProfileBasics();
  const { update: saveBirthdate } = useUpdateBirthdate();
  const { update: saveRestingHr } = useUpdateRestingHr();
  const { update: saveGender } = useUpdateGender();
  const { update: saveHeightCm } = useUpdateHeightCm();
  const { update: saveWeightKg } = useUpdateWeightKg();
  const { update: saveHrMax } = useUpdateHrMax();

  const birthdate = useImmediateFieldEditor<string | null>(basics?.birthdate, saveBirthdate);
  const gender = useImmediateFieldEditor<ProfileOwnFields["gender"]>(basics?.gender, saveGender);
  const restingHr = useNumberFieldEditor(basics?.restingHr, parseRestingHrInput, saveRestingHr);
  const hrMax = useNumberFieldEditor(basics?.hrMax, parseHrMaxInput, saveHrMax);
  const heightCm = useNumberFieldEditor(basics?.heightCm, parseHeightCmInput, saveHeightCm);
  const weightKg = useNumberFieldEditor(basics?.weightKg, parseWeightKgInput, saveWeightKg);

  if (isLoading) return null;

  return (
    <div style={SECTION_STYLE}>
      <div style={HEADING_STYLE}>Profil-Basisdaten</div>
      <p style={{ fontSize: ".72rem", color: "var(--ink-3)", margin: "0 0 12px" }}>
        Alle Felder sind optional und einzeln gespeichert. Ruhepuls/Maximalherzfrequenz fließen in
        Trainingszonen und Belastungsberechnung ein.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
        <div>
          <label style={LABEL_STYLE}>Geburtsdatum</label>
          <span style={{ display: "inline-flex", alignItems: "center", width: "100%", gap: 6 }}>
            <input
              type="date"
              value={birthdate.value ?? ""}
              onChange={(e) => {
                const parsed = parseBirthdateInput(e.target.value);
                if (!parsed.ok) {
                  birthdate.setError(parsed.error);
                  return;
                }
                void birthdate.commit(parsed.value);
              }}
              min="1900-01-02"
              max={MAX_BIRTHDATE}
              style={{ ...INPUT_STYLE, flex: 1 }}
            />
            {birthdate.saved && <SavedCheck />}
          </span>
          {birthdate.error && <div style={ERROR_STYLE}>{birthdate.error}</div>}
        </div>

        <div>
          <label style={LABEL_STYLE}>Ruhepuls (bpm)</label>
          <span style={{ display: "inline-flex", alignItems: "center", width: "100%", gap: 6 }}>
            <input
              type="number"
              inputMode="numeric"
              step={1}
              min={30}
              max={100}
              value={restingHr.text}
              onChange={(e) => restingHr.setText(e.target.value)}
              onBlur={() => void restingHr.handleBlur()}
              style={{ ...INPUT_STYLE, flex: 1 }}
            />
            {restingHr.saved && <SavedCheck />}
          </span>
          {restingHr.error && <div style={ERROR_STYLE}>{restingHr.error}</div>}
        </div>

        <div>
          <label style={LABEL_STYLE}>Maximalherzfrequenz (bpm)</label>
          <span style={{ display: "inline-flex", alignItems: "center", width: "100%", gap: 6 }}>
            <input
              type="number"
              inputMode="numeric"
              step={1}
              min={100}
              max={230}
              value={hrMax.text}
              onChange={(e) => hrMax.setText(e.target.value)}
              onBlur={() => void hrMax.handleBlur()}
              style={{ ...INPUT_STYLE, flex: 1 }}
            />
            {hrMax.saved && <SavedCheck />}
          </span>
          {hrMax.error && <div style={ERROR_STYLE}>{hrMax.error}</div>}
        </div>

        <div>
          <label style={LABEL_STYLE}>Größe (cm)</label>
          <span style={{ display: "inline-flex", alignItems: "center", width: "100%", gap: 6 }}>
            <input
              type="number"
              inputMode="numeric"
              step={1}
              min={100}
              max={250}
              value={heightCm.text}
              onChange={(e) => heightCm.setText(e.target.value)}
              onBlur={() => void heightCm.handleBlur()}
              style={{ ...INPUT_STYLE, flex: 1 }}
            />
            {heightCm.saved && <SavedCheck />}
          </span>
          {heightCm.error && <div style={ERROR_STYLE}>{heightCm.error}</div>}
        </div>

        <div>
          <label style={LABEL_STYLE}>Gewicht (kg)</label>
          <span style={{ display: "inline-flex", alignItems: "center", width: "100%", gap: 6 }}>
            <input
              type="number"
              inputMode="decimal"
              step={0.1}
              min={0.1}
              max={399.9}
              value={weightKg.text}
              onChange={(e) => weightKg.setText(e.target.value)}
              onBlur={() => void weightKg.handleBlur()}
              style={{ ...INPUT_STYLE, flex: 1 }}
            />
            {weightKg.saved && <SavedCheck />}
          </span>
          {weightKg.error && <div style={ERROR_STYLE}>{weightKg.error}</div>}
        </div>

        <div>
          <label style={LABEL_STYLE}>Geschlecht</label>
          <span style={{ display: "inline-flex", alignItems: "center", width: "100%", gap: 6 }}>
            <select
              value={gender.value ?? ""}
              onChange={(e) => void gender.commit((e.target.value || null) as ProfileOwnFields["gender"])}
              style={{ ...INPUT_STYLE, flex: 1 }}
            >
              <option value="">— keine Angabe —</option>
              <option value="maennlich">männlich</option>
              <option value="weiblich">weiblich</option>
              <option value="divers">divers</option>
            </select>
            {gender.saved && <SavedCheck />}
          </span>
          {gender.error && <div style={ERROR_STYLE}>{gender.error}</div>}
        </div>
      </div>
    </div>
  );
}

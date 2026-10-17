/* ============================================================
   FEATURES/NUTRITION/INGREDIENTPICKER.TSX — Zutaten wählen
   (Fahrplan 25, S2a; Q6: nur Zutaten aus der Zutatentabelle)

   Suchfeld als Combobox (Pfeiltasten, Enter, Escape; Treffer als Listbox,
   Status per aria-live). Gewählte Zutaten stehen darunter als Zeilen mit
   Menge und Einheit; auf dem Handy brechen die Felder um. Die Suche selbst
   macht der Server, hier wird nur entprellt.
   ============================================================ */

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { MIN_SEARCH_CHARS, useIngredientSearch } from "../../api/hooks/useRecipeSubmission";
import type { IngredientHit } from "../../api/recipe-submission";
import { FIELD_ERROR_STYLE, FIELD_STYLE, GLASS, LABEL_STYLE, META_STYLE, TAP_BUTTON_STYLE, TAP_MIN, TEXT_STYLE } from "./nutrition-styles";

/** Formularzeile: Entwurf (Name/Menge/Einheit) plus die wählbaren Einheiten der Zutat. */
export interface IngredientRow {
  name: string;
  amount: string;
  unit: string;
  units: string[];
}

const DEBOUNCE_MS = 250;

interface Props {
  rows: IngredientRow[];
  onChange: (rows: IngredientRow[]) => void;
  errors?: string[];
}

export function IngredientPicker({ rows, onChange, errors }: Props) {
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFocus = useRef<number | null>(null);
  const listId = useId();
  const errorId = useId();
  const { hits, isFetching, isError, searched } = useIngredientSearch(query);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const showList = open && query.trim().length >= MIN_SEARCH_CHARS;

  function onInput(value: string) {
    setText(value);
    setOpen(true);
    setActive(0);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setQuery(value), DEBOUNCE_MS);
  }

  function pick(hit: IngredientHit) {
    pendingFocus.current = rows.length;
    onChange([...rows, { name: hit.name, amount: "", unit: hit.units[0] ?? "g", units: hit.units }]);
    if (timer.current) clearTimeout(timer.current);
    setText("");
    setQuery("");
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "ArrowDown" && hits.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === "ArrowUp" && hits.length > 0) {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && showList && hits[active]) {
      e.preventDefault(); // Enter wählt die Zutat, sendet nicht das Formular
      pick(hits[active]);
    }
  }

  function update(index: number, patch: Partial<IngredientRow>) {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function remove(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  let status = "";
  if (showList) {
    if (isFetching) status = "Suche …";
    else if (isError) status = "Die Suche ist fehlgeschlagen. Bitte versuche es gleich noch einmal.";
    else if (searched && hits.length === 0) status = `Keine Zutat zu „${query.trim()}“ gefunden.`;
    else if (searched) status = `${hits.length} Treffer`;
  }

  return (
    <fieldset style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }} aria-describedby={errors?.length ? errorId : undefined}>
      <legend style={LABEL_STYLE}>Zutaten</legend>

      <div style={{ position: "relative", margin: "0 0 10px" }}>
        <label htmlFor={`${listId}-input`} style={{ ...META_STYLE, display: "block" }}>
          Zutat suchen und hinzufügen
        </label>
        <input
          id={`${listId}-input`}
          type="search"
          role="combobox"
          aria-expanded={showList && hits.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && hits[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          placeholder="z. B. Haferflocken"
          value={text}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(true)}
          style={{ ...FIELD_STYLE, width: "100%", boxSizing: "border-box" }}
        />
        <ul
          id={listId}
          role="listbox"
          aria-label="Gefundene Zutaten"
          hidden={!(showList && hits.length > 0)}
          style={{
            ...GLASS,
            listStyle: "none",
            margin: "4px 0 0",
            padding: 4,
            position: "absolute",
            left: 0,
            right: 0,
            zIndex: 5,
            maxHeight: 280,
            overflowY: "auto",
            borderRadius: "var(--radius)",
            background: "var(--surface-tile)",
          }}
        >
          {hits.map((hit, i) => (
            <li
              key={hit.name}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()} // Fokus bleibt im Feld
              onClick={() => pick(hit)}
              onMouseEnter={() => setActive(i)}
              style={{
                minHeight: TAP_MIN,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "6px 12px",
                borderRadius: 8,
                cursor: "pointer",
                background: i === active ? "var(--hair)" : "transparent",
                color: "var(--ink)",
                fontSize: ".9rem",
              }}
            >
              <span>{hit.name}</span>
              <span style={{ ...META_STYLE, margin: 0 }}>{hit.category}</span>
            </li>
          ))}
        </ul>
        <p role="status" aria-live="polite" style={{ ...META_STYLE, margin: "6px 0 0", minHeight: "1em" }}>
          {status}
        </p>
      </div>

      {rows.length === 0 ? (
        <p style={TEXT_STYLE}>Noch keine Zutat gewählt.</p>
      ) : (
        <ul aria-label="Gewählte Zutaten" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
          {rows.map((row, i) => (
            <li
              key={`${row.name}-${i}`}
              style={{ ...GLASS, borderRadius: "var(--radius)", padding: "8px 12px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}
            >
              <span style={{ flex: "1 1 140px", minWidth: 0, color: "var(--ink)", fontSize: ".92rem", overflowWrap: "anywhere" }}>{row.name}</span>
              <input
                ref={(el) => {
                  if (el && pendingFocus.current === i) {
                    pendingFocus.current = null;
                    el.focus();
                  }
                }}
                aria-label={`Menge ${row.name}`}
                inputMode="decimal"
                placeholder="Menge"
                value={row.amount}
                onChange={(e) => update(i, { amount: e.target.value })}
                style={{ ...FIELD_STYLE, width: 92, boxSizing: "border-box" }}
              />
              <select
                aria-label={`Einheit ${row.name}`}
                value={row.unit}
                onChange={(e) => update(i, { unit: e.target.value })}
                style={{ ...FIELD_STYLE, width: 96 }}
              >
                {row.units.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              <button type="button" aria-label={`${row.name} entfernen`} style={TAP_BUTTON_STYLE} onClick={() => remove(i)}>
                Entfernen
              </button>
            </li>
          ))}
        </ul>
      )}

      {errors?.map((m) => (
        <p key={m} id={errorId} style={FIELD_ERROR_STYLE}>
          {m}
        </p>
      ))}
    </fieldset>
  );
}

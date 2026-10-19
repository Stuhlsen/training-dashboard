/* ============================================================
   FEATURES/NUTRITION/MYSUBMISSIONSVIEW.TSX — "Meine Einreichungen"
   (Fahrplan 25, S2b; Entscheidungen E14–E18, S1-8, S1-10)

   Eigene Rezepte mit Status (wartet / freigegeben / abgelehnt + Grund).
   Nur solange `pending` lassen sie sich bearbeiten oder zurückziehen.
   Zurückziehen ist nicht umkehrbar und fragt deshalb direkt in der Karte nach
   (kein Dialog). Gelesen wird über den Supabase-Adapter, geschrieben über
   admin-api (PUT/DELETE) — die RLS-Sperre für direkte Writes folgt später.
   ============================================================ */

import { useState, type CSSProperties } from "react";
import { GlassCard } from "../../components/GlassCard";
import { useMySubmissions } from "../../api/hooks/useMySubmissions";
import { useWithdrawRecipe } from "../../api/hooks/useRecipeSubmission";
import type { Recipe, RecipeStatus, ResultError } from "../../api/types";
import { SLOT_LABELS } from "./nutrition-week-model";
import { HEADING_STYLE, META_STYLE, TAP_BUTTON_STYLE, TEXT_STYLE } from "./nutrition-styles";

const CARD_STYLE: CSSProperties = { padding: "24px 28px", marginBottom: 16 };
const ITEM_STYLE: CSSProperties = {
  borderRadius: "var(--radius-lg)",
  border: "1px solid var(--hair)",
  background: "var(--surface-tile)",
  boxShadow: "var(--e2)",
  padding: "16px 18px",
  minWidth: 0,
};

/* Farbe = Bedeutung: wartet = Warnton, freigegeben = ok, abgelehnt = Gefahr. Der Status steht immer auch als Text. */
const STATUS: Record<RecipeStatus, { label: string; color: string }> = {
  pending: { label: "Wartet auf Prüfung", color: "var(--warn)" },
  approved: { label: "Freigegeben", color: "var(--ok)" },
  rejected: { label: "Abgelehnt", color: "var(--danger)" },
};

/** "2026-10-17T…" → "17.10.2026" */
const germanDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

function withdrawErrorText(error: ResultError): string {
  if (error.code === "VALIDATION") return "Das Rezept wurde inzwischen entschieden und lässt sich nicht mehr zurückziehen.";
  if (error.code === "NO_DATA") return "Dieses Rezept gibt es nicht mehr.";
  if (error.code === "NETWORK") return "Keine Verbindung zum Server. Bitte versuche es gleich noch einmal.";
  if (error.code === "TOKEN_INVALID") return "Du bist nicht angemeldet. Bitte melde dich neu an.";
  return error.message;
}

export function MySubmissionsView({ onEdit }: { onEdit: (recipe: Recipe) => void }) {
  const { recipes, isLoading, isError, refetch } = useMySubmissions();
  const { withdraw, isPending } = useWithdrawRecipe();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function doWithdraw(recipe: Recipe) {
    setNotice(null);
    setProblem(null);
    const result = await withdraw(recipe.id);
    setConfirmId(null);
    if (result.ok) {
      setNotice(`„${recipe.title}“ wurde zurückgezogen.`);
    } else {
      setProblem(withdrawErrorText(result.error));
      void refetch(); // der Status hat sich evtl. geändert
    }
  }

  if (isLoading) return <p style={META_STYLE}>Lade …</p>;

  if (isError) {
    return (
      <GlassCard style={CARD_STYLE}>
        <h2 style={HEADING_STYLE}>Meine Einreichungen</h2>
        <p role="alert" style={{ ...TEXT_STYLE, color: "var(--danger)" }}>
          Deine Einreichungen konnten nicht geladen werden.
        </p>
        <button type="button" style={TAP_BUTTON_STYLE} onClick={() => void refetch()}>
          Erneut versuchen
        </button>
      </GlassCard>
    );
  }

  if (recipes.length === 0) {
    return (
      <GlassCard style={CARD_STYLE}>
        <h2 style={HEADING_STYLE}>Meine Einreichungen</h2>
        {notice && (
          <p role="status" style={TEXT_STYLE}>
            {notice}
          </p>
        )}
        <p style={TEXT_STYLE}>Du hast noch kein Rezept eingereicht. Mit „Rezept einreichen“ oben legst du los.</p>
      </GlassCard>
    );
  }

  return (
    <section aria-label="Meine Einreichungen">
      {notice && (
        <p role="status" style={{ ...TEXT_STYLE, color: "var(--ink)", margin: "0 0 12px" }}>
          {notice}
        </p>
      )}
      {problem && (
        <p role="alert" style={{ ...TEXT_STYLE, color: "var(--danger)", margin: "0 0 12px" }}>
          {problem}
        </p>
      )}
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>
        {recipes.map((recipe) => {
          const status = STATUS[recipe.status];
          const confirming = confirmId === recipe.id;
          return (
            <li key={recipe.id} style={ITEM_STYLE}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8, justifyContent: "space-between" }}>
                <h3 style={{ ...HEADING_STYLE, margin: 0, fontSize: "1rem", overflowWrap: "anywhere" }}>{recipe.title}</h3>
                <span
                  style={{
                    border: `1px solid ${status.color}`,
                    color: status.color,
                    borderRadius: "var(--radius-sm)",
                    padding: "2px 8px",
                    fontSize: ".75rem",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {status.label}
                </span>
              </div>
              <p style={{ ...META_STYLE, margin: "6px 0 0" }}>
                Eingereicht am {germanDate(recipe.createdAt)} · {recipe.mealType.map((m) => SLOT_LABELS[m] ?? m).join(", ")}
              </p>
              {recipe.nutrition && (
                <p style={{ ...META_STYLE, margin: "2px 0 0" }}>
                  {Math.round(recipe.nutrition.kcal)} kcal · {Math.round(recipe.nutrition.protein)} g Eiweiß pro Portion
                </p>
              )}

              {recipe.status === "rejected" && (
                <p style={{ ...TEXT_STYLE, margin: "10px 0 0" }}>
                  {recipe.rejectionReason ? `Grund: ${recipe.rejectionReason}` : "Ohne Begründung abgelehnt."}
                </p>
              )}

              {recipe.status === "pending" &&
                (confirming ? (
                  <div role="group" aria-label={`Rückzug von ${recipe.title} bestätigen`} style={{ marginTop: 12 }}>
                    <p style={TEXT_STYLE}>Wirklich zurückziehen? Das lässt sich nicht rückgängig machen.</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                      <button
                        type="button"
                        disabled={isPending}
                        style={{ ...TAP_BUTTON_STYLE, borderColor: "var(--danger)", color: "var(--danger)" }}
                        onClick={() => void doWithdraw(recipe)}
                      >
                        {isPending ? "Ziehe zurück …" : "Ja, zurückziehen"}
                      </button>
                      <button type="button" disabled={isPending} style={TAP_BUTTON_STYLE} onClick={() => setConfirmId(null)}>
                        Abbrechen
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
                    <button
                      type="button"
                      aria-label={`${recipe.title} bearbeiten`}
                      style={TAP_BUTTON_STYLE}
                      onClick={() => onEdit(recipe)}
                    >
                      Bearbeiten
                    </button>
                    <button
                      type="button"
                      aria-label={`${recipe.title} zurückziehen`}
                      style={TAP_BUTTON_STYLE}
                      onClick={() => {
                        setNotice(null);
                        setProblem(null);
                        setConfirmId(recipe.id);
                      }}
                    >
                      Zurückziehen
                    </button>
                  </div>
                ))}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

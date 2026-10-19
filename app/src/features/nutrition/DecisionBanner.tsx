/* ============================================================
   FEATURES/NUTRITION/DECISIONBANNER.TSX — "Dein Rezept wurde entschieden"
   (Fahrplan 25, S2b; E12/E17: kein Benachrichtigungssystem)

   Steht über den Ansichten des Ernährungstabs. Die App merkt sich je Nutzer im
   localStorage, bei welchem Status sie den Hinweis schon gezeigt hat
   (core/recipe-decisions.js); "Verstanden" speichert das. Ohne localStorage
   (privates Fenster o. Ä.) bleibt der Hinweis bis zum Neuladen weg und kommt
   danach wieder — das ist ungefährlich.
   ============================================================ */

import { useState } from "react";
import { GlassCard } from "../../components/GlassCard";
import { useMySubmissions } from "../../api/hooks/useMySubmissions";
import { markSeen, parseSeen, seenKey, unseenDecisions, type SeenMap } from "../../core/recipe-decisions.js";
import { PRIMARY_BUTTON_STYLE, TEXT_STYLE } from "./nutrition-styles";

function readSeen(userId: string): SeenMap {
  try {
    return parseSeen(localStorage.getItem(seenKey(userId)));
  } catch {
    return {}; // localStorage nicht verfügbar
  }
}

function writeSeen(userId: string, seen: SeenMap) {
  try {
    localStorage.setItem(seenKey(userId), JSON.stringify(seen));
  } catch {
    /* ignorieren — nur eine Bequemlichkeit */
  }
}

export function DecisionBanner({ userId }: { userId: string }) {
  const { recipes } = useMySubmissions();
  // Beim Start einmal lesen (kein Effekt + setState — Lint-Regel react-hooks/set-state-in-effect)
  const [seen, setSeen] = useState<SeenMap>(() => readSeen(userId));
  const unseen = unseenDecisions(recipes, seen);

  if (unseen.length === 0) return null;

  function acknowledge() {
    const next = markSeen(seen, unseen);
    writeSeen(userId, next);
    setSeen(next);
  }

  return (
    <GlassCard style={{ padding: "20px 28px", marginBottom: 20 }}>
      <section role="status" aria-label="Neue Entscheidungen zu deinen Rezepten">
        <ul style={{ margin: "0 0 10px", paddingLeft: 20 }}>
          {unseen.map((r) => (
            <li key={r.id} style={TEXT_STYLE}>
              {r.status === "approved"
                ? `„${r.title}“ wurde freigegeben und ist jetzt für alle sichtbar.`
                : `„${r.title}“ wurde abgelehnt.${r.rejectionReason ? ` Grund: ${r.rejectionReason}` : ""}`}
            </li>
          ))}
        </ul>
        <p style={TEXT_STYLE}>Mehr dazu unter Rezepte → Meine Einreichungen.</p>
        <button type="button" style={PRIMARY_BUTTON_STYLE} onClick={acknowledge}>
          Verstanden
        </button>
      </section>
    </GlassCard>
  );
}

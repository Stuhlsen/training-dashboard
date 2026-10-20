/* ============================================================
   FEATURES/NUTRITION/DECISIONBANNER.TSX — "Dein Rezept wurde entschieden"
   (Fahrplan 25, S2b; E12/E17: kein Benachrichtigungssystem)

   Steht über den Ansichten des Ernährungstabs. Die App merkt sich je Nutzer im
   localStorage, bei welchem Status sie den Hinweis schon gezeigt hat
   (core/recipe-decisions.js); "Verstanden" speichert das. Ohne localStorage
   (privates Fenster o. Ä.) bleibt der Hinweis bis zum Neuladen weg und kommt
   danach wieder — das ist ungefährlich.

   Fahrplan 29 V3: Der gespeicherte Stand wird bei jeder neuen Rezeptliste frisch
   gelesen (decision-seen-storage.ts). So meldet das Banner die Sofort-Freigabe
   eines verifizierten Autors nicht: das Einreichformular markiert sie vorher als gesehen.
   ============================================================ */

import { useState } from "react";
import { GlassCard } from "../../components/GlassCard";
import { useMySubmissions } from "../../api/hooks/useMySubmissions";
import { markSeen, unseenDecisions, type SeenMap } from "../../core/recipe-decisions.js";
import { readSeen, writeSeen } from "./decision-seen-storage";
import { PRIMARY_BUTTON_STYLE, TEXT_STYLE } from "./nutrition-styles";

export function DecisionBanner({ userId }: { userId: string }) {
  const { recipes } = useMySubmissions();
  // Gespeicherter Stand: bei jedem Rendern frisch gelesen (ein paar Bytes, kein Effekt + setState — Lint-Regel
  // react-hooks/set-state-in-effect). So gilt ein Eintrag, den das Formular kurz vor dem Neuladen der Liste
  // gemerkt hat, schon beim ersten Rendern der neuen Liste.
  const stored = readSeen(userId);
  // Sitzungsstand: "Verstanden" gilt auch dann sofort, wenn der Browser nichts speichern lässt.
  const [dismissed, setDismissed] = useState<SeenMap>({});
  const seen = { ...stored, ...dismissed };
  const unseen = unseenDecisions(recipes, seen);

  if (unseen.length === 0) return null;

  function acknowledge() {
    writeSeen(userId, markSeen(seen, unseen));
    setDismissed(markSeen(dismissed, unseen));
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

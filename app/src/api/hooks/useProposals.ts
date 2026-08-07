/* ============================================================
   API/HOOKS/USEPROPOSALS.TS — Trainer-/Claude-Vorschläge

   Ersetzt state/proposals.js (Vanilla). Der Grundsatz bleibt: Annehmen
   wendet den Vorschlag über die BEREITS BESTEHENDEN Karten-Aktionen an
   (usePlanCards) statt die Kartenlogik — moved_from_date, week/phase-
   Übernahme, Ausfall-Reset — hier zu duplizieren. Erst danach wird der
   Status gesetzt und konkurrierende offene Vorschläge auf dieselbe Karte
   werden `stale`. Beides gehört in diese Schicht, nicht in die UI.
   ============================================================ */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  decideProposal,
  insertProposals,
  listProposals,
  markProposalsStale,
} from "../supabase/proposals";
import {
  useCancelPlanCard,
  useCreatePlanCard,
  useMovePlanCard,
  useUpdatePlanCard,
} from "./usePlanCards";
import { fetchAthleteProfileId } from "./useAthleteProfileId";
import { useAuthUserId } from "./useSession";
import { payloadToCardData } from "../../core/proposal-payload.js";
import { parseProposalImport } from "../../core/proposal-import-parser.js";
import { validateImport } from "../../core/proposal-validator.js";
import { qk } from "../keys";
import { catchResult, ResultError_, unwrap } from "../result";
import type { PlanCard, PlanCardInput, Proposal, ProposalInput, Result } from "../types";

const NOT_LOGGED_IN = { code: "UNKNOWN" as const, message: "Nicht eingeloggt" };
const NO_ACCOUNT = {
  code: "NO_DATA" as const,
  message: "Athlet hat (noch) keinen Supabase-Account",
};
const STALE = {
  code: "SCHEMA" as const,
  message: "Vorschlag ist veraltet — die Karte wurde seitdem geändert.",
};

/** Alle Vorschläge des Athleten, neueste zuerst — JEDER Status. Konsumenten
 *  filtern selbst (s. core/proposal-groups.js für die offene Review-Liste).
 *  @param options.enabled Standard `true`. `false` unterdrückt den Request
 *    ganz — für Aufrufer, die den Zähler nur bedingt brauchen (z.B. die
 *    Trainer-Leiste: kein Vorschläge-Request für JEDEN Planungstab-Besuch,
 *    nur wenn der Betrachter tatsächlich Trainer des Athleten ist). */
export function useProposals(athleteId: string, options?: { enabled?: boolean }) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: qk.proposals(athleteId),
    enabled: options?.enabled ?? true,
    queryFn: async (): Promise<Proposal[]> => {
      const profileId = await fetchAthleteProfileId(queryClient, athleteId);
      if (!profileId) throw new ResultError_(NO_ACCOUNT);
      return unwrap(await listProposals(profileId)).proposals;
    },
  });
}

/** Ersetzt die genannten Vorschläge im Cache (Statusfolgen nach einer
 *  Entscheidung), lässt alle anderen unangetastet. */
function useReplaceProposals(athleteId: string) {
  const queryClient = useQueryClient();
  // Key im Callback bilden, nicht als Dependency — s. useCardsSnapshot().
  return useCallback(
    (updated: Array<Pick<Proposal, "id"> & Partial<Proposal>>) => {
      const byId = new Map(updated.map((p) => [p.id, p]));
      queryClient.setQueryData<Proposal[]>(qk.proposals(athleteId), (proposals) =>
        (proposals ?? []).map((p) => {
          const next = byId.get(p.id);
          return next ? { ...p, ...next } : p;
        }),
      );
    },
    [queryClient, athleteId],
  );
}

function usePrependProposals(athleteId: string) {
  const queryClient = useQueryClient();
  return useCallback(
    (fresh: Proposal[]) => {
      queryClient.setQueryData<Proposal[]>(qk.proposals(athleteId), (proposals) => [
        ...fresh,
        ...(proposals ?? []),
      ]);
    },
    [queryClient, athleteId],
  );
}

/** Legt einen Vorschlag des menschlichen Trainers an — `source` liegt fest
 *  auf "trainer", `groupId` bleibt leer (Einzelvorschlag). */
export function useCreateTrainerProposal(athleteId: string) {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();
  const prepend = usePrependProposals(athleteId);

  const mutation = useMutation({
    mutationFn: async (input: Omit<ProposalInput, "source" | "groupId">) => {
      const profileId = await fetchAthleteProfileId(queryClient, athleteId);
      if (!profileId) throw new ResultError_(NO_ACCOUNT);
      return unwrap(
        await insertProposals(profileId, userId!, [
          { ...input, source: "trainer", groupId: null },
        ]),
      );
    },
    onSuccess: ({ proposals }) => prepend(proposals),
  });

  const create = useCallback(
    async (
      input: Omit<ProposalInput, "source" | "groupId">,
    ): Promise<Result<{ proposal: Proposal }>> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      const result = await catchResult(() => mutation.mutateAsync(input));
      if (!result.ok) return result;
      return { ok: true, proposal: result.proposals[0] };
    },
    [mutation, userId],
  );

  return { create, isPending: mutation.isPending };
}

/** Parst + validiert eine eingefügte Claude-Antwort — reiner
 *  Auswertungsschritt, schreibt NICHTS. Der Import-Dialog ruft nur dies auf
 *  und kennt die core-Module nicht direkt.
 *
 *  `knownCardIds` und `openProposals` kommen aus den bereits geladenen
 *  Caches (der Planungstab lädt beides ohnehin, bevor der Dialog aufgeht);
 *  letzteres trägt die Dedup-Erkennung, damit zwei Importe derselben
 *  Antwort nicht zwei offene Vorschläge erzeugen. */
export function usePreviewClaudeImport(athleteId: string) {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();

  return useCallback(
    (text: string) => {
      if (!userId) return { ok: false as const, error: NOT_LOGGED_IN };

      const parsed = parseProposalImport(text);
      if (!parsed.ok) return parsed;

      const cards = queryClient.getQueryData<PlanCard[]>(qk.planCards(athleteId)) ?? [];
      const proposals = queryClient.getQueryData<Proposal[]>(qk.proposals(athleteId)) ?? [];
      return validateImport(parsed.data, {
        ownAthleteId: userId,
        knownCardIds: new Set(cards.map((c) => c.id)),
        openProposals: proposals
          .filter((p) => p.status === "open" && p.source === "claude")
          .map((p) => ({ op: p.op, targetCardId: p.targetCardId, payload: p.payload })),
      });
    },
    [queryClient, athleteId, userId],
  );
}

/** Rohes Vorschlags-Element aus einem Claude-Import — im JSON-Schema-Format
 *  (snake_case), noch nicht in der Domänen-Shape. */
interface RawImportProposal {
  op: Proposal["op"];
  target_card_id?: string | null;
  target_updated_at?: string | null;
  payload: Record<string, unknown> | null;
  reason?: string | null;
}

/** Legt die validen Einträge eines Claude-Imports als offene Vorschläge an —
 *  derselbe Insert-Pfad wie beim menschlichen Trainer, aber `source:
 *  "claude"` und `created_by` = der importierende Athlet selbst
 *  (Selbst-Import). Alle Einträge EINES Imports teilen sich eine `groupId`,
 *  damit sie im Review als eine Runde erscheinen und über "Alle übernehmen"
 *  gemeinsam angenommen werden können. */
export function useImportClaudeProposals(athleteId: string) {
  const userId = useAuthUserId();
  const prepend = usePrependProposals(athleteId);

  const mutation = useMutation({
    mutationFn: async (valid: RawImportProposal[]) => {
      const groupId = crypto.randomUUID();
      const items: ProposalInput[] = valid.map((p) => ({
        op: p.op,
        targetCardId: p.target_card_id ?? null,
        targetUpdatedAt: p.target_updated_at ?? null,
        payload: p.payload,
        reason: p.reason ?? null,
        source: "claude",
        groupId,
      }));
      // athlete_id UND created_by sind hier beide die eigene Profil-UUID.
      return unwrap(await insertProposals(userId!, userId!, items));
    },
    onSuccess: ({ proposals }) => prepend(proposals),
  });

  const importProposals = useCallback(
    async (valid: RawImportProposal[]): Promise<Result<{ proposals: Proposal[] }>> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      if (!valid?.length) return { ok: true, proposals: [] };
      return catchResult(() => mutation.mutateAsync(valid));
    },
    [mutation, userId],
  );

  return { importProposals, isPending: mutation.isPending };
}

/** Wendet EINEN Vorschlag an — Kartenmutation zuerst, danach Status.
 *  Bricht ohne Statusänderung ab, wenn die Kartenänderung fehlschlägt: ein
 *  halb angenommener Vorschlag wäre schlimmer als ein nicht angenommener. */
export function useAcceptProposal(athleteId: string) {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();
  const replace = useReplaceProposals(athleteId);
  const { create: createCard } = useCreatePlanCard(athleteId);
  const { update: updateCard } = useUpdatePlanCard(athleteId);
  const { move: moveCard } = useMovePlanCard(athleteId);
  const { cancel: cancelCard } = useCancelPlanCard(athleteId);

  const accept = useCallback(
    async (proposal: Proposal): Promise<Result> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };

      // Veraltet-Erkennung: weicht target_updated_at vom aktuellen
      // updated_at der Zielkarte ab, wurde die Karte seit Erstellung des
      // Vorschlags geändert — ein Annehmen würde diese Änderung
      // stillschweigend überschreiben. Fehlt die Karte im geladenen Stand
      // (noch nicht geladen, inzwischen gelöscht), blockiert das NICHT; nur
      // ein tatsächlicher Abweichungsbeleg tut das.
      if (proposal.targetCardId && proposal.targetUpdatedAt) {
        const cards = queryClient.getQueryData<PlanCard[]>(qk.planCards(athleteId)) ?? [];
        const liveCard = cards.find((c) => c.id === proposal.targetCardId);
        if (liveCard && liveCard.updatedAt !== proposal.targetUpdatedAt) {
          await markProposalsStale([proposal.id]);
          replace([{ id: proposal.id, status: "stale" }]);
          return { ok: false, error: STALE };
        }
      }

      const payload = proposal.payload ?? {};
      let cardResult: Result<object>;
      if (proposal.op === "add" || proposal.op === "replace") {
        // Ohne plan_date lässt sich keine Karte schreiben (planned_date ist
        // NOT NULL). Der Import-Validator fängt das für Claude-Vorschläge
        // bereits ab; ein direkt angelegter Trainer-Vorschlag oder eine alte
        // Zeile könnte es aber verletzen — dann hier abbrechen, statt den
        // Fehler als generische DB-Meldung aus dem Insert zurückzubekommen.
        const cardData = payloadToCardData(payload);
        if (!cardData.date) {
          return {
            ok: false,
            error: { code: "SCHEMA", message: "Vorschlag ohne plan_date — keine Karte ableitbar." },
          };
        }
        // title/workout_type sind in der DB nullable — ein fehlendes Feld
        // im Payload wird zu null, nicht zu undefined: sonst ließe der
        // Adapter die Spalte beim Update ungeschrieben und ein alter Wert
        // bliebe stehen, obwohl der Vorschlag ihn nicht mehr vorsieht.
        const input: PlanCardInput = {
          ...cardData,
          date: cardData.date,
          name: cardData.name ?? null,
          typ: cardData.typ ?? null,
        };
        cardResult =
          proposal.op === "add"
            ? await createCard(input)
            : await updateCard(proposal.targetCardId!, input);
      } else if (proposal.op === "move") {
        const planDate = payload.plan_date;
        if (typeof planDate !== "string" || !planDate) {
          return {
            ok: false,
            error: { code: "SCHEMA", message: "Vorschlag ohne plan_date — kein Zieldatum." },
          };
        }
        cardResult = await moveCard(proposal.targetCardId!, planDate, proposal.reason || "");
      } else if (proposal.op === "cancel") {
        cardResult = await cancelCard(
          proposal.targetCardId!,
          (payload.reason as string) || proposal.reason || "",
        );
      } else {
        return {
          ok: false,
          error: { code: "SCHEMA", message: `Unbekannte Operation: ${proposal.op}` },
        };
      }
      if (!cardResult.ok) return cardResult;

      const decided = await decideProposal(proposal.id, "accepted");
      if (!decided.ok) return decided;

      // Konkurrierende offene Vorschläge auf dieselbe Karte werden stale —
      // nur relevant bei replace/move/cancel (add hat kein targetCardId).
      const proposals = queryClient.getQueryData<Proposal[]>(qk.proposals(athleteId)) ?? [];
      const competitorIds = proposal.targetCardId
        ? proposals
            .filter(
              (p) =>
                p.id !== proposal.id &&
                p.status === "open" &&
                p.targetCardId === proposal.targetCardId,
            )
            .map((p) => p.id)
        : [];
      const staleResult = await markProposalsStale(competitorIds);

      replace([decided.proposal, ...(staleResult.ok ? staleResult.proposals : [])]);
      return { ok: true };
    },
    [queryClient, athleteId, userId, replace, createCard, updateCard, moveCard, cancelCard],
  );

  return { accept };
}

/** "Alle übernehmen" für eine Gruppe — sequentiell, damit die
 *  Konkurrenz-Erkennung zwischen den Elementen greift, falls zwei
 *  Gruppenmitglieder dieselbe Karte anfassen. Bricht NICHT beim ersten
 *  Fehler ab: jedes Element bekommt seine eigene Chance, Fehlschläge werden
 *  gesammelt zurückgegeben. */
export function useAcceptGroup(athleteId: string) {
  const queryClient = useQueryClient();
  const { accept } = useAcceptProposal(athleteId);

  const acceptGroup = useCallback(
    async (groupId: string) => {
      const proposals = queryClient.getQueryData<Proposal[]>(qk.proposals(athleteId)) ?? [];
      const items = proposals.filter((p) => p.status === "open" && p.groupId === groupId);
      const results: Array<{ id: string; result: Result }> = [];
      for (const p of items) {
        results.push({ id: p.id, result: await accept(p) });
      }
      const failed = results.filter((r) => !r.result.ok);
      return { ok: failed.length === 0, results, failed };
    },
    [queryClient, athleteId, accept],
  );

  return { acceptGroup };
}

/** Ablehnen (fremder Vorschlag) bzw. Zurückziehen (eigener, per Claude-
 *  Import angelegter) — derselbe Adapter und dieselbe Spalten-Härtung, nur
 *  ein anderer Statuswert. "Ablehnen" passt semantisch nicht auf einen
 *  eigenen Vorschlag, den man sich anders überlegt hat. */
function useDecide(athleteId: string, status: "rejected" | "withdrawn") {
  const userId = useAuthUserId();
  const replace = useReplaceProposals(athleteId);

  const mutation = useMutation({
    mutationFn: async (id: string) => unwrap(await decideProposal(id, status)),
    onSuccess: ({ proposal }) => replace([proposal]),
  });

  return useCallback(
    async (id: string): Promise<Result<{ proposal: Proposal }>> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      return catchResult(() => mutation.mutateAsync(id));
    },
    [mutation, userId],
  );
}

export function useRejectProposal(athleteId: string) {
  return { reject: useDecide(athleteId, "rejected") };
}

export function useWithdrawProposal(athleteId: string) {
  return { withdraw: useDecide(athleteId, "withdrawn") };
}

/* ============================================================
   CORE/PROPOSAL-GROUPS.JS — offene Vorschläge gruppieren (kein DOM)
   (Vorschlags-Schema-Konzept §1/§5 — Mockup 2: Gruppen mit `group_id`
   erscheinen als eigene Zeile mit "Alle übernehmen", ungruppierte
   Vorschläge einzeln.)
   ============================================================ */

/** Nimmt alle Vorschläge, filtert auf `status === "open"` und gruppiert nach
 *  `groupId` — ungruppierte Vorschläge bilden je eine Einzel-Gruppe
 *  (`groupId: null, items: [eineKarte]`). Gruppen sind nach dem neuesten
 *  `createdAt` ihrer Mitglieder sortiert (neueste zuerst).
 *  @param {Array<{id: string, groupId: string|null, status: string, createdAt: string}>} proposals
 *  @returns {Array<{groupId: string|null, items: Array}>} */
export function groupOpenProposals(proposals) {
  const open = (proposals || []).filter((p) => p.status === "open");
  const order = [];
  const groups = new Map();
  for (const p of open) {
    const key = p.groupId || p.id;
    if (!groups.has(key)) {
      groups.set(key, { groupId: p.groupId ?? null, items: [] });
      order.push(key);
    }
    groups.get(key).items.push(p);
  }
  return order
    .map((key) => groups.get(key))
    .sort((a, b) => (b.items[0]?.createdAt || "").localeCompare(a.items[0]?.createdAt || ""));
}

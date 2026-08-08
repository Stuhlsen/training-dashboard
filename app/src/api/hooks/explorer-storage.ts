/* ============================================================
   API/HOOKS/EXPLORER-STORAGE.TS — geteilte localStorage-Hülle für den
   Explorer (docs/phase-5-konzept-explorer.md §10.3)

   EIN JSON-Objekt je Athlet (`explorer_<athleteId>`), das über die
   Etappen 8b-8e wächst ({ range } → { range, scenario } → { range,
   scenario, compareSlots }, künftig `linked`). read/write lesen bzw.
   schreiben das GANZE Objekt gemerged, nicht nur das jeweils betroffene
   Feld — ein einzelnes Feld überschreiben (wie die alte, lokale
   writeStoredRange() in useExplorerRange.ts es noch tat) würde beim
   nächsten Hook, der in denselben Schlüssel schreibt, die Felder der
   jeweils anderen Etappe stillschweigend löschen.
   ============================================================ */

export interface ExplorerStorage {
  range?: { fromISO: string; toISO: string };
  scenario?: { enabled: boolean; weekTssPct: number; restDays: number; rampRatePct: number };
  compareSlots?: {
    enabled: boolean;
    a: { from: string; to: string } | null;
    b: { from: string; to: string } | null;
  };
}

const storageKey = (athleteId: string) => `explorer_${athleteId}`;

export function readExplorerStorage(athleteId: string): ExplorerStorage {
  try {
    const raw = localStorage.getItem(storageKey(athleteId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as ExplorerStorage) : {};
  } catch {
    return {};
  }
}

export function writeExplorerStorage(athleteId: string, patch: ExplorerStorage) {
  const current = readExplorerStorage(athleteId);
  localStorage.setItem(storageKey(athleteId), JSON.stringify({ ...current, ...patch }));
}

import { QueryClient } from "@tanstack/react-query";

/** Zentrale QueryClient-Fabrik (Etappe 2b).
 *
 *  Als Funktion statt als Modul-Singleton, damit jeder Test seinen eigenen,
 *  leeren Cache bekommt — ein geteilter Client würde Query-Ergebnisse
 *  zwischen Testfällen durchreichen und genau die Athleten-Verwechslung
 *  wieder möglich machen, die die Query-Keys eigentlich ausschließen.
 *
 *  `retry: false`: die Adapter geben Fehler bereits als `{ ok: false, error }`
 *  zurück (Result-Konvention, s. AGENTS.md) statt zu werfen — React Query
 *  sieht sie also gar nicht als Fehler und würde ohnehin nichts wiederholen.
 *  Explizit gesetzt, damit ein künftiger werfender Pfad (z.B. der JSON-Loader)
 *  nicht stillschweigend dreimal lädt. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        // Karten/Events ändern sich nur durch eigene Mutationen oder den
        // 6h-Cron — ein Refetch bei jedem Tab-Wechsel wäre reine Last.
        refetchOnWindowFocus: false,
        staleTime: 30_000,
      },
      mutations: { retry: false },
    },
  });
}

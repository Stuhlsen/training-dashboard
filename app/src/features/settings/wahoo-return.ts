/* Auswertung der Rückkehr-Adresse nach dem Wahoo-Verbinden
   (admin-api /api/wahoo/callback → ?wahoo=connected | ?wahoo=error&reason=…). */

export interface WahooReturn {
  kind: "connected" | "error";
  message: string;
}

/** Query-Parameter, die nach dem Anzeigen aus der Adresse entfernt werden. */
export const WAHOO_RETURN_PARAMS = ["wahoo", "reason"] as const;

const REASON_MESSAGES: Record<string, string> = {
  state_invalid: "Die Verbindung konnte nicht bestätigt werden. Bitte noch einmal starten.",
  state_expired: "Die Verbindung hat zu lange gedauert. Bitte noch einmal starten.",
  denied: "Der Zugriff wurde bei Wahoo nicht erlaubt.",
  missing_code: "Wahoo hat keinen Code mitgeschickt. Bitte noch einmal starten.",
  exchange: "Wahoo hat die Anmeldung nicht angenommen. Bitte später noch einmal versuchen.",
  storage: "Die Verbindung konnte nicht gespeichert werden. Bitte später noch einmal versuchen.",
};

const FALLBACK_MESSAGE = "Verbinden mit Wahoo ist fehlgeschlagen. Bitte noch einmal versuchen.";

export function parseWahooReturn(params: URLSearchParams): WahooReturn | null {
  const state = params.get("wahoo");
  if (state === "connected") return { kind: "connected", message: "Wahoo ist verbunden." };
  if (state !== "error") return null;
  const reason = params.get("reason") ?? "";
  return { kind: "error", message: REASON_MESSAGES[reason] ?? FALLBACK_MESSAGE };
}

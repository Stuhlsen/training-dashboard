import { Link } from "react-router-dom";
import { GlassCard } from "../../components/GlassCard";
import {
  AWAITING_SYNC_TEXT,
  MISSING_CREDENTIALS_TEXT,
  NO_TRAINING_DATA_TEXT,
  type NoDataReason,
} from "./no-data-reason";

/** Leer-Hinweis für Seiten, die Trainingsdaten brauchen (Hero, Fahrtenbuch,
 *  Analyse), wenn der aktive Eintrag keine Datei hat und die Tabellen leer
 *  sind — Accounts ohne Platz in `config.ts`. */
export function NoTrainingData({ reason = "unknown" }: { reason?: NoDataReason }) {
  return (
    <GlassCard style={{ maxWidth: 560, margin: "32px auto", padding: "24px 28px" }}>
      <p role="status" style={{ margin: 0, color: "var(--ink-2)", fontSize: ".95rem", lineHeight: 1.5 }}>
        {reason === "awaiting-sync" ? AWAITING_SYNC_TEXT : NO_TRAINING_DATA_TEXT}
        {reason === "missing-credentials" && (
          <>
            {" "}
            {MISSING_CREDENTIALS_TEXT}{" "}
            <Link to="/app/settings#sec-daten" style={{ color: "var(--ss)" }}>
              Zu den Einstellungen
            </Link>
          </>
        )}
      </p>
    </GlassCard>
  );
}

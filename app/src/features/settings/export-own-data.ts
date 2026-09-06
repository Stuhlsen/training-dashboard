/* ============================================================
   FEATURES/SETTINGS/EXPORT-OWN-DATA.TS — „Meine Daten herunterladen"
   (Idee 10, Datenschutz & Account-Portabilität)

   Orchestrator, kein Hook: einmaliger Klick-Trigger, keine gecachte
   Query. Lädt alle eigenen Zeilen über die bestehenden Adapter (kein
   neuer Supabase-Zugriffspfad, RLS deckt die Zeilengrenze ab), baut mit
   `buildExportManifest()` die Dateiliste, zippt sie per fflate (dynamisch
   importiert → eigener Chunk, nicht im Haupt-Bundle) und löst einen
   normalen Browser-Download aus (Blob + <a download>, keine sandboxed
   Artifact-API).

   Ganz-oder-gar-nicht für die SUPABASE-Konto-Daten: `unwrap()` wirft beim
   ersten `{ ok: false }`, `catchResult()` fängt es zu einem Result — ein
   Teil-Export der Konto-Daten, der vollständig aussieht, wäre eine
   DSGVO-Falle. AUSNAHME: die abgeleiteten `data/*.json`-Lesedaten sind
   öffentlich, reproduzierbar und nicht autoritativ — scheitert ihr Laden
   (WLAN-Wackler), wird der Ordner `trainingsdaten/` weggelassen und der
   Grund im README vermerkt, statt den ganzen Export zu verwerfen.

   Datenschutz (AGENTS.md, höchste Priorität): die groben
   Standortkoordinaten UND der intervals.icu-API-Key werden hier NIE
   geladen — `konto/sync-konfiguration.json` trägt nur einen Hinweistext,
   dass diese Daten existieren und serverseitig bleiben.

   Umfang „ziele-aktiv": `getGoals()` filtert serverseitig auf
   `is_active` — es gibt keinen Lesepfad für deaktivierte Ziele. Im ZIP
   deshalb als „ziele-aktiv.json" benannt, damit das nicht als „alle
   Ziele" missverstanden wird. Analog `trainingsplan-aktiv.json`
   (`listActiveTrainingPlan()`).
   ============================================================ */

import { ATHLETES } from "../../config";
import { getProfile } from "../../api/supabase/profiles";
import { getGoals } from "../../api/supabase/goals";
import { listEvents } from "../../api/supabase/events";
import { listPlanCards } from "../../api/supabase/plan-cards";
import { getRange } from "../../api/supabase/wellbeing";
import { getFtpHistory } from "../../api/supabase/ftp-history";
import { listProposals } from "../../api/supabase/proposals";
import { listActiveTrainingPlan } from "../../api/supabase/training-plans";
import { getAthleteFormats } from "../../api/supabase/athlete-formats";
import { getHeroLayout } from "../../api/supabase/hero-layout";
import { getLadderHistory } from "../../api/supabase/ladder";
import { getExportPrefs } from "../../api/supabase/export-prefs";
import { loadAthleteData } from "../../api/pipeline";
import { catchResult, unwrap } from "../../api/result";
import { localISODate } from "../../core/format.js";
import { buildExportManifest, type ExportFile } from "./export-manifest";
import type { Result } from "../../api/types";

/** Hinweis-Text für `konto/sync-konfiguration.json` — die Datei trägt
 *  bewusst KEINE Koordinaten und KEINEN Key, nur den Grund dafür. */
const SYNC_CONFIG_HINWEIS =
  "Aus Datenschutzgründen enthält dieser Export weder den intervals.icu-API-Key " +
  "noch die groben Standortkoordinaten. Beide liegen ausschließlich serverseitig " +
  "(Tabelle athlete_sync_config, owner-only) und verlassen den Server nicht.";

async function collectOwnData(userId: string): Promise<ExportFile[]> {
  const profile = unwrap(await getProfile(userId)).profile;
  // Auflösung Login → Pipeline-Athlet wie überall: display_name →
  // ATHLETES[].name → interne ID.
  const athleteId = ATHLETES.find((a) => a.name === profile.displayName)?.id ?? null;

  // Alles parallel: die 10 Konto-Abfragen, die 3 Hero-Layout-Tabs und
  // (falls zugeordnet) die Lesedaten-Pipeline. Die Pipeline geht bewusst
  // OHNE `unwrap()` in den Batch — ihr Fehler soll den Export nicht werfen.
  const [main, heroRows, readDataRes] = await Promise.all([
    Promise.all([
      getGoals(userId).then(unwrap),
      listEvents(userId).then(unwrap),
      listPlanCards(userId).then(unwrap),
      getRange(userId, "2020-01-01", localISODate()).then(unwrap),
      getFtpHistory(userId).then(unwrap),
      listProposals(userId).then(unwrap),
      listActiveTrainingPlan(userId).then(unwrap),
      getAthleteFormats(userId).then(unwrap),
      getLadderHistory(userId).then(unwrap),
      getExportPrefs(userId).then(unwrap),
    ]),
    Promise.all(ATHLETES.map((a) => getHeroLayout(userId, a.id).then(unwrap))),
    athleteId ? loadAthleteData(athleteId) : Promise.resolve(null),
  ]);

  const [goals, events, planCards, checkins, ftp, proposals, plan, formats, ladder, prefs] = main;

  // Hero-Layout: eine Zeile je Athleten-Tab (Migration 0033), leere Tabs weg.
  const heroLayout = heroRows
    .map((r, idx) => ({ athleteTab: ATHLETES[idx].id, layout: r.layout }))
    .filter((h) => h.layout);

  let trainingsdaten = null;
  let trainingsdatenError: string | null = null;
  if (readDataRes) {
    if (readDataRes.ok) {
      const d = readDataRes.data;
      trainingsdaten = {
        rides: d.rides,
        wellness: d.wellness,
        sonstige: {
          wellnessMeta: d.wellnessMeta,
          powerCurves: d.powerCurves,
          powerCurveBlocks: d.powerCurveBlocks,
          plannedSessions: d.plannedSessions,
          adjustments: d.adjustments,
          forecast: d.forecast,
          updated: d.updated,
          warnings: d.warnings,
        },
      };
    } else {
      trainingsdatenError = readDataRes.error.message;
    }
  }

  return buildExportManifest({
    exportedAt: new Date().toISOString(),
    displayName: profile.displayName,
    konto: {
      profil: profile,
      zieleAktiv: goals.goals,
      events: events.events,
      trainingskarten: planCards.cards,
      befinden: checkins.checkins,
      ftpVerlauf: ftp.entries,
      vorschlaege: proposals.proposals,
      trainingsplanAktiv: plan.plan,
      formate: formats.athleteFormats,
      heroLayout,
      leiterVerlauf: ladder.history,
      exportEinstellungen: { preset: prefs.preset, eventId: prefs.eventId },
      syncKonfiguration: { _hinweis: SYNC_CONFIG_HINWEIS },
    },
    trainingsdaten,
    trainingsdatenError,
  });
}

/** fflate erst beim Klick nachladen — eigener Chunk, nicht im
 *  Settings-/Haupt-Bundle. `strToU8`/`zipSync` sind synchron und für die
 *  ~17 kleinen JSON-Dateien dieses Exports mehr als schnell genug. */
async function zipFiles(files: ExportFile[]): Promise<Uint8Array> {
  const { strToU8, zipSync } = await import("fflate");
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) entries[f.path] = strToU8(f.content);
  return zipSync(entries);
}

function triggerDownload(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as BlobPart], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke erst im nächsten Tick — manche Browser (Safari/WebKit) starten
  // den Blob-Read asynchron nach click(); ein sofortiges Revoke bricht den
  // Download dann ab.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Baut den Export und startet den Download. Result-Rückgabe wie die
 *  Adapter selbst — der Aufrufer prüft `result.ok` wie überall sonst. */
export async function exportOwnData(userId: string): Promise<Result> {
  return catchResult(async () => {
    const files = await collectOwnData(userId);
    const bytes = await zipFiles(files);
    triggerDownload(bytes, `training-dashboard-export-${localISODate()}.zip`);
    return {};
  });
}

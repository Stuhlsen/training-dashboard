/* ============================================================
   CORE/EXPORT-BRIEFING.JS — Claude-Trainer-Export: Briefing + Prompt-Vorlage
   (kein DOM)
   (Phase 4 — Export/Import-Workflow-Konzept §2, Vorschlags-Schema-Konzept §6)

   Baut aus bereits geladenen Domänenobjekten (state/ zieht sie zusammen,
   ruft nur diese reine Funktion auf) das Markdown-Briefing FÜR DEN MENSCHEN
   im Loop plus einen maschinenlesbaren JSON-Anhang mit den Karten-IDs
   (Schema-Konzept §6), setzt das Ergebnis in die feste Prompt-Vorlage aus
   docs/phase-4-prompt-vorlage-claude-trainer.md ein.

   PROMPT_TEMPLATE ist hier eine Konstante (nicht aus der .md-Datei
   nachgeladen) — Vorlage und Validator (core/proposal-validator.js) sollen
   laut eigener Aussage der Vorlage "im selben Commit" geändert werden;
   `tests/export-briefing.test.js` hält beide über eine Fixture synchron.
   ============================================================ */

import { localISODate, diffDays } from "./format.js";
import { computeZones } from "./zones.js";
import { KNOWN_PLAN_TYPES } from "./plan-config.js";

export const SCHEMA_VERSION = 1;

/** Feste Prompt-Vorlage (Stand schema_version 1) — Text 1:1 aus
 *  docs/phase-4-prompt-vorlage-claude-trainer.md zwischen den VORLAGE-
 *  ANFANG/ENDE-Markern. `{{BRIEFING}}` wird durch buildBriefingMarkdown()
 *  ersetzt. */
export const PROMPT_TEMPLATE = `Du bist mein Radsport-Trainer. Unten findest du mein aktuelles Trainings-Briefing:
Profil (FTP, Zonen, Ziele), anstehende Events mit Priorität, meinen Trainingsplan
(Karten mit \`id\` und \`updated_at\`), die Ist-Fahrten der letzten Wochen (TSS,
RPE/Feel), meinen Befinden-Verlauf, die aktuelle Form (CTL/ATL/TSB) samt Projektion
und die offene Konfliktliste des Planers.

**Deine Aufgabe:**
1. Analysiere Form, Plan und Events. Prüfe insbesondere: Passt die Belastungskurve
   zum nächsten priorisierten Event (TSB-Zielfenster laut Briefing)? Gibt es
   Konflikte aus der Liste, die ein Umbau lösen würde? Deckt sich der Plan mit
   meinem Befinden- und RPE-Verlauf?
2. Schlage Änderungen nur vor, wo sie einen klaren Zweck haben. Wenige gute
   Vorschläge sind besser als viele kleine. Wenn der Plan passt, ist „keine
   Änderung" eine vollwertige Antwort.
3. Erkläre zuerst in normaler Sprache deine Einschätzung und was du warum ändern
   würdest (das lese ich). Gib **danach** deine Vorschläge als JSON-Block (den
   liest die App).

**Regeln für den JSON-Block (werden maschinell geprüft — Abweichungen führen zur
Ablehnung des Imports):**
- Exakt ein \`\`\`json-Codeblock am Ende deiner Antwort, sonst kein JSON in der Antwort.
- Struktur: \`{ "schema_version": 1, "athlete": "<aus dem Briefing>", "source":
  "claude", "proposals": [ … ] }\`. Keine zusätzlichen Felder, nirgends.
- Erlaubte \`op\`-Werte: \`add\`, \`replace\`, \`move\`, \`cancel\`. Kein Löschen — wenn eine
  Einheit entfallen soll, nutze \`cancel\` mit Begründung.
- \`target_card_id\` und \`target_updated_at\` übernimmst du **unverändert** aus dem
  Briefing der jeweiligen Karte. Erfinde niemals IDs; Karten ohne ID im Briefing
  kannst du nicht ändern (nur \`add\` neuer Karten ist ohne ID möglich).
- \`plan_date\` nie in der Vergangenheit; Datumsformat \`YYYY-MM-DD\`.
- \`type\` nur aus der Typenliste im Briefing; \`target_tss\` realistisch (0–400).
- Für pushbare Intervall-Einheiten gib im \`payload.workout\` die Struktur aus dem
  Briefing-Beispiel an (inkl. \`pct\` als [von, bis] in %FTP) — ohne \`pct\` kann die
  Einheit nicht auf den Radcomputer geladen werden.
- Jeder Vorschlag trägt einen kurzen \`reason\` (ein Satz, konkret: „TSB am Eventtag
  sonst −4, Ziel +5…+20", nicht „zur Optimierung").
- \`reason\` ist auf der Website **öffentlich sichtbar**. Formuliere ausschließlich
  lastbasiert (TSS, TSB, Plan, Events) — nie mit Bezug auf Befinden, Schlaf,
  Gesundheit oder Persönliches, auch wenn das Briefing solche Daten enthält.
- Wenn du nichts ändern würdest: \`"proposals": []\` — und im Text davor, warum.

**Wichtige Grundsätze:**
- Sicherheit vor Fortschritt: Bei Anzeichen von Überlastung, Krankheit oder
  auffälligem Befinden-Verlauf im Briefing schlage Entlastung vor — keine
  zusätzliche Intensität. Bei gesundheitlichen Warnsignalen (z. B. Schmerzen,
  ungewöhnlicher Ruhepuls über Tage) empfiehl ärztliche Abklärung statt Training.
- Respektiere die Ereignis-Prioritäten: A-Events bestimmen die Form-Spitze,
  B-Events werden untergeordnet.
- Maximal ein harter Block pro Vorschlagsrunde umbauen — ich will deine Änderungen
  nachvollziehen können, nicht einen komplett neuen Plan bekommen.
- Du siehst nur, was im Briefing steht. Wenn dir eine wichtige Information fehlt,
  benenne sie im Text, statt Annahmen ins JSON zu schreiben.

Hier ist mein Briefing:

{{BRIEFING}}`;

function mdEscapeCell(v) {
  if (v == null) return "–";
  return String(v).replace(/\|/g, "/");
}

/** Markdown-Briefing für den Menschen + maschinenlesbarer JSON-Anhang mit
 *  Karten-IDs (Schema-Konzept §6). Reine Funktion — nimmt fertig geladene
 *  Domänenobjekte entgegen, kein fetch/document.
 *  @param {{
 *    athleteId: string, displayName?: string, ftp?: number|null, ftpGoal?: number|null,
 *    dataSources?: string[],
 *    events?: Array<{eventDate:string, title?:string, type?:string, priority?:string}>,
 *    planCards?: Array<{id:string, date:string, name?:string, typ?:string, tssPlanned?:number|null, updatedAt?:string}>,
 *    actuals?: import("../types.js").Ride[],
 *    wellbeing?: Array<{date:string, energy?:number, muscleFeel?:number, mood?:number, note?:string|null}>,
 *    projection?: {asOf:string, startCtl:number, startAtl:number, days:Array<{date:string,ctl:number,atl:number,tsb:number}>}|null,
 *    conflicts?: Array<{rule:string, severity:string, message:string}>,
 *    today?: string,
 *  }} ctx
 *  @returns {string} */
export function buildBriefingMarkdown({
  athleteId,
  displayName = "Athlet",
  ftp = null,
  ftpGoal = null,
  dataSources = [],
  events = [],
  planCards = [],
  actuals = [],
  wellbeing = [],
  projection = null,
  conflicts = [],
  today,
} = {}) {
  const todayIso = today ?? localISODate();
  const zones = ftp ? computeZones(ftp) : [];
  const lines = [];

  lines.push(`# Trainings-Briefing — ${displayName}`);
  lines.push("");
  lines.push("## Profil");
  lines.push(`- FTP: ${ftp ?? "–"} W${ftpGoal ? ` (Ziel: ${ftpGoal} W)` : ""}`);
  if (zones.length) {
    lines.push(`- Zonen: ${zones.map((z) => `${z.label} ${z.vonW}–${z.bisW}W`).join(" · ")}`);
  }
  if (dataSources.length) lines.push(`- Datenquellen: ${dataSources.join(", ")}`);
  lines.push("");

  lines.push("## Anstehende Events");
  const upcoming = events.filter((e) => e.eventDate >= todayIso).sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  if (!upcoming.length) {
    lines.push("Keine Events erfasst.");
  } else {
    for (const e of upcoming) {
      const days = diffDays(e.eventDate, todayIso);
      lines.push(`- ${e.eventDate} ${e.title || "(ohne Titel)"}${e.priority ? ` (${e.priority})` : ""} — noch ${days} Tage`);
    }
  }
  lines.push("");

  lines.push("## Typenliste (nur diese Werte für `type` verwenden)");
  lines.push(KNOWN_PLAN_TYPES.join(", "));
  lines.push("");

  lines.push("## Trainingsplan (ab heute)");
  if (!planCards.length) {
    lines.push("Keine geplanten Karten im Horizont.");
  } else {
    lines.push("| Datum | Titel | Typ | Ziel-TSS | Karten-ID | Zuletzt geändert |");
    lines.push("|---|---|---|---|---|---|");
    for (const c of planCards) {
      lines.push(
        `| ${c.date} | ${mdEscapeCell(c.name)} | ${mdEscapeCell(c.typ)} | ${c.tssPlanned ?? "–"} | ${c.id} | ${mdEscapeCell(c.updatedAt)} |`
      );
    }
  }
  lines.push("");

  lines.push("## Ist-Fahrten (letzte Wochen)");
  if (!actuals.length) {
    lines.push("Keine Fahrten im Zeitraum.");
  } else {
    lines.push("| Datum | Typ | TSS | RPE | Feel |");
    lines.push("|---|---|---|---|---|");
    for (const r of actuals) {
      lines.push(`| ${r.dateISO} | ${mdEscapeCell(r.typ)} | ${r.tss ?? "–"} | ${r.rpe ?? "–"} | ${r.feelIcu ?? "–"} |`);
    }
  }
  lines.push("");

  lines.push("## Befinden-Verlauf (letzte Wochen)");
  if (!wellbeing.length) {
    lines.push("Keine Check-ins im Zeitraum.");
  } else {
    lines.push("| Datum | Energie | Muskeln | Stimmung | Notiz |");
    lines.push("|---|---|---|---|---|");
    for (const w of wellbeing) {
      lines.push(`| ${w.date} | ${w.energy ?? "–"} | ${w.muscleFeel ?? "–"} | ${w.mood ?? "–"} | ${mdEscapeCell(w.note)} |`);
    }
  }
  lines.push("");

  lines.push("## Form (CTL/ATL/TSB)");
  if (projection) {
    // projection.asOf ist der Anker (letzte Fahrt mit TSB-Signal, core/pmc.js::
    // currentPmc), NICHT "heute" — startCtl/startAtl sind aber bereits lastfrei
    // bis todayIso fortgeschrieben (dieselben Zahlen, die auch der Analyse-Tab
    // zeigt). "Heute" muss deshalb immer todayIso tragen, sonst widerspricht
    // sich der JSON-Anhang (today) mit diesem Abschnitt im selben Briefing —
    // per Nachtest bestätigter Bug, s. docs/offene-punkte.md. Weicht der Anker
    // vom heutigen Tag ab, macht ein Hinweis das transparent (Konvention aus
    // ui/analysis.js/ui/charts/pmc.js: "Stand …, fortgeschrieben").
    const staleness =
      projection.asOf !== todayIso
        ? ` (Datenstand ${projection.asOf}, seither ohne neue Fahrt fortgeschrieben)`
        : "";
    lines.push(`- Heute (${todayIso}): CTL ${projection.startCtl} · ATL ${projection.startAtl}${staleness}`);
    const last = projection.days[projection.days.length - 1];
    if (last) {
      lines.push(`- Projektion Horizont-Ende (${last.date}): CTL ${last.ctl} · ATL ${last.atl} · TSB ${last.tsb}`);
    }
  } else {
    lines.push("Keine Projektion verfügbar.");
  }
  lines.push("");

  lines.push("## Offene Konflikte");
  if (!conflicts.length) {
    lines.push("Keine.");
  } else {
    for (const c of conflicts) lines.push(`- ${c.rule} (${c.severity}): ${c.message}`);
  }
  lines.push("");

  lines.push("## Maschinenlesbarer Anhang");
  lines.push("```json");
  lines.push(
    JSON.stringify(
      {
        schema_version: SCHEMA_VERSION,
        athlete: athleteId,
        today: todayIso,
        ftp,
        knownTypes: KNOWN_PLAN_TYPES,
        cards: planCards.map((c) => ({
          id: c.id,
          updated_at: c.updatedAt ?? null,
          plan_date: c.date,
          title: c.name ?? null,
          type: c.typ ?? null,
        })),
      },
      null,
      2
    )
  );
  lines.push("```");

  return lines.join("\n");
}

/** Fertiger, direkt einfügbarer Text — Prompt-Vorlage mit eingesetztem
 *  Briefing (Konzept §2: "eine Zeichenkette, keine zwei Teile"). */
export function buildExportText(ctx) {
  return PROMPT_TEMPLATE.replace("{{BRIEFING}}", buildBriefingMarkdown(ctx));
}

/** Dateiname für den Download-Weg (Konzept §2). @param {string} athleteId
 *  @param {string} [today] @returns {string} */
export function exportFileName(athleteId, today) {
  const todayIso = today ?? localISODate();
  return `claude-briefing-${athleteId}-${todayIso}.md`;
}

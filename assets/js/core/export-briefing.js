/* ============================================================
   CORE/EXPORT-BRIEFING.JS — Claude-Trainer-Export: Briefing + Prompt-Vorlage
   (kein DOM)
   (Phase 4 — Export/Import-Workflow-Konzept §2, Vorschlags-Schema-Konzept §6,
   Export-Richtungsvorgabe-Konzept R1/R4/R7)

   Baut aus bereits geladenen Domänenobjekten (state/ zieht sie zusammen,
   ruft nur diese reine Funktion auf) das Markdown-Briefing FÜR DEN MENSCHEN
   im Loop plus einen maschinenlesbaren JSON-Anhang mit den Karten-IDs
   (Schema-Konzept §6), setzt das Ergebnis in die feste Prompt-Vorlage aus
   docs/phase-4-prompt-vorlage-claude-trainer.md ein.

   PROMPT_RUMPF + AUFTRAG_VARIANTEN sind hier Konstanten (nicht aus der
   .md-Datei nachgeladen) — Vorlage und Validator (core/proposal-validator.js)
   sollen laut eigener Aussage der Vorlage "im selben Commit" geändert werden.
   Frühere Fassung dieses Kommentars behauptete, ein Test halte
   PROMPT_TEMPLATE bytegleich gegen die Doku synchron — das stimmte nie
   (tests/export-briefing.test.js prüft nur Regex-Muster im zusammengesetzten
   Output, nie die Vorlage selbst). tests/export-briefing-consistency.test.js
   übernimmt das jetzt tatsächlich: Rumpf + jede der fünf Auftragsvarianten
   wörtlich gegen die Doku (Export-Richtungsvorgabe-Konzept R4).
   ============================================================ */

import { localISODate, diffDays } from "./format.js";
import { computeZones } from "./zones.js";
import { KNOWN_PLAN_TYPES, CONFLICT_THRESHOLDS } from "./plan-config.js";
import { estimateTss } from "./projection.js";

// TSB-Zielfenster je Event-Priorität (K-EVENT, core/conflicts.js) — hier
// eigenständig statt importiert, weil core/conflicts.js dieselbe Konstante
// modulprivat hält (nur 2 Einträge, kein Re-Export-Aufwand wert).
const EVENT_PRIORITY_LABEL = { main: "Hauptziel", secondary: "Nebenziel" };
const EVENT_TSB_WINDOW = {
  main: CONFLICT_THRESHOLDS.eventWindowMain,
  secondary: CONFLICT_THRESHOLDS.eventWindowSecondary,
};

export const SCHEMA_VERSION = 1;

/** Max. Länge des Zusatzkontext-Freitextfelds (R2). Das Textarea-Element
 *  (ui/export-panel.js) begrenzt das schon per `maxlength`, dieser Cap hier
 *  ist der Schutz auf Datenebene — greift auch, falls extraContext einmal
 *  nicht über dieses eine Feld hereinkommt. */
export const EXTRA_CONTEXT_MAX_LENGTH = 500;

/** Preset-unabhängiger Rumpf der Prompt-Vorlage (Stand schema_version 1) —
 *  Text 1:1 aus docs/phase-4-prompt-vorlage-claude-trainer.md zwischen den
 *  RUMPF-ANFANG/ENDE-Markern. `{{AUFTRAG}}` wird durch buildAuftragBlock()
 *  ersetzt (Export-Richtungsvorgabe-Konzept R4), `{{BRIEFING}}` durch
 *  buildBriefingMarkdown(). */
export const PROMPT_RUMPF = `Du bist mein Radsport-Trainer. Unten findest du mein aktuelles Trainings-Briefing:
Profil (FTP, Zonen, Ziele), anstehende Events mit Priorität, meinen Trainingsplan
(Karten mit \`id\` und \`updated_at\`), die Ist-Fahrten der letzten Wochen (TSS,
RPE/Feel), meinen Befinden-Verlauf, die aktuelle Form (CTL/ATL/TSB) samt Projektion,
die offene Konfliktliste des Planers, meine letzten Entscheidungen (welche Vorschläge
ich angenommen oder abgelehnt habe) sowie — falls für mich freigeschaltet — meinen
Leiterstand samt Stufenvorschlag je Trainingsformat.

**Leiterstand und Stufenvorschlag:** Die Compliance-Ampel je Fahrt (🟢/🟡/🔴 in der
Ist-Fahrten-Tabelle) und der Leiterstand (aktuelle Stufe, zwei Nachbarstufen,
\`evidence_grade\` — \`studienlage\` oder \`coaching-konsens\`, Letzteres mit schwächerer
Evidenzlage als bei VO2max-Formaten) stehen bei mir immer im Briefing, unabhängig von
einer Freigabe. Ein zusätzlicher Abschnitt „Stufenvorschlag" (nur bei aktiver
Freigabe) nennt je Format die vom System bereits berechnete Empfehlung dieser Runde
(\`hochstufen\`/\`zurückstufen\`/\`halten\` — im Taper-Fenster steht dort statt einer
Stufenänderung der Hinweis „eingefroren", ggf. mit Sperrdatum). Diese Empfehlung
übernimmst du als Zielstufe für Vorschläge an diesem Format — die Stufenlogik selbst
erfindest du nicht neu, sondern leitest die Struktur
aus den Nachbarstufen-Angaben ab und lieferst sie als \`workout_structure\`. Fehlt der
Abschnitt „Stufenvorschlag" (keine Freigabe oder keine aktiven Formate für mich),
triffst du deine Einschätzung wie bisher ohne Stufenbezug — erfinde in diesem Fall
keine eigene Stufe.

{{AUFTRAG}}

**Regeln für den JSON-Block (werden maschinell geprüft — Abweichungen führen zur
Ablehnung des Imports):**
- Exakt ein \`\`\`json-Codeblock am Ende deiner Antwort, sonst kein JSON in der Antwort.
- Äußere Struktur: \`{ "schema_version": 1, "athlete": "<aus dem Briefing>", "source":
  "claude", "proposals": [ <Vorschlag>, … ] }\`. Keine zusätzlichen Felder auf dieser
  Ebene.
- **Jeder Eintrag in \`proposals\` hat GENAU diese fünf Felder auf oberster Ebene —
  nie mehr, nie weniger:** \`op\`, \`target_card_id\`, \`target_updated_at\`, \`reason\`,
  \`payload\`. **Alle inhaltlichen Kartenfelder (\`title\`, \`type\`, \`plan_date\`,
  \`target_tss\`, \`km\`, \`workout\`, \`note\`) gehören AUSSCHLIESSLICH in das
  verschachtelte \`payload\`-Objekt — niemals als Geschwister von \`op\` auf oberster
  Ebene.** Das ist der häufigste Fehler: ein Vorschlag wie
  \`{ "op": "replace", "title": "…", "plan_date": "…" }\` wird abgelehnt, weil
  \`title\`/\`plan_date\` auf dieser Ebene unbekannte Felder sind.
- Erlaubte \`op\`-Werte und ihr jeweiliges \`payload\`:
  - \`add\` — neue Karte. \`target_card_id\`/\`target_updated_at\` beide \`null\` (es gibt
    noch keine Zielkarte). \`payload\`: \`title\` (Pflicht), \`plan_date\` (Pflicht,
    \`YYYY-MM-DD\`), dazu optional \`type\`, \`target_tss\`, \`km\`, \`workout\`, \`note\`.
  - \`replace\` — bestehende Karte inhaltlich ersetzen. \`target_card_id\` +
    \`target_updated_at\` Pflicht, unverändert aus dem Briefing übernommen.
    \`payload\`: dieselben Felder wie bei \`add\`, \`title\` hier aber optional.
  - \`move\` — nur Datumswechsel. \`target_card_id\` + \`target_updated_at\` Pflicht.
    \`payload\` enthält **ausschließlich** \`{ "plan_date": "…" }\` — kein \`title\`,
    \`type\` o. ä.
  - \`cancel\` — Karte als ausgefallen markieren. \`target_card_id\` +
    \`target_updated_at\` Pflicht. \`payload\` enthält **höchstens** \`{ "reason": "…" }\`
    (derselbe Text wie das äußere \`reason\`-Feld) — kein weiteres Feld erlaubt.
  - Kein Löschen — wenn eine Einheit entfallen soll, nutze \`cancel\` mit Begründung.
- Vier vollständige Beispiele, je ein Eintrag aus \`proposals\`:

  \`\`\`json
  { "op": "add", "target_card_id": null, "target_updated_at": null,
    "reason": "Zusätzliche Erholungseinheit nach zwei harten Tagen",
    "payload": { "title": "Z2 Recovery 45min", "type": "Z1 Recovery",
      "plan_date": "2026-08-03", "target_tss": 30, "km": null,
      "workout": null, "note": null } }
  \`\`\`
  \`\`\`json
  { "op": "replace", "target_card_id": "eb55a1f9-afb3-4744-be18-52c83b854572",
    "target_updated_at": "2026-07-29T14:45:36.681223+00:00",
    "reason": "TSB am Eventtag sonst -6, Ziel +5…+20 — Reduktion schafft Puffer",
    "payload": { "title": "VO2max Aktivierung 3×2 min", "type": "VO2max",
      "plan_date": "2026-09-03", "target_tss": 45, "km": null,
      "workout": { "warmup": 15, "intervals": 3, "duration": 2, "rest": 3,
        "pct": [106, 120], "cooldown": 10, "label": "3x2min VO2max" },
      "workout_structure": { "version": 1, "steps": [
        { "kind": "warmup", "duration_s": 900, "target_pct_ftp": 55 },
        { "kind": "set", "reps": 3,
          "work": { "duration_s": 120, "target_pct_ftp": 113 },
          "recovery": { "duration_s": 180, "target_pct_ftp": 50 } },
        { "kind": "cooldown", "duration_s": 600, "target_pct_ftp": 50 } ] },
      "note": null } }
  \`\`\`
  \`\`\`json
  { "op": "move", "target_card_id": "…", "target_updated_at": "…",
    "reason": "Terminkonflikt mit Gruppenfahrt",
    "payload": { "plan_date": "2026-08-15" } }
  \`\`\`
  \`\`\`json
  { "op": "cancel", "target_card_id": "…", "target_updated_at": "…",
    "reason": "Krankheit — Einheit entfällt",
    "payload": { "reason": "Krankheit — Einheit entfällt" } }
  \`\`\`

- \`target_card_id\` und \`target_updated_at\` übernimmst du **unverändert** aus dem
  Briefing der jeweiligen Karte. Erfinde niemals IDs; Karten ohne ID im Briefing
  kannst du nicht ändern (nur \`add\` neuer Karten ist ohne ID möglich).
- \`plan_date\` nie in der Vergangenheit; Datumsformat \`YYYY-MM-DD\`.
- \`type\` nur aus der Typenliste im Briefing; \`target_tss\` realistisch (0–400).
- Für pushbare Intervall-Einheiten trägt \`payload.workout\` genau diese Felder:
  \`warmup\`/\`cooldown\` (Minuten), \`intervals\` (Anzahl Wiederholungen), \`duration\`
  (Minuten pro Intervall), \`rest\` (Pausenminuten), \`pct\` als \`[von, bis]\` in %FTP,
  \`label\` (kurzer Text) — Beispiel oben bei \`replace\`. Ohne \`pct\` kann die Einheit
  nicht auf den Radcomputer geladen werden. Keine strukturierten Intervalle:
  \`"workout": null\`.
- Zusätzlich zu \`workout\` trägt \`payload.workout_structure\` (nur bei \`add\`/\`replace\`,
  maschinell geprüft) dieselbe Einheit im neuen strukturierten Schema — Beispiel oben bei
  \`replace\`. Aufbau: \`{ "version": 1, "steps": [ <Schritt>, … ] }\`. Jeder Schritt hat ein
  \`kind\` — GENAU diese Felder je Art, nie mehr:
  - \`warmup\`/\`cooldown\`/\`steady\`: \`duration_s\` (Sekunden), \`target_pct_ftp\` (1–200,
    immer relativ zur FTP, nie absolute Watt).
  - \`set\` — ein Intervallblock, z. B. 3×15min: \`reps\`, \`work\`
    \`{ duration_s, target_pct_ftp }\`, \`recovery\` \`{ duration_s, target_pct_ftp }\`. Keine
    verschachtelten Sets — ein 3-Sätze-30/15-Protokoll sind drei aufeinanderfolgende
    \`set\`-Schritte (\`reps: 13, work: {duration_s:30,…}, recovery: {duration_s:15,…}\`),
    getrennt durch einen \`steady\`-Schritt als Pause zwischen den Blöcken:
    \`\`\`json
    { "kind": "set", "reps": 3,
      "work": { "duration_s": 900, "target_pct_ftp": 90 },
      "recovery": { "duration_s": 300, "target_pct_ftp": 50 } }
    \`\`\`
  - \`alternating\` — Over-Unders: \`reps\` (Blockzahl), \`cycles\` (Over/Under-Wechsel pro
    Block), \`duration_s\` (Blockdauer), \`over\` \`{ duration_s, target_pct_ftp }\`, \`under\`
    \`{ duration_s, target_pct_ftp }\`, \`recovery\` \`{ duration_s, target_pct_ftp }\`. Zwingend:
    \`cycles × (over.duration_s + under.duration_s)\` ergibt EXAKT \`duration_s\` — krumme
    Reste werden abgelehnt, nicht gerundet:
    \`\`\`json
    { "kind": "alternating", "reps": 3, "cycles": 3, "duration_s": 540,
      "over": { "duration_s": 120, "target_pct_ftp": 103 },
      "under": { "duration_s": 60, "target_pct_ftp": 88 },
      "recovery": { "duration_s": 300, "target_pct_ftp": 50 } }
    \`\`\`
  - \`accessory\` — Zusatz wie Sprints, zählt NICHT in Zeit-in-Zone/Compliance des
    Hauptteils: \`subtype\` (kurzer Text, z. B. \`"sprint"\`), \`reps\`, \`work\`
    \`{ duration_s, target_pct_ftp }\` ODER \`{ duration_s, "target": "max" }\` (nie beides),
    \`recovery\` \`{ duration_s, target_pct_ftp }\`:
    \`\`\`json
    { "kind": "accessory", "subtype": "sprint", "reps": 4,
      "work": { "duration_s": 15, "target": "max" },
      "recovery": { "duration_s": 285, "target_pct_ftp": 50 } }
    \`\`\`
  Ohne erkennbare Intervallstruktur (reine Ausfahrt): \`"workout_structure": null\`.
  \`workout\` bleibt zusätzlich Pflicht für pushbare Einheiten — die beiden Felder ersetzen
  sich nicht gegenseitig; \`move\`/\`cancel\` kennen keins von beiden (s. oben).
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
- Zusatzkontext des Athleten darf deine Entscheidung beeinflussen, aber niemals
  in \`reason\` auftauchen — \`reason\` bleibt lastbasiert (TSS, TSB, Plan, Events).

Hier ist mein Briefing:

{{BRIEFING}}`;

/** Auftragsblock je Preset (Export-Richtungsvorgabe-Konzept R1/R4) — ersetzt
 *  die früheren, preset-losen Punkte 1–3 unter "**Deine Aufgabe:**". Jede
 *  Variante ist ein vollständig ausformulierter, für sich lesbarer
 *  Textblock — KEINE Textbausteine, die zur Laufzeit zusammengeklebt werden.
 *  Einzige zur Laufzeit gefüllte Stelle: `event` bekommt Titel/Datum des
 *  gewählten Events eingesetzt (s. buildAuftragBlock). */
export const AUFTRAG_VARIANTEN = {
  general: `**Deine Aufgabe:**
1. Analysiere Form, Plan und Events. Prüfe insbesondere: Passt die Belastungskurve
   zum nächsten priorisierten Event (TSB-Zielfenster laut Briefing)? Gibt es
   Konflikte aus der Liste, die ein Umbau lösen würde? Deckt sich der Plan mit
   meinem Befinden- und RPE-Verlauf?
2. Schlage Änderungen nur vor, wo sie einen klaren Zweck haben. Wenige gute
   Vorschläge sind besser als viele kleine. Wenn der Plan passt, ist „keine
   Änderung" eine vollwertige Antwort. Folge für Formate mit Stufenvorschlag im
   Briefing dessen Zielstufe; weichst du davon ab, nenne im \`reason\` ausdrücklich
   warum.
3. Erkläre zuerst in normaler Sprache deine Einschätzung und was du warum ändern
   würdest (das lese ich). Gib **danach** deine Vorschläge als JSON-Block (den
   liest die App).`,

  event: `**Deine Aufgabe:**
1. Richte deine Analyse gezielt auf mein Event **{{EVENT_TITLE}}** am
   **{{EVENT_DATE}}** aus. Prüfe, ob die Belastungskurve (CTL/ATL/TSB-Projektion
   im Briefing) bis zu diesem Termin ins Zielfenster läuft, und ob der
   bestehende Plan das unterstützt oder eher konterkariert.
2. Schlage nur Änderungen vor, die die Form gezielt auf dieses Event hin
   verbessern — andere Baustellen im Plan bleiben außen vor, solange sie
   dieses Ziel nicht gefährden. Wenn der Plan bereits passt, ist „keine
   Änderung" eine vollwertige Antwort. Der Stufenvorschlag im Briefing
   berücksichtigt den Taper bereits (ab Taper-Beginn hält er die Stufe und
   markiert sie als „eingefroren") — übernimm ihn unverändert, ohne selbst zu
   prüfen, ob Taper-Zeit ist.
3. Erkläre zuerst in normaler Sprache, wie der Plan aktuell zu diesem Ziel
   steht und was du warum ändern würdest (das lese ich). Gib **danach** deine
   Vorschläge als JSON-Block (den liest die App).`,

  check: `**Deine Aufgabe:**
1. Prüfe Form, Plan und Events auf Plausibilität: Passt die Belastungskurve
   zum nächsten priorisierten Event (TSB-Zielfenster laut Briefing)? Gibt es
   Konflikte aus der Liste? Deckt sich der Plan mit meinem Befinden- und
   RPE-Verlauf?
2. Schlage in dieser Runde **keine Änderungen** vor — ich will nur deine
   Einschätzung, keinen Umbau. Liefere trotzdem den JSON-Block mit
   \`"proposals": []\`, die App braucht die äußere Struktur auch ohne
   Vorschläge. Ein gezeigter Stufenvorschlag steht in dieser Runde ohnehin auf
   \`halten\` — das ist kein Hinweis auf eine anstehende Änderung, kommentiere
   aber im Text, falls eine Stufe aus deiner Sicht reif für die nächste Runde
   wirkt.
3. Erkläre in normaler Sprache deine Einschätzung: wo siehst du Risiken,
   Diskrepanzen oder Auffälligkeiten, auch wenn du nichts änderst?`,

  reduce: `**Deine Aufgabe:**
1. Analysiere Form, Plan und Events mit Fokus auf Entlastung: Wo ist die
   Belastung (TSS-Verlauf, TSB-Trend, Belastungswächter-Signale im Briefing)
   zuletzt zu hoch oder das Muster ungünstig?
2. Baue gezielt Entlastung ein — reduzierte Intensität oder Volumen,
   zusätzliche Erholungseinheiten, verschobene harte Blöcke. Wenige gezielte
   Vorschläge, kein kompletter Neubau des Plans. Zeigt der Stufenvorschlag im
   Briefing für ein Format \`zurückstufen\`, baue die nächste Einheit dieses
   Formats auf der genannten niedrigeren Stufe.
3. Erkläre zuerst in normaler Sprache, wo du Entlastungsbedarf siehst und was
   du deshalb änderst (das lese ich). Gib **danach** deine Vorschläge als
   JSON-Block (den liest die App).`,

  build: `**Deine Aufgabe:**
1. Analysiere Form, Plan und Events mit Fokus auf Belastungssteigerung: Lässt
   die aktuelle Form (CTL/ATL/TSB-Projektion, Belastungswächter-Signale im
   Briefing) zusätzlichen Reiz zu, ohne ins Risiko zu laufen?
2. Wenn ja: baue gezielt mehr Reiz ein (Intensität, Volumen oder eine
   zusätzliche Qualitätseinheit). Sprechen die Daten dagegen (z. B.
   TSB-Warnsignal, Ramp-Rate-Alarm), sag das offen und schlage **keine**
   zusätzliche Belastung vor — Sicherheit geht vor Fortschritt. Zeigt der
   Stufenvorschlag im Briefing für ein Format \`hochstufen\`, baue die nächste
   Einheit auf der genannten Zielstufe; zeigt er \`halten\` (Sperre oder
   Taper), bleib trotz guter Form auf der aktuellen Stufe.
3. Erkläre zuerst in normaler Sprache deine Einschätzung und was du warum
   änderst (oder bewusst nicht änderst). Gib **danach** deine Vorschläge als
   JSON-Block (den liest die App).`,
};

// Sichtbarer Fallback (R3/R4: "kein stiller Fallback") — wird VOR den
// general-Auftrag gesetzt, wenn preset "event" ohne gewähltes Event
// exportiert wird.
const EVENT_FALLBACK_HINWEIS = `_Hinweis: Preset "Auf Event hin" gewählt, aber kein Zielevent hinterlegt — diese Runde läuft daher wie folgt:_

`;

// D5 (docs/konzept-progressionssteuerung.md): ein Testtermin (is_test) ist
// kein Wettkampf — Familienwahl/Leiter sollen NICHT auf ihn hin umgebaut
// werden (beides existiert als Konzept aber erst in Fenster B/D, hier nur
// der Hinweis). Bewusst als eigener, ans Ende des event-Auftragsblocks
// angehängter Satz statt in AUFTRAG_VARIANTEN.event eingebettet — der
// Block wird wörtlich gegen die Doku geprüft (tests/export-briefing-
// consistency.test.js), ein bedingter Laufzeit-Zusatz gehört nicht in
// diese literal geprüfte Konstante (Muster wie EVENT_FALLBACK_HINWEIS).
const EVENT_IS_TEST_HINWEIS = `\n\n_Hinweis: Das ist ein Testtermin (kein Wettkampf) — der Plan wird nicht auf die Testform hin umgebaut, nur das TSB-Zielfenster und ein kurzer Taper greifen._`;

/** Baut den Auftragsblock für ein Preset. `event` erwartet
 *  `{ title, eventDate, isTest? }` — fehlt title/eventDate, fällt der
 *  Auftrag sichtbar auf `general` zurück (kein stiller Fallback, R3/R4).
 *  Ein unbekanntes/fehlendes Preset fällt ebenfalls auf `general` zurück.
 *  @param {string} preset @param {{title?:string, eventDate?:string, isTest?:boolean}|null} [event]
 *  @returns {string} */
export function buildAuftragBlock(preset, event = null) {
  if (preset === "event") {
    if (event?.title && event?.eventDate) {
      const block = AUFTRAG_VARIANTEN.event
        .replaceAll("{{EVENT_TITLE}}", event.title)
        .replaceAll("{{EVENT_DATE}}", event.eventDate);
      return event.isTest ? block + EVENT_IS_TEST_HINWEIS : block;
    }
    return EVENT_FALLBACK_HINWEIS + AUFTRAG_VARIANTEN.general;
  }
  return AUFTRAG_VARIANTEN[preset] ?? AUFTRAG_VARIANTEN.general;
}

/** Kurze Compliance-Zelle für die Ist-Fahrten-Tabelle (C2,
 *  docs/konzept-progressionssteuerung.md) — eine Zeile je Fahrt, nicht die
 *  volle Intervalltabelle (die kommt erst in der UI, Schritt 6b). `–` ohne
 *  Match (keine Karte/Struktur, noch nicht gecachte Segmente, s.
 *  scripts/lib/compliance.js). @param {import("../types.js").Ride} r */
function complianceCell(r) {
  const c = r.compliance;
  if (!c) return "–";
  const emoji = { green: "🟢", yellow: "🟡", red: "🔴" }[c.rating] ?? "";
  const ratio = `${c.intervalsCompleted}/${c.intervalsPlanned}`;
  return c.rating === "green" ? `${emoji} ${ratio}` : `${emoji} ${ratio} (${c.rule})`;
}

function mdEscapeCell(v) {
  if (v == null) return "–";
  return String(v).replace(/\|/g, "/");
}

/** Anzeige-Label je Proposal-Status (DB-Enum seit Migration 0006:
 *  open/accepted/rejected/stale/withdrawn). Nur echte Entscheidungen landen
 *  hier (s. buildMemorySection) — "open"/"stale" filtert der Aufrufer
 *  (state/export.js) bereits vor Übergabe heraus. */
const PROPOSAL_STATUS_LABEL = {
  accepted: "angenommen",
  rejected: "abgelehnt",
  withdrawn: "zurückgezogen",
};

/** Fortschritt-Sektion (F1, docs/konzept-progressionssteuerung.md Abschnitt 4):
 *  eFTP-Trend, Effizienzfaktor-Trend, Decoupling-Trend, Bestwerte-Vergleich —
 *  alle bereits fertig berechnet vom Aufrufer (core/progress-indicators.js
 *  bzw. core/efficiency.js direkt, s. state/export.js). Diese Funktion baut
 *  nur noch den Anzeigetext, dieselbe Aufgabenteilung wie buildMemorySection.
 *  `progress` fehlt komplett bei zu dünner Datenlage → ein Hinweis statt
 *  eines leeren Abschnitts (kein stiller Fallback).
 *  @param {{
 *    eftp?: {first:number, last:number, slopePerWeek:number|null, nPoints:number,
 *      lastRampTest:{date:string,ftpWatt:number}|null}|null,
 *    ef?: {first:number|null, last:number|null, slopePer30d:number|null, comparable:Array}|null,
 *    decoupling?: {median:number, stableShare:number, slopePer30d:number|null, n:number}|null,
 *    bestEfforts?: Array<{label:string, recentW:number, previousW:number, deltaW:number}>,
 *  }|null} [progress]
 *  @returns {string[]} Markdown-Zeilen */
function buildProgressSection(progress) {
  const lines = [];
  lines.push("## Fortschritt (letzte Wochen)");
  // core/efficiency.js::efficiencyTrend liefert IMMER ein Objekt (nie null),
  // auch ohne eine einzige vergleichbare Fahrt (first/last dann null) — ein
  // bloßes `progress.ef`-Truthy-Check würde "hasAny" fälschlich auf true
  // setzen und die Sektion auf eine Überschrift ohne jede Zeile reduzieren
  // (kein Hinweistext, keine Ef-Zeile). Deshalb hier explizit auf `first`
  // prüfen, dieselbe Bedingung wie beim eigentlichen Rendern unten.
  const hasEf = progress?.ef?.first != null && progress.ef?.last != null;
  const hasAny = progress && (progress.eftp || hasEf || progress.decoupling || progress.bestEfforts?.length);
  if (!hasAny) {
    lines.push("Noch keine Fortschrittsdaten.");
    lines.push("");
    return lines;
  }

  if (progress.eftp) {
    const { first, last, slopePerWeek, lastRampTest } = progress.eftp;
    const trendText = slopePerWeek != null ? `${slopePerWeek > 0 ? "+" : ""}${slopePerWeek} W/Woche` : "kein Trend (zu wenig Punkte)";
    const rampText = lastRampTest
      ? `, letzter Ramp-Test ${lastRampTest.date} (${lastRampTest.ftpWatt} W)`
      : "";
    lines.push(`- eFTP: ${first} W → ${last} W, Trend ${trendText}${rampText}`);
  }
  if (hasEf) {
    const { first, last, slopePer30d, comparable } = progress.ef;
    lines.push(
      `- Effizienzfaktor (NP/HF, Z1/Z2 ≥60min): ${first} → ${last}, Trend ${slopePer30d != null ? `${slopePer30d > 0 ? "+" : ""}${slopePer30d}/30 Tage` : "kein Trend"} (n=${comparable?.length ?? 0})`
    );
  }
  if (progress.decoupling) {
    const { median, stableShare, n } = progress.decoupling;
    lines.push(
      `- Decoupling (Pw:HR, dieselben Fahrten): Median ${median}%, ${stableShare}% der Fahrten unter 5% (aerob stabil), n=${n}`
    );
  }
  if (progress.bestEfforts?.length) {
    for (const b of progress.bestEfforts) {
      lines.push(
        `- Bestwert ${b.label} (letzte 6 vs. vorherige 6 Wochen): ${b.previousW} W → ${b.recentW} W (${b.deltaW > 0 ? "+" : ""}${b.deltaW} W)`
      );
    }
  }
  lines.push("");
  return lines;
}

/** Leitplanken-Sektion (P1, docs/konzept-progressionssteuerung.md Abschnitt 5):
 *  Grenzen VOR der Planung sichtbar machen — bereits fertig berechnet vom
 *  Aufrufer (core/guardrails.js::buildGuardrailSummary, s. state/export.js).
 *  Reine Anzeige, keine Konfliktregel (die kommt separat aus `conflicts`,
 *  core/conflicts.js) — absichtlich getrennt, s. Konzept P1 vs. P2.
 *  @param {{
 *    rampActual4w: number|null, rampProjectedHorizon: number|null,
 *    rampHistoricalHitRate: number|null,
 *    hardDaysPerWeek: Array<{week:string, count:number}>,
 *    shortestHardGap: number|null,
 *    tidVsCorridor: {phase:string, shareAboveCorridor:number}|null,
 *    weeklyTssVsCeiling: Array<{week:string, tss:number, ceiling:number, overCeiling:boolean}>,
 *  }|null} [guardrails]
 *  @returns {string[]} Markdown-Zeilen */
function buildGuardrailsSection(guardrails) {
  const lines = [];
  lines.push("## Leitplanken");
  if (!guardrails) {
    lines.push("Noch keine Leitplanken-Daten.");
    lines.push("");
    return lines;
  }

  const rampText =
    guardrails.rampActual4w != null || guardrails.rampProjectedHorizon != null
      ? `Ist (letzte 4 Wochen) ${guardrails.rampActual4w ?? "–"} CTL/Woche · Projiziert (Planungshorizont) ${guardrails.rampProjectedHorizon ?? "–"} CTL/Woche`
      : "keine Daten";
  const hitRateText =
    guardrails.rampHistoricalHitRate != null
      ? ` — Schwelle (8) wurde in ${Math.round(guardrails.rampHistoricalHitRate * 100)}% der bisherigen Wochen real erreicht`
      : "";
  lines.push(`- CTL-Rampe: ${rampText}${hitRateText}`);

  if (guardrails.hardDaysPerWeek?.length) {
    const list = guardrails.hardDaysPerWeek.map((w) => `${w.week}: ${w.count}`).join(" · ");
    lines.push(`- Harte Tage/Woche (Sweet Spot/Schwelle/VO2max) im Plan: ${list}`);
  }
  if (guardrails.shortestHardGap != null) {
    lines.push(`- Kürzester Abstand zwischen zwei harten Tagen im Plan: ${guardrails.shortestHardGap} Tag(e)`);
  }
  if (guardrails.tidVsCorridor) {
    const { phase, shareAboveCorridor } = guardrails.tidVsCorridor;
    lines.push(
      `- Intensitätsverteilung (letzte 4 Wochen) vs. Zielkorridor „${phase}": ${Math.round(shareAboveCorridor * 100)}% oberhalb des Korridors`
    );
  }
  if (guardrails.weeklyTssVsCeiling?.length) {
    const list = guardrails.weeklyTssVsCeiling
      .map((w) => `${w.week}: ${w.tss}/${w.ceiling}${w.overCeiling ? " ⚠" : ""}`)
      .join(" · ");
    lines.push(`- Wochen-TSS vs. Obergrenze (CTL×8): ${list}`);
  }
  lines.push("");
  return lines;
}

/** Entscheidungsgedächtnis-Sektion (6A, docs/konzept-progressionssteuerung.md):
 *  die letzten (max. 10, neueste zuerst) ENTSCHIEDENEN Vorschläge, damit der
 *  Trainer-Chat nicht zwischen Ansätzen oszilliert, die beim letzten Export
 *  schon verworfen wurden — jeder Export ist sonst ein frischer Chat ohne
 *  Kontinuität.
 *
 *  `ladderState` (Fenster D, s. state/ladder.js::getLadderState) ergänzt
 *  den ursprünglich additiven Platzhalter: aktive Formate × aktuelle Stufe
 *  × zwei Nachbarstufen × evidence_grade — NIE der volle Katalog (L8), das
 *  ist "wo im Aufbau" der Athlet steht, nicht wie die ganze Leiter aussieht.
 *
 *  @param {Array<{date?:string|null, op:string, status:string, reason?:string|null}>} recentProposals
 *  @param {Array<{summary:string, evidenceGrade:string,
 *    neighbors:{prev:{id?:string}|null, next:{id?:string}|null}}>} [ladderState]
 *  @returns {string[]} Markdown-Zeilen */
function buildMemorySection(recentProposals, ladderState = []) {
  const lines = [];
  lines.push("## Entscheidungsgedächtnis (letzte Vorschläge)");
  if (!recentProposals?.length) {
    lines.push("Keine bisherigen Vorschläge.");
  } else {
    for (const p of recentProposals.slice(0, 10)) {
      const statusLabel = PROPOSAL_STATUS_LABEL[p.status] ?? p.status;
      lines.push(`- ${p.date ?? "–"} ${p.op} → ${statusLabel}: "${mdEscapeCell(p.reason)}"`);
    }
  }
  if (ladderState?.length) {
    lines.push("");
    lines.push("Leiterstand:");
    for (const f of ladderState) {
      const prevLabel = f.neighbors?.prev?.id ?? "–";
      const nextLabel = f.neighbors?.next?.id ?? "–";
      lines.push(`- ${f.summary} (${f.evidenceGrade}) · Nachbarstufen: ${prevLabel} / ${nextLabel}`);
    }
  }
  lines.push("");
  return lines;
}

/** Stufenvorschlag-Sektion (D4b Schritt 3, Auftrag "Ride↔Format-Brücke,
 *  Verdrahtung, echte Sperre"): je aktivem Format der aus
 *  state/ladder.js::getPresetSuggestion() geholte Vorschlag — reine
 *  Information für den Trainer-Chat, KEINE automatische Kartenänderung
 *  (C3.1 bleibt in Kraft). Leere Liste (kein aktives Format oder
 *  profiles.ladder_progression_enabled nicht gesetzt, aktuell BEIDE
 *  Athleten) → kein Abschnitt, kein Rauschen im Briefing.
 *  @param {Array<{label?:string, formatId:string, step:number, action:string, lockedUntil?:string, inTaper?:boolean}>} presetSuggestions
 *  @returns {string[]} Markdown-Zeilen */
function buildPresetSuggestionSection(presetSuggestions) {
  if (!presetSuggestions?.length) return [];
  const actionLabel = { up: "hochstufen", down: "zurückstufen", hold: "halten" };
  const lines = ["## Stufenvorschlag", ""];
  for (const s of presetSuggestions) {
    // Taper-Erkennung (Auftrag "Taper-Erkennung für 'Auf Event hin'"): ein
    // "hold" während des Taper-Fensters ist kein normales Halten (Ampel/
    // Sperre), sondern C4s "eingefroren" — eigener Text, damit der Trainer-
    // Chat den Unterschied nicht erst aus dem Kontext erschließen muss.
    const label = s.action === "hold" && s.inTaper ? "eingefroren (Taper)" : (actionLabel[s.action] ?? s.action);
    const lockNote = s.lockedUntil ? ` (gesperrt bis ${s.lockedUntil})` : "";
    lines.push(`- ${s.label ?? s.formatId}: Stufe ${s.step} → ${label}${lockNote}`);
  }
  lines.push("");
  return lines;
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
 *    recentProposals?: Array<{date?:string|null, op:string, status:string, reason?:string|null}>,
 *    ladderState?: Array<{summary:string, evidenceGrade:string, neighbors:{prev:Object|null,next:Object|null}}>,
 *    presetSuggestions?: Array<{label?:string, formatId:string, step:number, action:string, lockedUntil?:string}>,
 *    progress?: Object|null,     F1 — s. buildProgressSection für die genaue Form
 *    guardrails?: Object|null,   P1 — s. buildGuardrailsSection für die genaue Form
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
  recentProposals = [],
  ladderState = [],
  presetSuggestions = [],
  progress = null,
  guardrails = null,
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
  const projectionByDate = new Map((projection?.days ?? []).map((d) => [d.date, d]));
  if (!upcoming.length) {
    lines.push("Keine Events erfasst.");
  } else {
    for (const e of upcoming) {
      const days = diffDays(e.eventDate, todayIso);
      lines.push(`- ${e.eventDate} ${e.title || "(ohne Titel)"}${e.priority ? ` (${e.priority})` : ""} — noch ${days} Tage`);
      // R10: Zielfenster + Eventtag-Projektion unabhängig vom Konfliktstatus
      // zeigen — bisher tauchte das nur auf, wenn K-EVENT (core/conflicts.js)
      // bereits eine Verletzung meldete, nie beim regulären "passt"-Fall.
      const window = e.type === "race" ? EVENT_TSB_WINDOW[e.priority] : null;
      if (window) {
        const [lo, hi] = window;
        const windowText = `${lo > 0 ? "+" : ""}${lo}…${hi > 0 ? "+" : ""}${hi}`;
        const day = projectionByDate.get(e.eventDate);
        const tsbText = day ? `${Math.round(day.tsb)}` : "außerhalb der Projektion";
        lines.push(
          `  TSB-Zielfenster ${EVENT_PRIORITY_LABEL[e.priority] ?? e.priority}: ${windowText} — projizierter TSB am Eventtag: ${tsbText}`
        );
      }
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
    let anyUncertainTss = false;
    for (const c of planCards) {
      // R10: K3-Typ-Default (core/projection.js::estimateTss, dieselbe
      // Prioritätskette wie die PMC-Prognose) statt nur tssPlanned zu lesen —
      // die Spalte stand vorher bei jeder Karte ohne expliziten Zielwert auf
      // "–", obwohl ein Median-TSS-Wert für den Typ vorliegt.
      const { tss, uncertain } = estimateTss(c, { ftp });
      if (uncertain) anyUncertainTss = true;
      lines.push(
        `| ${c.date} | ${mdEscapeCell(c.name)} | ${mdEscapeCell(c.typ)} | ${uncertain ? `~${tss}` : tss} | ${c.id} | ${mdEscapeCell(c.updatedAt)} |`
      );
    }
    if (anyUncertainTss) {
      lines.push("");
      lines.push(
        "_Ziel-TSS mit „~“ ist kein von mir gesetztes Ziel, sondern aus Workout-Blöcken oder dem Typ-Durchschnitt geschätzt._"
      );
    }
  }
  lines.push("");

  lines.push("## Ist-Fahrten (letzte Wochen)");
  if (!actuals.length) {
    lines.push("Keine Fahrten im Zeitraum.");
  } else {
    lines.push("| Datum | Typ | TSS | RPE | Feel | Compliance |");
    lines.push("|---|---|---|---|---|---|");
    for (const r of actuals) {
      lines.push(
        `| ${r.dateISO} | ${mdEscapeCell(r.typ)} | ${r.tss ?? "–"} | ${r.rpe ?? "–"} | ${r.feelIcu ?? "–"} | ${complianceCell(r)} |`
      );
    }
    lines.push("");
    lines.push(
      "_Der Typ stammt je nach Fahrt aus unterschiedlicher Quelle: bei fehlendem Plan-Match datenbasiert aus der gefahrenen Leistung abgeleitet, sonst aus der Plankarte übernommen oder manuell eingetragen — nur im Plankarten-Fall kann er vom tatsächlichen Verlauf abweichen._"
    );
    lines.push(
      "_Compliance (Soll-Ist-Matching gegen die Plankarte, sofern vorhanden): erfüllte/geplante Intervalle, bei gelb/rot die auslösende Regel in Klammern._"
    );
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

  lines.push(...buildProgressSection(progress));
  lines.push(...buildGuardrailsSection(guardrails));

  lines.push("## Offene Konflikte");
  if (!conflicts.length) {
    lines.push("Keine.");
  } else {
    for (const c of conflicts) lines.push(`- ${c.rule} (${c.severity}): ${c.message}`);
  }
  lines.push("");

  lines.push(...buildMemorySection(recentProposals, ladderState));
  lines.push(...buildPresetSuggestionSection(presetSuggestions));

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

/** Fertiger, direkt einfügbarer Text — Rumpf mit eingesetztem Auftragsblock
 *  (Preset, R4) und Briefing (Konzept §2: "eine Zeichenkette, keine zwei
 *  Teile"). `preset`/`event` optional, Default `general` — bestehende
 *  Aufrufer ohne Options-Objekt verhalten sich unverändert wie vor R4.
 *  `extraContext` (R2/R7, ungetrimmt erlaubt, wird hier getrimmt) hängt als
 *  eigener Absatz direkt unter den Auftragsblock — nie in die maschinelle
 *  JSON-Sektion, nie persistiert (das erledigt der Aufrufer in state/).
 *  @param {object} ctx
 *  @param {{preset?:string, event?:{title?:string,eventDate?:string}|null, extraContext?:string}} [opts] */
export function buildExportText(ctx, { preset = "general", event = null, extraContext = "" } = {}) {
  let auftrag = buildAuftragBlock(preset, event);
  const trimmedContext = (extraContext || "").trim().slice(0, EXTRA_CONTEXT_MAX_LENGTH);
  if (trimmedContext) {
    auftrag += `\n\n**Zusatzkontext von mir:** ${trimmedContext}`;
  }
  return PROMPT_RUMPF
    .replace("{{AUFTRAG}}", auftrag)
    .replace("{{BRIEFING}}", buildBriefingMarkdown(ctx));
}

/** Dateiname für den Download-Weg (Konzept §2). @param {string} athleteId
 *  @param {string} [today] @returns {string} */
export function exportFileName(athleteId, today) {
  const todayIso = today ?? localISODate();
  return `claude-briefing-${athleteId}-${todayIso}.md`;
}

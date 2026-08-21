/* ============================================================
   CORE/ANALYSIS-NARRATIVE.JS — Klartext-Urteile für den Analyse-Tab
   „Antworten & Spuren" (kein DOM).

   Regelbasierte Textbausteine, gleiches Prinzip wie core/briefing.js
   (dort: Tages-Ampel aus 3 Signalen → Empfehlungssatz; hier: vier
   Leitfragen aus mehrwöchigen Trends → Urteil + Antworttext). Nimmt
   bereits verdichtete "Fakten"-Objekte entgegen (Aufrufer in
   features/analysis/answers-view-model.ts baut sie aus core/pmc.js,
   core/loadguard.js, core/efficiency.js, core/body.js etc.) — diese
   Datei kennt keine Rides/Wellness-Rohdaten, nur Zahlen, und bleibt
   dadurch mit einfachen Objekt-Literalen testbar.

   WICHTIG: Die Beispielsätze im Claude-Design-Prototyp sind für
   synthetische Demo-Daten handgeschrieben ("Zwei Wochen lagen über
   dem Ramp-Zielband…") — hier entstehen strukturell ähnliche, aber
   aus echten Werten zusammengesetzte Sätze, keine wörtliche Kopie.
   ============================================================ */

/** @typedef {"pos"|"status"|"warn"|"neutral"} VerdictColor */

/**
 * @param {{ctlTrendDirection: "steigend"|"fallend"|"stabil"|null, tsb: number|null,
 *   tsbBand: "overload"|"build"|"neutral"|"fresh"|"too-fresh"|null, daysToEvent: number|null}} facts
 * @returns {{headline: string, text: string}}
 */
export function heroVerdict({ ctlTrendDirection, tsb, tsbBand, daysToEvent }) {
  const eventClause = daysToEvent != null ? ` Bis zum Zielevent bleiben ${daysToEvent} Tage.` : "";

  if (ctlTrendDirection == null || tsb == null) {
    return {
      headline: "Noch zu wenig Datenbasis für ein Urteil.",
      text: `Sobald mehr Fahrten mit Belastungsdaten vorliegen, erscheint hier eine Einordnung.${eventClause}`,
    };
  }

  const building = ctlTrendDirection === "steigend";
  const holding = ctlTrendDirection === "stabil";

  if (tsbBand === "overload") {
    return {
      headline: building ? "Du baust auf, aber übersteuerst gerade." : "Die Belastung ist gerade zu hoch.",
      text: `Die Form (TSB) liegt unter dem Überlast-Korridor — Erholung sollte jetzt Vorrang vor weiterem Aufbau haben.${eventClause}`,
    };
  }
  if (tsbBand === "build" && building) {
    return {
      headline: "Du baust auf und verkraftest es — im Korridor.",
      text: `Die Fitness (CTL) steigt, die Form (TSB) liegt im produktiven Aufbaukorridor.${eventClause}`,
    };
  }
  if (tsbBand === "build") {
    return {
      headline: "Belastung im Aufbaukorridor, Fitness hält sich.",
      text: `Form (TSB) liegt im produktiven Aufbaukorridor, ohne dass die Fitness gerade sichtbar steigt.${eventClause}`,
    };
  }
  if (tsbBand === "fresh" || tsbBand === "too-fresh") {
    return {
      headline: holding || !building ? "Du bist frisch, aber der Aufbau pausiert." : "Frisch und weiter im Aufbau.",
      text: `Die Form (TSB) liegt im Frischefenster.${building ? " Die Fitness steigt dabei weiter." : " Die Fitness bewegt sich aktuell kaum."}${eventClause}`,
    };
  }
  return {
    headline: building ? "Du baust auf, die Form ist neutral." : "Belastung und Form halten sich die Waage.",
    text: `Form (TSB) liegt im neutralen Bereich zwischen Aufbau- und Frischefenster.${eventClause}`,
  };
}

/**
 * @param {{efDeltaPct: number|null, hrvVsBaselinePct: number|null,
 *   gaShareDeltaPct: number|null, gaShare: number|null, gaTarget: number,
 *   bestEffort: {label: string, watts: number, note: string}|null}} facts
 * @returns {Array<{value: string, delta: string, label: string, note: string}>}
 */
export function wins({ efDeltaPct, hrvVsBaselinePct, gaShareDeltaPct, gaShare, gaTarget, bestEffort }) {
  /** @type {Array<{value: string, delta: string, label: string, note: string}>} */
  const out = [];
  if (efDeltaPct != null && efDeltaPct > 0) {
    out.push({
      value: `+${Math.round(efDeltaPct)} %`,
      delta: "Effizienz",
      label: "Aerobe Effizienz",
      note: "Watt je Herzschlag verbessert sich über vergleichbare Grundlagenfahrten.",
    });
  }
  if (hrvVsBaselinePct != null && hrvVsBaselinePct > 0) {
    out.push({
      value: `+${Math.round(hrvVsBaselinePct)} %`,
      delta: "über Basis",
      label: "HRV über Basis",
      note: "Der 7-Tage-Schnitt liegt über der 42-Tage-Baseline — die Reize werden angenommen.",
    });
  }
  if (gaShareDeltaPct != null && gaShareDeltaPct > 0 && gaShare != null && gaShare >= gaTarget) {
    out.push({
      value: `${Math.round(gaShare * 100)} %`,
      delta: `+${Math.round(gaShareDeltaPct)} %-Pkt.`,
      label: "Grundlagenanteil",
      note: `Über dem Richtwert von ${Math.round(gaTarget * 100)} %.`,
    });
  }
  if (bestEffort) {
    out.push({
      value: `${bestEffort.watts} W`,
      delta: "neu",
      label: bestEffort.label,
      note: bestEffort.note,
    });
  }
  return out;
}

/**
 * Frage 1: „Werde ich stärker?"
 * @param {{eftpSlopePerWeek: number|null, efDeltaPct: number|null, ftpGoalGapW: number|null}} facts
 * @returns {{verdict: string, color: VerdictColor, answer: string}}
 */
export function strongerVerdict({ eftpSlopePerWeek, efDeltaPct, ftpGoalGapW }) {
  if (eftpSlopePerWeek == null && efDeltaPct == null) {
    return { verdict: "unklar", color: "neutral", answer: "Noch zu wenig Datenbasis für einen eFTP- oder Effizienz-Trend." };
  }
  const parts = [];
  if (eftpSlopePerWeek != null) {
    parts.push(
      eftpSlopePerWeek > 0
        ? `Die geschätzte FTP steigt um ${eftpSlopePerWeek.toFixed(1).replace(".", ",")} W pro Woche.`
        : eftpSlopePerWeek < 0
          ? `Die geschätzte FTP fällt aktuell leicht (${eftpSlopePerWeek.toFixed(1).replace(".", ",")} W/Woche).`
          : "Die geschätzte FTP bewegt sich gerade kaum."
    );
  }
  if (efDeltaPct != null) {
    parts.push(
      efDeltaPct > 0
        ? `Die aerobe Effizienz ist über den Beobachtungszeitraum um ${Math.round(efDeltaPct)} % besser geworden.`
        : "Die aerobe Effizienz zeigt aktuell keinen klaren Fortschritt."
    );
  }
  if (ftpGoalGapW != null) {
    parts.push(
      ftpGoalGapW <= 0
        ? "Der Trend reicht für das FTP-Ziel bereits aus."
        : `Für das FTP-Ziel fehlen beim aktuellen Trend noch rund ${Math.round(ftpGoalGapW)} W.`
    );
  }

  const positive = (eftpSlopePerWeek ?? 0) > 0 || (efDeltaPct ?? 0) > 0;
  const negative = (eftpSlopePerWeek ?? 0) < 0 && (efDeltaPct ?? 0) <= 0;
  const verdict = negative ? "rückläufig" : positive ? (ftpGoalGapW != null && ftpGoalGapW > 0 ? "ja, langsam" : "ja") : "stagnierend";
  const color = /** @type {VerdictColor} */ (negative ? "warn" : positive ? "pos" : "status");
  return { verdict, color, answer: parts.join(" ") };
}

/**
 * Frage 2: „Verkrafte ich die Last?"
 * @param {{rampWeeksOverBand: number, tsb: number|null,
 *   tsbBand: "overload"|"build"|"neutral"|"fresh"|"too-fresh"|null,
 *   gaShare: number|null, gaTarget: number}} facts
 * @returns {{verdict: string, color: VerdictColor, answer: string}}
 */
export function loadVerdict({ rampWeeksOverBand, tsb, tsbBand, gaShare, gaTarget }) {
  if (tsb == null) {
    return { verdict: "unklar", color: "neutral", answer: "Noch keine ausreichende PMC-Datenbasis (CTL/ATL) für ein Urteil." };
  }
  const parts = [];
  if (rampWeeksOverBand > 0) {
    parts.push(
      rampWeeksOverBand === 1
        ? "Eine Woche lag über dem sicheren Ramp-Zielband."
        : `${rampWeeksOverBand} Wochen in Folge lagen über dem sicheren Ramp-Zielband.`
    );
  } else {
    parts.push("Der Fitness-Aufbau lief zuletzt innerhalb des sicheren Ramp-Zielbands.");
  }
  if (gaShare != null) {
    parts.push(
      gaShare >= gaTarget
        ? `Der Grundlagenanteil liegt bei ${Math.round(gaShare * 100)} % und damit über dem Richtwert von ${Math.round(gaTarget * 100)} %.`
        : `Der Grundlagenanteil liegt bei ${Math.round(gaShare * 100)} % — unter dem Richtwert von ${Math.round(gaTarget * 100)} %.`
    );
  }
  const bandText = {
    overload: "Die Form liegt aktuell im Überlastbereich.",
    build: "Die Form liegt im produktiven Aufbaukorridor.",
    neutral: "Die Form liegt im neutralen Bereich.",
    fresh: "Die Form liegt im Frischefenster.",
    "too-fresh": "Die Form ist aktuell sehr frisch.",
  }[tsbBand ?? "neutral"];
  parts.push(bandText);

  const high = tsbBand === "overload" || rampWeeksOverBand >= 2;
  const caution = tsbBand === "overload" || rampWeeksOverBand === 1 || (gaShare != null && gaShare < gaTarget);
  const verdict = high ? "grenzwertig" : caution ? "grenzwertig" : "im Korridor";
  const color = /** @type {VerdictColor} */ (high ? "warn" : caution ? "status" : "pos");
  return { verdict, color, answer: parts.join(" ") };
}

/**
 * Frage 3: „Wie erhole ich mich?"
 * @param {{hrvVsBaselinePct: number|null, rhrDeltaBpm: number|null,
 *   shortNightsCount: number, sleepTargetH: number}} facts
 * @returns {{verdict: string, color: VerdictColor, answer: string}}
 */
export function recoveryVerdict({ hrvVsBaselinePct, rhrDeltaBpm, shortNightsCount, sleepTargetH }) {
  if (hrvVsBaselinePct == null && rhrDeltaBpm == null) {
    return { verdict: "unklar", color: "neutral", answer: "Noch keine ausreichende HRV-/Ruhepuls-Baseline für ein Urteil." };
  }
  const parts = [];
  if (hrvVsBaselinePct != null) {
    parts.push(
      hrvVsBaselinePct >= 0
        ? `Die HRV liegt ${Math.round(hrvVsBaselinePct)} % über der eigenen Basis — der Körper nimmt die Reize an.`
        : `Die HRV liegt ${Math.round(Math.abs(hrvVsBaselinePct))} % unter der eigenen Basis.`
    );
  }
  if (rhrDeltaBpm != null) {
    parts.push(
      rhrDeltaBpm <= 0
        ? "Der Ruhepuls ist nicht gestiegen."
        : `Der Ruhepuls liegt ${Math.round(rhrDeltaBpm)} bpm über dem Ausgangswert.`
    );
  }
  if (shortNightsCount > 0) {
    parts.push(
      `Der Schlaf ist die schwächste Stelle: ${shortNightsCount} Nächte unter ${sleepTargetH} h im Beobachtungsfenster.`
    );
  } else {
    parts.push(`Der Schlaf liegt durchgehend nahe am Ziel von ${sleepTargetH} h.`);
  }

  const bad = (hrvVsBaselinePct ?? 0) < -5 || (rhrDeltaBpm ?? 0) > 3;
  const mixed = shortNightsCount >= 2 || (hrvVsBaselinePct ?? 1) < 0 || (rhrDeltaBpm ?? -1) > 0;
  const verdict = bad ? "angeschlagen" : mixed ? "durchwachsen" : "gut";
  const color = /** @type {VerdictColor} */ (bad ? "warn" : mixed ? "status" : "pos");
  return { verdict, color, answer: parts.join(" ") };
}

/**
 * Frage 4: „Was bremst mich?"
 * @param {{decouplingStableSharePct: number|null, cadenceSharePct: number|null,
 *   cadenceAvg: number|null, cadenceTarget: number, energyDeficitAvgKcal: number|null,
 *   hydrationBelowTargetShare: number|null}} facts
 * @returns {{verdict: string, color: VerdictColor, answer: string}}
 */
export function blockerVerdict({
  decouplingStableSharePct,
  cadenceSharePct,
  cadenceAvg,
  cadenceTarget,
  energyDeficitAvgKcal,
  hydrationBelowTargetShare,
}) {
  const parts = [];
  const issues = [];

  if (decouplingStableSharePct != null) {
    if (decouplingStableSharePct >= 80) {
      parts.push(`Die Entkopplung ist bei ${decouplingStableSharePct} % der Fahrten im grünen Bereich.`);
    } else {
      parts.push(`Nur ${decouplingStableSharePct} % der Fahrten liegen bei der Entkopplung im stabilen Bereich.`);
      issues.push("Entkopplung");
    }
  }
  if (cadenceAvg != null) {
    parts.push(`Die Kadenz liegt im Schnitt bei ${Math.round(cadenceAvg)} RPM (Ziel ${cadenceTarget}).`);
    if (cadenceAvg < cadenceTarget) issues.push("Kadenz");
  }
  if (energyDeficitAvgKcal != null && energyDeficitAvgKcal < 0) {
    parts.push(`Im Schnitt ${Math.round(Math.abs(energyDeficitAvgKcal))} kcal Defizit pro Tag.`);
    issues.push("Energiebilanz");
  }
  if (hydrationBelowTargetShare != null && hydrationBelowTargetShare > 0.3) {
    parts.push(`An ${Math.round(hydrationBelowTargetShare * 100)} % der Fahrttage liegt die Trinkrate unter dem Zielwert.`);
    issues.push("Trinkrate");
  }

  if (!parts.length) {
    return { verdict: "unklar", color: "neutral", answer: "Noch zu wenig Datenbasis für eine Einordnung der Bremser." };
  }

  const verdict = issues.length === 0 ? "keine erkennbaren Bremser" : issues.length === 1 ? "eine Baustelle" : `${issues.length} Baustellen`;
  const color = /** @type {VerdictColor} */ (issues.length === 0 ? "pos" : issues.length === 1 ? "status" : "warn");
  return { verdict, color, answer: parts.join(" ") };
}

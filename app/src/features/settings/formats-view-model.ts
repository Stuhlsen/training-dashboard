/* ============================================================
   FEATURES/SETTINGS/FORMATS-VIEW-MODEL.TS — L1.1 Familienauswahl
   (docs/konzept-progressionssteuerung.md L1.1/L7)

   Reine Funktion, Port von der lokalen `activeSiblingCount()` aus
   ui/settings-panel.js::buildFormatsSection() (Vanilla). Max. zwei aktive
   Familien pro Blockziel — clientseitig geprüft, weil RLS keine
   Kreuzprüfung über mehrere `athlete_formats`-Zeilen kennt.
   ============================================================ */

import type { AthleteFormatEntry } from "../../api/hooks/useAthleteFormats";

/** Zählt aktive Familien (außer `format` selbst), die sich mind. ein
 *  Blockziel mit `format` teilen. */
export function activeSiblingCount(entries: AthleteFormatEntry[], format: AthleteFormatEntry["format"]): number {
  const blockTargets = format.blockTargets as string[];
  let count = 0;
  for (const other of entries) {
    if (other.format.id === format.id || !other.active) continue;
    const otherTargets = other.format.blockTargets as string[];
    if (otherTargets.some((bt) => blockTargets.includes(bt))) count++;
  }
  return count;
}

/** Darf `format` eingeschaltet werden? Ausschalten ist immer erlaubt —
 *  nur das Einschalten kann L1.1 verletzen. `null` = erlaubt, sonst die
 *  Fehlermeldung. */
export function blockedByLimit(entries: AthleteFormatEntry[], format: AthleteFormatEntry["format"]): string | null {
  const blockTargets = format.blockTargets as string[];
  if (!blockTargets.length) return null;
  if (activeSiblingCount(entries, format) >= 2) {
    return `Für "${blockTargets.join(", ")}" sind bereits zwei Familien aktiv — zuerst eine deaktivieren.`;
  }
  return null;
}

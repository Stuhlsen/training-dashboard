/** Kurzes ✓ nach erfolgreichem Speichern — Port von flashSaved() aus
 *  ui/settings-panel.js. Der Aufrufer steuert die Sichtbarkeitsdauer per
 *  eigenem State/Timeout (React unmountet statt DOM-Element zu entfernen). */
export function SavedCheck() {
  return (
    <span style={{ color: "var(--ok)", fontFamily: "var(--font-mono)", fontSize: ".75rem", flexShrink: 0 }}>✓</span>
  );
}

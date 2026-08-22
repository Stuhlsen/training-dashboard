import { fmtDateFull } from "../core/format.js";

/** App-Version + Build-Datum unten auf jeder Seite (Issue #6). Werte kommen
 *  von `vite.config.ts::define` (`__APP_VERSION__`/`__BUILD_DATE__`), zur
 *  Build-Zeit fest eingesetzt — kein Laufzeit-Fetch nötig. */
export function Footer() {
  return (
    <footer
      style={{
        padding: "20px clamp(20px,3vw,48px) 32px",
        textAlign: "center",
        fontFamily: "var(--font-mono)",
        fontSize: ".72rem",
        color: "var(--ink-3)",
        opacity: 0.6,
      }}
    >
      {__APP_VERSION__} · gebaut am {fmtDateFull(__BUILD_DATE__.slice(0, 10))}
    </footer>
  );
}

import type { ReactNode } from "react";

interface AnalysisSectionProps {
  icon: string;
  title: string;
  explainer?: string;
  children: ReactNode;
}

/** Gemeinsamer Sektions-Rahmen für den Analyse-Tab (Etappe 11d, "Grundgerüst")
 *  — Port von `.analysis-section`/`.section-label`/`.analysis-explainer`
 *  (assets/css/components.css + main.css). Von 11e/11f wiederverwendet für
 *  ihre jeweils eigenen Sektionen, deshalb hier bewusst generisch (Icon +
 *  Titel + optionaler Erklärtext + beliebiger Inhalt) statt fest an
 *  Belastung/Intensität gebunden. */
export function AnalysisSection({ icon, title, explainer, children }: AnalysisSectionProps) {
  return (
    <section style={{ marginTop: 8 }}>
      <h2
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--fs-section-label)",
          fontWeight: 500,
          color: "var(--ink-3)",
          textTransform: "uppercase",
          letterSpacing: ".14em",
          borderBottom: "1px solid var(--hair)",
          paddingBottom: 8,
          margin: "0 0 14px",
        }}
      >
        {icon} {title}
      </h2>
      {explainer && (
        <p style={{ fontSize: ".75rem", color: "var(--ink-3)", lineHeight: 1.5, margin: "4px 0 12px", maxWidth: "70ch" }}>
          {explainer}
        </p>
      )}
      {children}
    </section>
  );
}

/** Port von `.analysis-box`. */
export function AnalysisBox({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: "var(--glass-2)",
        border: "1px solid var(--hair)",
        borderRadius: "var(--radius)",
        padding: 16,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Port von `.analysis-empty`. */
export function AnalysisEmpty({ children }: { children: ReactNode }) {
  return <p style={{ fontSize: ".8rem", color: "var(--ink-3)", padding: "12px 0", margin: 0 }}>{children}</p>;
}

/** Port von `.analysis-note`. */
export function AnalysisNote({ children }: { children: ReactNode }) {
  return <p style={{ fontSize: ".68rem", color: "var(--ink-3)", lineHeight: 1.5, marginTop: 10 }}>{children}</p>;
}

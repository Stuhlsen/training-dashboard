import type { ReactNode } from "react";

interface PageShellProps {
  children: ReactNode;
}

/** Gemeinsamer äußerer Breiten-/Rand-Rahmen für alle Hauptseiten (Etappe
 *  11a) — Maße 1:1 aus HeroPage.tsx' Plate-Wrapper übernommen (ohne dessen
 *  3D-Tilt/Parallax, die bleibt Hero-exklusiv), damit Kopfzeile und
 *  Seitenrand auf jeder Seite an derselben horizontalen Position sitzen.
 *  Erzwingt keine Inhaltsbreite — Seiten mit von Natur aus schmalem Inhalt
 *  (z. B. Settings' Formular-Karte) setzen innerhalb dieses Rahmens noch
 *  einen eigenen, engeren Wrapper. */
export function PageShell({ children }: PageShellProps) {
  return (
    <div style={{ width: "100%", maxWidth: 2040, margin: "0 auto", padding: "48px clamp(28px,4vw,80px) 96px" }}>
      {children}
    </div>
  );
}

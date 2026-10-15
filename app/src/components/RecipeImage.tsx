/* ============================================================
   COMPONENTS/RECIPEIMAGE.TSX — Rezeptbild mit Platzhalter
   (Fahrplan 25, R1; Entscheidungen Q2, Q9)

   Festes Seitenverhältnis (`aspect-ratio`) — kein Layoutsprung beim
   Laden. Bild fehlt oder lädt nicht → ruhige Fläche mit dezentem
   Teller-Symbol. Das Label "Serviervorschlag (KI-Bild)" ist eine
   Überlagerung unten links (nicht ins Bild gebrannt) und erscheint
   nur, wenn die Quelle ein KI-Bild ist UND das Bild wirklich zu
   sehen ist.

   Die Quelle löst `core/recipe-image.js` auf — F3 hängt dort die
   KI-Bilder ein, diese Komponente bleibt gleich.
   ============================================================ */

import { useState, type CSSProperties } from "react";
import { recipeImageSource } from "../core/recipe-image.js";

export const AI_IMAGE_LABEL = "Serviervorschlag (KI-Bild)";

export interface RecipeImageProps {
  /** Nur diese Felder werden gelesen; null/undefined = Platzhalter */
  recipe: { title: string; imageUrl?: string | null; externalId?: string | null } | null | undefined;
  /** CSS-aspect-ratio, z. B. "4 / 3" oder "16 / 9" */
  ratio?: string;
  /** Standard: Rezepttitel. "" = rein dekorativ (Titel steht schon daneben). */
  alt?: string;
  /** Platzhalter-Symbol kleiner zeichnen (z. B. in kleinen Kacheln) */
  compact?: boolean;
  style?: CSSProperties;
}

const FRAME_STYLE: CSSProperties = {
  position: "relative",
  width: "100%",
  overflow: "hidden",
  background: "var(--surface-tile)",
};

const FILL_STYLE: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%" };

const LABEL_STYLE: CSSProperties = {
  position: "absolute",
  left: 8,
  bottom: 8,
  maxWidth: "calc(100% - 16px)",
  padding: "2px 8px",
  borderRadius: 6,
  background: "rgba(8, 9, 12, 0.78)",
  color: "var(--ink)",
  fontFamily: "var(--font-mono)",
  fontSize: ".68rem",
  lineHeight: 1.4,
  pointerEvents: "none",
};

export function PlateIcon({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ flex: "none", color: "var(--ink-3)", opacity: 0.7 }}
    >
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function Placeholder({ compact }: { compact: boolean }) {
  return (
    <div
      data-testid="recipe-image-placeholder"
      aria-hidden="true"
      style={{ ...FILL_STYLE, display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <PlateIcon size={compact ? 24 : 40} />
    </div>
  );
}

/** Eigener Zustand je Quelle: der Aufrufer setzt `key={src}`, damit ein
 *  Quellenwechsel Lade-/Fehlerzustand zurücksetzt (kein Effekt nötig). */
function LoadedImage({ src, ai, alt, compact }: { src: string; ai: boolean; alt: string; compact: boolean }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");

  if (status === "error") return <Placeholder compact={compact} />;

  return (
    <>
      {status === "loading" && <Placeholder compact={compact} />}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("error")}
        style={{
          ...FILL_STYLE,
          objectFit: "cover",
          opacity: status === "loaded" ? 1 : 0,
          transition: "opacity 160ms ease-out",
        }}
      />
      {ai && status === "loaded" && <span style={LABEL_STYLE}>{AI_IMAGE_LABEL}</span>}
    </>
  );
}

export function RecipeImage({ recipe, ratio = "4 / 3", alt, compact = false, style }: RecipeImageProps) {
  const source = recipeImageSource(recipe);

  return (
    <div style={{ ...FRAME_STYLE, aspectRatio: ratio, ...style }}>
      {source ? (
        <LoadedImage
          key={source.src}
          src={source.src}
          ai={source.ai}
          alt={alt ?? recipe?.title ?? ""}
          compact={compact}
        />
      ) : (
        <Placeholder compact={compact} />
      )}
    </div>
  );
}

import { useMouseParallax } from "../hooks/useMouseParallax";

/** `app/public/background.png` (1376×768) — von Alex geliefert, da
 *  `DesignSync.get_file` bei 256 KiB deckelt und die in
 *  `.image-slots.state.json` eingebettete Bild-Data-URI nur `truncated`
 *  lieferte (s. docs/vorlage-design-import.md §2). Alles unter
 *  `app/public/` liefert Vite unverändert unter `/`, kein Import/Bundling
 *  nötig. Pfad über `BASE_URL` (nicht hart "/"), sonst 404 auf GitHub
 *  Pages unter `/training-dashboard/` (Etappe 10c, Live-Verifikation). */
const BACKGROUND_IMAGE_URL = `${import.meta.env.BASE_URL}background.png`;

const PAN_AMOUNT_X = 14;
const PAN_AMOUNT_Y = 10;
const BASE_SCALE = "scale(1.06)";

/** Viewport-weiter Hintergrund (Foto + zwei Gradient-Overlays), einmal in
 *  `App.tsx` gemountet — deckt Login und alle eingeloggten Seiten gleichermaßen
 *  ab (Alex' Vorgabe), ohne den Hintergrund in `LoginPage.tsx` UND `Layout.tsx`
 *  zu duplizieren. `position:fixed` macht die Platzierung im Elementbaum
 *  irrelevant für die Optik. Quelle: `Hero-Weitwinkel.dc.html`
 *  (Design-Projekt `fed5c129-1eb1-4ea8-a950-ad70fa39ddad`). */
export function AppBackground() {
  const bgRef = useMouseParallax<HTMLDivElement>(
    (el, nx, ny) => {
      el.style.transform = `${BASE_SCALE} translate(${(-nx * PAN_AMOUNT_X).toFixed(1)}px, ${(-ny * PAN_AMOUNT_Y).toFixed(1)}px)`;
    },
    (el) => {
      el.style.transform = BASE_SCALE;
    },
  );

  return (
    <div style={{ position: "fixed", inset: "-6% -4%", zIndex: 0 }} aria-hidden="true">
      <div ref={bgRef} style={{ position: "absolute", inset: 0, transform: BASE_SCALE, willChange: "transform" }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url(${BACKGROUND_IMAGE_URL})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              "radial-gradient(58% 62% at 50% 58%, rgba(226,158,96,0.18) 0%, rgba(200,132,84,0.07) 44%, transparent 72%)",
            mixBlendMode: "screen",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              "linear-gradient(180deg, rgba(6,8,13,0.78) 0%, rgba(6,8,13,0.34) 26%, rgba(6,8,13,0.30) 58%, rgba(6,8,13,0.86) 100%), " +
              "linear-gradient(90deg, rgba(6,8,13,0.66) 0%, rgba(6,8,13,0.18) 34%, rgba(6,8,13,0.18) 66%, rgba(6,8,13,0.62) 100%)",
          }}
        />
      </div>
    </div>
  );
}

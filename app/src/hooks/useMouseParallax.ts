import { useEffect, useRef } from "react";

interface UseMouseParallaxOptions {
  enabled?: boolean;
}

/** Schreibt bei jeder Mausbewegung ein Transform imperativ auf das über die
 *  zurückgegebene Ref gebundene Element — kein React-State pro Tick (Muster
 *  aus dem Code-Review zu `buildHeroViewModel`: State-getriebene Re-Renders
 *  bei hochfrequenten Events vermeiden). `apply`/`reset` laufen über eine
 *  interne Ref, damit der `mousemove`-Listener nicht bei jedem Render neu
 *  gebunden wird, auch wenn der Aufrufer Inline-Funktionen übergibt.
 *
 *  Respektiert `prefers-reduced-motion` — kein Listener, kein Transform.
 *  Der Claude-Design-Export selbst prüft das nicht, ist aber Hauskonvention
 *  (AGENTS.md, Design-Abschnitt: "prefers-reduced-motion wird respektiert").
 *
 *  `apply(el, nx, ny)` bekommt die auf [-1, 1] normalisierte Mausposition
 *  relativ zur Fenstermitte und schreibt selbst das gewünschte Transform
 *  (rotate für einen Tilt, translate für einen Pan) — deshalb hier nicht
 *  festgelegt: zwei Aufrufer mit unterschiedlicher Wirkung (Hintergrund-Pan
 *  in `AppBackground`, Content-Tilt in `HeroPage`) teilen sich denselben
 *  Hook, keine verdoppelte Mausverfolgungs-Logik. */
export function useMouseParallax<T extends HTMLElement>(
  apply: (el: T, nx: number, ny: number) => void,
  reset: (el: T) => void,
  { enabled = true }: UseMouseParallaxOptions = {},
) {
  const ref = useRef<T>(null);
  const applyRef = useRef(apply);
  const resetRef = useRef(reset);

  // Ref-Schreiben gehört in einen Effekt, nicht in den Render-Body (React
  // 19s `react-hooks/refs`-Regel) — deshalb zwei schlanke Sync-Effekte statt
  // einer Direktzuweisung oben. Der eigentliche mousemove-Listener unten
  // hängt bewusst NICHT von apply/reset ab (nur [enabled]), sonst würde er
  // bei jedem Render neu gebunden, wenn der Aufrufer Inline-Funktionen
  // übergibt (Regelfall hier).
  useEffect(() => {
    applyRef.current = apply;
  }, [apply]);
  useEffect(() => {
    resetRef.current = reset;
  }, [reset]);

  useEffect(() => {
    if (!enabled) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const onMove = (e: MouseEvent) => {
      const el = ref.current;
      if (!el) return;
      const nx = (e.clientX / window.innerWidth - 0.5) * 2;
      const ny = (e.clientY / window.innerHeight - 0.5) * 2;
      applyRef.current(el, nx, ny);
    };
    const onLeave = () => {
      const el = ref.current;
      if (el) resetRef.current(el);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseout", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseout", onLeave);
    };
  }, [enabled]);

  return ref;
}

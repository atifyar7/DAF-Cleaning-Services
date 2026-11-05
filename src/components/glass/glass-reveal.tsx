"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useRef, type ReactNode } from "react";
import { createScene, drawFrame, wiperAt, type Scene } from "./glass-scene";
import { BLADE_ORIGIN, SQUEEGEE_ASPECT, Squeegee } from "./squeegee";

gsap.registerPlugin(ScrollTrigger, useGSAP);
// Mobile address bars resize the viewport while scrolling; that must not rebuild the scene.
ScrollTrigger.config({ ignoreMobileResize: true });

type Props = { children: ReactNode; hint: string; className?: string };

/**
 * Hero covered by dirty glass. As the visitor scrolls, a squeegee wipes it clean along an "S" path
 * and the real hero underneath shows through. The content stays in the page and clickable throughout;
 * the glass only draws over it. Visitors who prefer reduced motion get the clean hero straight away.
 */
export function GlassReveal({ children, hint, className = "" }: Props) {
  const root = useRef<HTMLElement>(null);
  const surface = useRef<HTMLCanvasElement>(null);
  const wiper = useRef<HTMLDivElement>(null);
  const cue = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const media = gsap.matchMedia();

      media.add("(prefers-reduced-motion: no-preference)", () => {
        const section = root.current!;
        const canvas = surface.current!;
        const blade = wiper.current!;
        const hintEl = cue.current!;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const state = { progress: 0 };
        let scene: Scene | null = null;
        let size = "";

        gsap.set(blade, {
          xPercent: -BLADE_ORIGIN.x * 100,
          yPercent: -BLADE_ORIGIN.y * 100,
          transformOrigin: `${BLADE_ORIGIN.x * 100}% ${BLADE_ORIGIN.y * 100}%`,
        });

        const render = () => {
          if (!scene) return;
          drawFrame(ctx, scene, state.progress);
          const { point } = wiperAt(scene, state.progress);
          gsap.set(blade, { x: point.x, y: point.y, rotation: (point.angle * 180) / Math.PI + 90 });
          hintEl.style.opacity = String(Math.max(0, 1 - state.progress * 30));
        };

        // Repaints the glass only when the hero's size actually changes.
        const build = () => {
          const width = section.clientWidth;
          const height = section.clientHeight;
          if (!width || !height) return;
          const key = `${width}x${height}`;
          if (key !== size) {
            size = key;
            const ratio = Math.min(window.devicePixelRatio || 1, width < 768 ? 1 : 1.5);
            scene = createScene(width, height, ratio, document.documentElement.dir === "rtl");
            canvas.width = Math.round(width * ratio);
            canvas.height = Math.round(height * ratio);
            blade.style.width = `${scene.blade}px`;
            blade.style.height = `${scene.blade * SQUEEGEE_ASPECT}px`;
          }
          render();
        };

        build();
        canvas.dataset.ready = "";
        blade.dataset.ready = "";

        const header = document.querySelector("header");
        gsap.to(state, {
          progress: 1,
          ease: "none",
          onUpdate: render,
          scrollTrigger: {
            trigger: section,
            start: () => `top ${header?.offsetHeight ?? 0}px`,
            end: () => `+=${Math.round(section.offsetHeight * (window.innerWidth < 768 ? 1.3 : 1.7))}`,
            pin: true,
            // GSAP turns spacing off inside flex parents (<main> is one), which would let the next
            // sections scroll over the pinned glass.
            pinSpacing: true,
            scrub: 0.6,
            invalidateOnRefresh: true,
            onRefresh: build,
          },
        });

        // The pin's measurements while the page loads undo the browser's own scroll restoration,
        // so on reload or back/forward the position is saved and put back after each refresh.
        const memoryKey = `glass-scroll:${location.pathname}`;
        const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
        let restoreTo = 0;
        try {
          if (navigation && navigation.type !== "navigate") restoreTo = Number(sessionStorage.getItem(memoryKey)) || 0;
        } catch {
          // Storage can be unavailable in private browsing; the page simply starts at the top.
        }
        const restore = () => {
          if (restoreTo > 0) window.scrollTo({ top: restoreTo, behavior: "instant" });
          if (document.readyState === "complete") restoreTo = 0;
        };
        const save = () => {
          try {
            sessionStorage.setItem(memoryKey, String(Math.round(window.scrollY)));
          } catch {
            // Ignored: only a convenience.
          }
        };
        restore();
        ScrollTrigger.addEventListener("refresh", restore);
        window.addEventListener("pagehide", save);

        return () => {
          ScrollTrigger.removeEventListener("refresh", restore);
          window.removeEventListener("pagehide", save);
          delete canvas.dataset.ready;
          delete blade.dataset.ready;
        };
      });

      return () => media.revert();
    },
    { scope: root },
  );

  return (
    <section ref={root} className={`glass-hero relative isolate overflow-hidden ${className}`}>
      {children}
      <canvas ref={surface} aria-hidden="true" className="glass-surface pointer-events-none absolute inset-0 z-10 h-full w-full" />
      <div ref={wiper} aria-hidden="true" className="glass-wiper pointer-events-none absolute top-0 left-0 z-20">
        <Squeegee />
      </div>
      <div
        ref={cue}
        aria-hidden="true"
        className="glass-hint pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center"
      >
        <span className="flex items-center gap-3 rounded-full bg-hero/80 px-4 py-2 text-sm font-medium text-white shadow-card backdrop-blur-sm">
          <span className="relative flex h-7 w-4.5 justify-center rounded-full border-2 border-white/80">
            <span className="glass-hint-dot mt-1 h-1.5 w-1 rounded-full bg-highlight" />
          </span>
          {hint}
        </span>
      </div>
    </section>
  );
}

"use client";

import Lenis from "lenis";
import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

/**
 * The single smooth-scroll engine for brand-facing pages.
 * Disabled entirely under reduced motion; final states render immediately.
 */
export function SmoothScroll({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.6,
    });
    lenis.on("scroll", ScrollTrigger.update);

    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);

    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener("load", refresh);
    document.fonts?.ready.then(refresh).catch(() => {});

    return () => {
      window.removeEventListener("load", refresh);
      gsap.ticker.remove(tick);
      lenis.destroy();
      ScrollTrigger.getAll().forEach((t) => t.kill());
    };
  }, []);

  return <>{children}</>;
}

/** Reveals elements marked [data-reveal] once as they enter the viewport. */
export function ScrollReveals() {
  useEffect(() => {
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let revertAnimations: (() => void) | undefined;

    const syncMotionPreference = () => {
      revertAnimations?.();
      revertAnimations = undefined;
      if (motionPreference.matches) return;

      const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
      if (nodes.length === 0) return;

      const context = gsap.context(() => {
        nodes.forEach((node, index) => {
          gsap.from(node, {
            y: 26,
            autoAlpha: 0,
            duration: 0.72,
            ease: "power3.out",
            delay: (index % 3) * 0.06,
            scrollTrigger: { trigger: node, start: "top 88%", once: true },
          });
        });
      });
      revertAnimations = () => context.revert();
    };

    syncMotionPreference();
    motionPreference.addEventListener("change", syncMotionPreference);
    return () => {
      motionPreference.removeEventListener("change", syncMotionPreference);
      revertAnimations?.();
    };
  }, []);

  return null;
}

/**
 * Composed hero intro: heading words rise, then supporting copy, then cards.
 * Navigation, message and CTA remain visible and usable before it completes.
 */
export function heroIntro(root: HTMLElement) {
  const ctx = gsap.context(() => {
    const words = root.querySelectorAll("[data-word]");
    const timeline = gsap.timeline({ defaults: { ease: "expo.out" } });
    if (words.length) timeline.from(words, { yPercent: 115, duration: 0.9, stagger: 0.09 }, 0);
    timeline.from(
      root.querySelectorAll("[data-hero-copy]"),
      { y: 18, autoAlpha: 0, duration: 0.7, stagger: 0.08 },
      0.35,
    );
    timeline.from(
      root.querySelectorAll("[data-hero-card]"),
      { y: 34, autoAlpha: 0, duration: 0.8, stagger: 0.07 },
      0.5,
    );
  }, root);
  return () => ctx.revert();
}

/** Word-by-word heading reveal used on inner brand pages. */
export function RevealHeading({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const words = text.split(" ");
    if (words.length < 2) return;
    node.setAttribute("aria-label", text);
    node.querySelectorAll<HTMLElement>("[data-word]").forEach((word) => word.setAttribute("aria-hidden", "true"));
    const ctx = gsap.context(() => {
      gsap.from(node.querySelectorAll("[data-word]"), {
        yPercent: 110,
        opacity: 0,
        duration: 0.8,
        ease: "expo.out",
        stagger: 0.08,
      });
    }, node);
    return () => ctx.revert();
  }, [text]);

  return (
    <h1 ref={ref} className={className}>
      {text.split(" ").map((word, i) => (
        <span key={`${word}-${i}`} className="inline-block overflow-hidden align-bottom">
          <span data-word="" className="inline-block">
            {word}
          </span>
          {i < text.split(" ").length - 1 ? "\u00A0" : ""}
        </span>
      ))}
    </h1>
  );
}

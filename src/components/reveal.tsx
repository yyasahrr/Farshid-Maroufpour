"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Content is visible in server HTML. Motion is an optional enhancement. */
function useReveal<T extends HTMLElement>(lines = false) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // A display:contents wrapper has no intersection box; keep its children visible.
    if (getComputedStyle(node).display === "contents") return;
    if (node.getBoundingClientRect().top < window.innerHeight) return;
    const targets = lines
      ? Array.from(node.querySelectorAll<HTMLElement>("[data-reveal-line]"))
      : [node];
    const show = (visible: boolean) =>
      targets.forEach((target) => {
        target.dataset.visible = String(visible);
      });
    show(false);
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          show(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -30px 0px", threshold: 0.05 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      show(true);
    };
  }, [lines]);
  return ref;
}

export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      data-visible="true"
      style={{ transitionDelay: `${delay}ms` }}
      className={`reveal ${className}`}
    >
      {children}
    </div>
  );
}

export function RevealText({
  lines,
  className = "",
  stagger = 120,
}: {
  lines: string[];
  className?: string;
  stagger?: number;
}) {
  const ref = useReveal<HTMLParagraphElement>(true);
  return (
    <p ref={ref} className={className}>
      {lines.map((line, index) => (
        <span
          key={line}
          data-visible="true"
          data-reveal-line
          style={{ transitionDelay: `${index * stagger}ms` }}
          className="reveal-clip block"
        >
          {line}
        </span>
      ))}
    </p>
  );
}

/** One transform per animation frame, only while in view, without React rerenders. */
export function Parallax({
  children,
  distance = 40,
  className = "",
}: {
  children: ReactNode;
  distance?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches) return;
    let frame = 0;
    let active = true;
    const update = () => {
      frame = 0;
      if (!active || motion.matches) return;
      const rect = (node.parentElement ?? node).getBoundingClientRect();
      const progress = Math.max(
        -1,
        Math.min(
          1,
          (window.innerHeight / 2 - rect.top - rect.height / 2) /
            window.innerHeight,
        ),
      );
      node.style.transform = `translate3d(0, ${(progress * distance).toFixed(2)}px, 0)`;
    };
    const schedule = () => {
      if (!frame && active) frame = window.requestAnimationFrame(update);
    };
    const observer = new IntersectionObserver(([entry]) => {
      active = entry.isIntersecting;
      if (active) schedule();
    });
    const onMotionChange = () => {
      if (motion.matches) node.style.transform = "none";
      else schedule();
    };
    observer.observe(node);
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    motion.addEventListener("change", onMotionChange);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      motion.removeEventListener("change", onMotionChange);
      if (frame) cancelAnimationFrame(frame);
      node.style.transform = "none";
    };
  }, [distance]);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

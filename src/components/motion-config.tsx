"use client";

import { MotionConfig } from "framer-motion";

/**
 * One motion policy for the whole app: `reducedMotion="user"` makes every
 * framer transform/layout animation collapse to a safe jump for users who
 * set prefers-reduced-motion — no per-component opt-in to remember.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

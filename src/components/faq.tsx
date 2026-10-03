"use client";

import { useState } from "react";

export type FaqItem = { q: string; a: string };

/** Accessible accordion: real buttons, aria-expanded/controls, keyboard operable. */
export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="divide-y divide-white/10">
      {items.map((item, i) => {
        const expanded = open === i;
        return (
          <div key={item.q}>
            <h3>
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={`faq-panel-${i}`}
                id={`faq-btn-${i}`}
                onClick={() => setOpen(expanded ? null : i)}
                className="focus-ring flex w-full items-center justify-between gap-4 py-5 text-right"
              >
                <span className={`font-bold transition ${expanded ? "text-gold" : ""}`}>
                  {item.q}
                </span>
                <span
                  aria-hidden="true"
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/12 text-xs transition ${
                    expanded ? "rotate-45 border-gold/50 text-gold" : ""
                  }`}
                >
                  +
                </span>
              </button>
            </h3>
            <div
              id={`faq-panel-${i}`}
              role="region"
              aria-labelledby={`faq-btn-${i}`}
              hidden={!expanded}
              className="pb-5 text-sm leading-8 text-bone/60"
            >
              {item.a}
            </div>
          </div>
        );
      })}
    </div>
  );
}

"use client";

import { useState, type FormEvent } from "react";

/** Star rating for enrolled students; lands PENDING and shows after moderation. */
export function CourseReviewForm({ courseId, initialRating, initialComment }: { courseId: number; initialRating: number; initialComment: string }) {
  const [rating, setRating] = useState(initialRating || 5);
  const [comment, setComment] = useState(initialComment);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/courses/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ courseId, rating, comment }),
      });
      const data: { ok?: boolean; message?: string; error?: string } = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "نظر ثبت نشد.");
      setMessage({ kind: "ok", text: data.message ?? "نظر شما ثبت شد." });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "نظر ثبت نشد." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="ui-panel !p-5">
      <fieldset>
        <legend className="text-sm font-black">امتیاز شما به این دوره</legend>
        <div dir="ltr" className="mt-2 flex gap-1" role="radiogroup" aria-label="امتیاز از پنج">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={rating === value}
              aria-label={`${value} ستاره`}
              onClick={() => setRating(value)}
              className={`focus-ring min-h-11 min-w-11 rounded-lg text-xl ${value <= rating ? "text-[#c59b4b]" : "text-[#c9cfc8]"}`}
            >
              ★
            </button>
          ))}
        </div>
      </fieldset>
      <label className="ui-label mt-3 block" htmlFor="course-review-comment">
        توضیح نظر (اختیاری)
      </label>
      <textarea
        id="course-review-comment"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={600}
        rows={3}
        placeholder="چه چیزی در این دوره برایتان مفید بود؟"
        className="ui-input mt-1 w-full resize-y rounded-xl border border-[#d9ded6] bg-white p-3 text-sm"
      />
      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={`mt-3 rounded-lg p-3 text-sm ${message.kind === "ok" ? "bg-[#e3f0e9] text-[#2f4a3a]" : "bg-rose-50 text-rose-700"}`}>
          {message.text}
        </p>
      )}
      <button type="submit" disabled={busy} className="ui-button mt-3 w-full">
        {busy ? "در حال ثبت…" : "ثبت نظر"}
      </button>
    </form>
  );
}

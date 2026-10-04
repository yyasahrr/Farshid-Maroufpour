"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Icon } from "@/components/icons";

const minutesLabel = (m: number) => (m > 0 ? `${m.toLocaleString("fa-IR")} دقیقه` : "—");

export type PlayerLesson = {
  id: number;
  title: string;
  videoUrl: string | null;
  durationMin: number;
  notes: string;
  freePreview: boolean;
};
export type PlayerGroup = { title: string; lessons: (PlayerLesson & { completed: boolean })[] };

/**
 * The learn surface: sidebar of lessons grouped by سرفصل, one video pane,
 * server-confirmed progress. Completion is a click ("دیدم") — the honest
 * minimum that works without a real LMS player backend.
 */
export function CoursePlayer({
  courseSlug,
  courseId,
  groups,
  initialLessonId,
}: {
  courseSlug: string;
  courseId: number;
  groups: PlayerGroup[];
  initialLessonId: number | null;
}) {
  const flat = useMemo(() => groups.flatMap((g) => g.lessons), [groups]);
  const [completed, setCompleted] = useState<Set<number>>(
    () => new Set(flat.filter((l) => l.completed).map((l) => l.id)),
  );
  const [activeId, setActiveId] = useState<number | null>(
    initialLessonId ?? flat.find((l) => !completed.has(l.id))?.id ?? flat[0]?.id ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const active = flat.find((l) => l.id === activeId) ?? null;
  const doneCount = flat.filter((l) => completed.has(l.id)).length;
  const progress = flat.length === 0 ? 0 : Math.round((doneCount / flat.length) * 100);

  async function toggleCompleted(lessonId: number, value: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/courses/progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ courseId, lessonId, completed: value }),
      });
      const data: { ok?: boolean; error?: string; status?: string } = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "وضعیت ثبت نشد.");
      setCompleted((previous) => {
        const next = new Set(previous);
        if (value) next.add(lessonId);
        else next.delete(lessonId);
        return next;
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "وضعیت ثبت نشد.");
    } finally {
      setBusy(false);
    }
  }

  function go(offset: number) {
    if (!active) return;
    const index = flat.findIndex((l) => l.id === active.id);
    const next = flat[index + offset];
    if (next) setActiveId(next.id);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]" data-course-player={courseSlug}>
      <aside className="ui-panel lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto !p-0">
        <div className="border-b border-bone-150 p-4">
          <p className="text-xs font-bold text-bone-500">
            پیشرفت شما — {doneCount.toLocaleString("fa-IR")} از {flat.length.toLocaleString("fa-IR")} درس
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-bone-200" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-brand-400 transition-[width] duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <nav aria-label="درس‌ها" className="p-2">
          {groups.map((group) => (
            <div key={group.title} className="mb-2">
              <p className="px-2 pb-1 pt-3 text-[11px] font-black uppercase tracking-wide text-brass-800">{group.title}</p>
              <ol className="space-y-1">
                {group.lessons.map((lesson) => {
                  const isDone = completed.has(lesson.id);
                  const isActive = lesson.id === activeId;
                  return (
                    <li key={lesson.id}>
                      <button
                        type="button"
                        onClick={() => setActiveId(lesson.id)}
                        aria-current={isActive ? "true" : undefined}
                        data-lesson={lesson.id}
                        className={`focus-ring flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-right text-sm transition-colors ${isActive ? "bg-brand-50 font-black text-bone-700" : "hover:bg-bone-100 text-[#3c4743]"}`}
                      >
                        <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${isDone ? "border-brand-400 bg-brand-400 text-white" : "border-[#c9cfc8] text-transparent"}`}>
                          <Icon name="check" className="h-3 w-3" />
                        </span>
                        <span className="min-w-0 flex-1 truncate">{lesson.title}</span>
                        <span className="shrink-0 text-[11px] text-bone-500">{minutesLabel(lesson.durationMin)}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </nav>
      </aside>

      <section aria-label="پخش درس" className="min-w-0">
        {!active ? (
          <div className="ui-panel text-sm leading-8 text-bone-500">این دوره هنوز درسی ندارد.</div>
        ) : (
          <article className="ui-panel overflow-hidden !p-0">
            <div className="aspect-video bg-black">
              {active.videoUrl ? (
                 
                <video key={active.videoUrl} controls playsInline preload="metadata" className="h-full w-full" src={active.videoUrl} />
              ) : (
                <div className="flex h-full items-center justify-center p-6 text-center text-sm text-white/70">
                  برای این درس هنوز ویدیو آپلود نشده است.
                </div>
              )}
            </div>
            <div className="p-5">
              <h2 className="text-lg font-black">{active.title}</h2>
              {active.notes && <p className="mt-2 whitespace-pre-line text-sm leading-8 text-bone-500">{active.notes}</p>}
              {error && (
                <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
                  {error}
                </p>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => go(-1)} disabled={flat.findIndex((l) => l.id === active.id) === 0} className="ui-button ui-button-quiet !min-h-11 !px-4 !text-xs">
                  درس قبلی
                </button>
                <button
                  type="button"
                  onClick={() => void toggleCompleted(active.id, !completed.has(active.id))}
                  disabled={busy}
                  className={`ui-button !min-h-11 !px-5 !text-xs ${completed.has(active.id) ? "" : "!bg-brand-400"}`}
                >
                  {completed.has(active.id) ? "لغو تکمیل درس" : "این درس را دیدم"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const index = flat.findIndex((l) => l.id === active.id);
                    const next = flat[index + 1];
                    if (!completed.has(active.id)) void toggleCompleted(active.id, true);
                    if (next) setActiveId(next.id);
                  }}
                  disabled={busy || flat.findIndex((l) => l.id === active.id) === flat.length - 1}
                  className="ui-button !min-h-11 !px-4 !text-xs"
                >
                  دیدن درس بعدی
                </button>
              </div>
            </div>
          </article>
        )}
      </section>
    </div>
  );
}

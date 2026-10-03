import { SkeletonGrid } from "@/components/ui-cards";

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass-card rounded-2xl p-5">
            <div className="skeleton h-3 w-24 rounded" />
            <div className="skeleton mt-3 h-7 w-16 rounded" />
          </div>
        ))}
      </div>
      <div className="mt-10">
        <SkeletonGrid count={2} media={false} />
      </div>
    </div>
  );
}

import { SkeletonGrid } from "@/components/ui-cards";

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-16">
      <div className="skeleton h-8 w-48 rounded" />
      <div className="mt-8">
        <SkeletonGrid count={3} />
      </div>
    </div>
  );
}

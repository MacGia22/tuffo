import { Bone, CardBone, LoadingStatus } from "@/components/skeleton";

/** The pools list while it loads (and any /app page without its own skeleton). */
export default function Loading() {
  return (
    <>
      <LoadingStatus />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Bone className="h-9 w-48" />
          <Bone className="h-5 w-72 max-w-full" />
        </div>
        <Bone className="h-10 w-28 rounded-xl" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <CardBone key={i} className="p-5">
            <Bone className="h-6 w-40" />
            <Bone className="h-4 w-56 max-w-full" />
            <div className="flex flex-wrap gap-1.5">
              <Bone className="h-6 w-24 rounded-full" />
              <Bone className="h-6 w-36 rounded-full" />
              <Bone className="h-6 w-20 rounded-full" />
            </div>
            <Bone className="mt-2 h-5 w-48" />
          </CardBone>
        ))}
      </div>
    </>
  );
}

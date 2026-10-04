import { Bone, LoadingStatus } from "@/components/skeleton";

/** Trends while they load: the back link, the title with the range switch, the chart frame. */
export default function Loading() {
  return (
    <>
      <LoadingStatus />
      <div className="flex min-h-11 items-center">
        <Bone className="h-5 w-32" />
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Bone className="h-8 w-28" />
        <Bone className="h-12 w-56 rounded-xl" />
      </div>
      <div aria-hidden="true" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3 sm:p-5">
        <Bone className="h-5 w-40" />
        <Bone className="h-64 w-full rounded-xl" />
        <Bone className="h-24 w-full rounded-xl" />
        <Bone className="h-24 w-full rounded-xl" />
      </div>
    </>
  );
}

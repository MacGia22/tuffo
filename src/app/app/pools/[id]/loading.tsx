import { Bone, CardBone, LoadingStatus } from "@/components/skeleton";

/** A pool's Today page while it loads: the header, the last-test card and two cards. */
export default function Loading() {
  return (
    <>
      <LoadingStatus />
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex h-11 items-center">
            <Bone className="h-8 w-44" />
          </div>
          <Bone className="h-5 w-64 max-w-full" />
        </div>
        <Bone className="hidden h-11 w-24 rounded-xl md:block" />
      </div>
      <CardBone className="flex-row flex-wrap items-center justify-between">
        <div className="flex flex-col gap-2">
          <Bone className="h-6 w-40" />
          <Bone className="h-4 w-52" />
        </div>
        <Bone className="h-11 w-28 rounded-xl" />
      </CardBone>
      <CardBone>
        <Bone className="h-6 w-36" />
        <Bone className="h-16 w-full rounded-xl" />
        <Bone className="h-16 w-full rounded-xl" />
      </CardBone>
      <CardBone>
        <Bone className="h-6 w-32" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {[0, 1, 2, 3].map((i) => (
            <Bone key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      </CardBone>
    </>
  );
}

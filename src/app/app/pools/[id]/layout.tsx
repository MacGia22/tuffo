import { Suspense } from "react";
import { PoolBottomBar } from "@/components/pool-bottom-bar";
import { isUuid } from "@/lib/form-data";

/** A pool's pages: on phones, a bar with the pool's sections at the bottom of the screen. */
export default async function PoolLayout({ children, params }: LayoutProps<"/app/pools/[id]">) {
  const { id } = await params;
  return (
    <>
      {children}
      {isUuid(id) ? (
        <Suspense fallback={null}>
          <PoolBottomBar poolId={id} />
        </Suspense>
      ) : null}
    </>
  );
}

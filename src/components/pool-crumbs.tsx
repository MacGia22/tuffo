import Link from "next/link";

/** "Your pools / Backyard / Log a dose" */
export function PoolCrumbs({ poolId, poolName, here }: { poolId: string; poolName: string; here?: string }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-muted">
      <Link href="/app" className="hover:text-foreground">
        Your pools
      </Link>{" "}
      /{" "}
      {here ? (
        <>
          <Link href={`/app/pools/${poolId}`} className="hover:text-foreground">
            {poolName}
          </Link>{" "}
          / {here}
        </>
      ) : (
        poolName
      )}
    </nav>
  );
}

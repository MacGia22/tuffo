"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarIcon, DropIcon, GearIcon, PlusIcon, WrenchIcon } from "@/components/icons";
import { logLinks, MenuButton, useCurrentPath } from "@/components/log-menu";

const tab =
  "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-semibold";
const item = `${tab} text-muted hover:text-foreground`;
const current = `${tab} text-lagoon`;

/**
 * A pool's sections on phones (below 768 px): Today, Plan, Log (+ menu), Maintenance,
 * Settings. Wider screens use the links on the page instead.
 */
export function PoolBottomBar({ poolId }: { poolId: string }) {
  const pathname = usePathname();
  const here = useCurrentPath();
  const pool = `/app/pools/${poolId}`;
  const on = (path: string) => pathname === path;

  return (
    <nav
      id="pool-bar"
      aria-label="Pool sections"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <div className="mx-auto flex max-w-lg items-stretch">
        <Link href={pool} aria-current={on(pool) ? "page" : undefined} className={on(pool) ? current : item}>
          <DropIcon />
          Today
        </Link>
        <Link href={`${pool}#plan`} className={item}>
          <CalendarIcon />
          Plan
        </Link>
        <div className="flex flex-1 items-stretch justify-center">
          <MenuButton
            label="Log something"
            placement="above"
            items={logLinks(poolId, here)}
            buttonClassName={`${item} w-full`}
          >
            <PlusIcon className="h-6 w-6 text-lagoon" />
            Log
          </MenuButton>
        </div>
        <Link
          href={`${pool}/maintenance`}
          aria-current={on(`${pool}/maintenance`) ? "page" : undefined}
          className={on(`${pool}/maintenance`) ? current : item}
        >
          <WrenchIcon />
          Maintenance
        </Link>
        <Link
          href={`${pool}/settings`}
          aria-current={on(`${pool}/settings`) ? "page" : undefined}
          className={on(`${pool}/settings`) ? current : item}
        >
          <GearIcon />
          Settings
        </Link>
      </div>
    </nav>
  );
}

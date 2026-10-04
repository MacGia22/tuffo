"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DropIcon, GearIcon, PlusIcon, TrendIcon, WrenchIcon } from "@/components/icons";
import { LinkPending } from "@/components/link-pending";
import { MenuButton, useCurrentPath } from "@/components/log-menu";
import { logLinks } from "@/lib/log-links";

const tab =
  "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 text-xs font-semibold";
const item = `${tab} text-muted hover:text-foreground`;
const current = `${tab} text-lagoon`;
const inner = "flex max-w-full flex-col items-center gap-0.5";

/**
 * A pool's sections on phones (below 768 px): Today, Trends, Log (+ menu), Maintenance,
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
        <Tab href={pool} on={on(pool)}>
          <DropIcon />
          Today
        </Tab>
        <Tab href={`${pool}/trends`} on={on(`${pool}/trends`)}>
          <TrendIcon />
          Trends
        </Tab>
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
        <Tab href={`${pool}/maintenance`} on={on(`${pool}/maintenance`)}>
          <WrenchIcon />
          Maintenance
        </Tab>
        <Tab href={`${pool}/settings`} on={on(`${pool}/settings`)}>
          <GearIcon />
          Settings
        </Tab>
      </div>
    </nav>
  );
}

/** One section link; dims while its page loads so the tap shows it registered. */
function Tab({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={on ? "page" : undefined} className={on ? current : item}>
      <LinkPending className={inner}>{children}</LinkPending>
    </Link>
  );
}

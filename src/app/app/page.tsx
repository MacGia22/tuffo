import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isClockSkewError, retryAllOnClockSkew } from "@/lib/supabase/retry";
import { reportClockSkew } from "@/lib/supabase/settle";
import { formatVolume } from "@/lib/format";

interface PoolRow {
  id: string;
  name: string;
  volume_l: number;
  sanitizer: "chlorine" | "swg";
  place_label: string | null;
  created_at: string;
}

export default async function PoolsPage() {
  const supabase = await createSupabaseServerClient();
  const [{ data: pools, error }, { data: profile }] = await retryAllOnClockSkew(() =>
    Promise.all([
      supabase
        .from("pools")
        .select("id, name, volume_l, sanitizer, place_label, created_at")
        .order("created_at", { ascending: true })
        .returns<PoolRow[]>(),
      supabase.from("profiles").select("units").maybeSingle<{ units: "us" | "metric" }>(),
    ]),
  );
  const units = profile?.units ?? "us";
  if (isClockSkewError(error)) {
    // Still refused after the retries: record how far ahead the token is, to fix it for good.
    const { data } = await supabase.auth.getSession();
    reportClockSkew("pools-list", data.session?.access_token);
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Your pools</h1>
          <p className="text-muted">Pick a pool to log a test or see what the weather has been doing to it.</p>
        </div>
        <Link
          href="/app/pools/new"
          className="rounded-xl bg-lagoon px-4 py-2.5 text-sm font-semibold text-white hover:bg-lagoon-deep"
        >
          Add a pool
        </Link>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          Could not load your pools ({error.message}). If this keeps happening, the database schema may not be applied
          yet.
        </p>
      ) : null}

      {pools && pools.length === 0 ? (
        <section className="flex flex-col items-start gap-4 rounded-2xl border border-dashed border-border p-8">
          <h2 className="text-xl font-semibold">No pools yet</h2>
          <p className="max-w-lg text-muted">
            Add your pool with its volume and town. Tuffo uses the town only to pick the weather for it; no address is
            stored.
          </p>
          <Link
            href="/app/pools/new"
            className="rounded-xl bg-lagoon px-4 py-2.5 text-sm font-semibold text-white hover:bg-lagoon-deep"
          >
            Add your first pool
          </Link>
        </section>
      ) : null}

      {pools && pools.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2">
          {pools.map((pool) => (
            <li
              key={pool.id}
              className="flex h-full flex-col rounded-2xl border border-border bg-surface transition hover:border-lagoon"
            >
              <Link href={`/app/pools/${pool.id}`} className="flex flex-1 flex-col gap-2 p-5 pb-3">
                <span className="text-lg font-semibold">{pool.name}</span>
                <span className="text-sm text-muted">
                  {formatVolume(pool.volume_l, units)} ·{" "}
                  {pool.sanitizer === "swg" ? "Salt water chlorinator" : "Chlorine"}
                  {pool.place_label ? ` · ${pool.place_label}` : ""}
                </span>
              </Link>
              <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-border px-5 py-2.5 text-sm">
                <Link href={`/app/pools/${pool.id}`} className="font-semibold text-lagoon">
                  Open
                </Link>
                <Link href={`/app/pools/${pool.id}/settings`} className="font-semibold text-lagoon">
                  Settings and equipment
                </Link>
                <Link href={`/app/pools/${pool.id}/location?from=%2Fapp`} className="font-semibold text-lagoon">
                  {pool.place_label ? "Change location" : "Set location"}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

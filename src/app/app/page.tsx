import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
  const [{ data: pools, error }, { data: profile }] = await Promise.all([
    supabase
      .from("pools")
      .select("id, name, volume_l, sanitizer, place_label, created_at")
      .order("created_at", { ascending: true })
      .returns<PoolRow[]>(),
    supabase.from("profiles").select("units").maybeSingle<{ units: "us" | "metric" }>(),
  ]);
  const units = profile?.units ?? "us";

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
          Could not load your pools ({error.message}). If this keeps happening, the database schema may not be
          applied yet.
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
            <li key={pool.id}>
              <Link
                href={`/app/pools/${pool.id}`}
                className="flex h-full flex-col gap-2 rounded-2xl border border-border bg-surface p-5 transition hover:border-lagoon"
              >
                <span className="text-lg font-semibold">{pool.name}</span>
                <span className="text-sm text-muted">
                  {formatVolume(pool.volume_l, units)} · {pool.sanitizer === "swg" ? "Salt water chlorinator" : "Chlorine"}
                  {pool.place_label ? ` · ${pool.place_label}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

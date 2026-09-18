import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateTime, formatTemperature, formatVolume, type Units } from "@/lib/format";

interface Pool {
  id: string;
  name: string;
  volume_l: number;
  sanitizer: "chlorine" | "swg";
  surface: string;
  covered: boolean;
  place_label: string | null;
  timezone: string | null;
}

interface Reading {
  id: string;
  taken_at: string;
  fc: number | null;
  cc: number | null;
  ph: number | null;
  ta: number | null;
  ch: number | null;
  cya: number | null;
  salt: number | null;
  water_temp_c: number | null;
  method: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: PageProps<"/app/pools/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return { title: "Pool" };
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("pools").select("name").eq("id", id).maybeSingle<{ name: string }>();
  return { title: data?.name ?? "Pool" };
}

function cell(value: number | null, decimals = 1) {
  return value === null ? "—" : value.toFixed(decimals);
}

export default async function PoolPage({ params }: PageProps<"/app/pools/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data: pool }, { data: readings }, { data: profile }] = await Promise.all([
    supabase
      .from("pools")
      .select("id, name, volume_l, sanitizer, surface, covered, place_label, timezone")
      .eq("id", id)
      .maybeSingle<Pool>(),
    supabase
      .from("readings")
      .select("id, taken_at, fc, cc, ph, ta, ch, cya, salt, water_temp_c, method")
      .eq("pool_id", id)
      .order("taken_at", { ascending: false })
      .limit(30)
      .returns<Reading[]>(),
    supabase.from("profiles").select("units").maybeSingle<{ units: Units }>(),
  ]);
  if (!pool) notFound();
  const units = profile?.units ?? "us";
  const tz = pool.timezone ?? undefined;
  const latest = readings?.[0];

  return (
    <>
      <nav className="text-sm text-muted">
        <Link href="/app" className="hover:text-foreground">
          Your pools
        </Link>{" "}
        / {pool.name}
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{pool.name}</h1>
          <p className="text-muted">
            {formatVolume(pool.volume_l, units)} · {pool.sanitizer === "swg" ? "Salt water chlorinator" : "Chlorine"} ·{" "}
            {pool.surface}
            {pool.covered ? " · covered" : ""}
            {pool.place_label ? ` · ${pool.place_label}` : ""}
          </p>
        </div>
        <Link
          href={`/app/pools/${pool.id}/readings/new`}
          className="rounded-xl bg-lagoon px-4 py-2.5 text-sm font-semibold text-white hover:bg-lagoon-deep"
        >
          Log a test
        </Link>
      </div>

      {latest ? (
        <section aria-labelledby="latest" className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <h2 id="latest" className="sr-only">
            Latest test
          </h2>
          {(
            [
              ["Free chlorine", cell(latest.fc), "ppm"],
              ["pH", cell(latest.ph, 2), ""],
              ["Alkalinity", cell(latest.ta, 0), "ppm"],
              ["Calcium", cell(latest.ch, 0), "ppm"],
              ["Stabilizer", cell(latest.cya, 0), "ppm"],
              [
                "Water",
                latest.water_temp_c === null ? "—" : formatTemperature(latest.water_temp_c, units),
                "",
              ],
            ] as const
          ).map(([name, value, unit]) => (
            <div key={name} className="rounded-2xl border border-border bg-surface p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted">{name}</div>
              <div className="mt-1 font-display text-2xl font-semibold">
                {value} <span className="text-sm font-normal text-muted">{unit}</span>
              </div>
            </div>
          ))}
          <p className="text-sm text-muted sm:col-span-3 lg:col-span-6">
            Tested {formatDateTime(latest.taken_at, tz)} · {latest.method.replace(/_/g, " ")}
          </p>
        </section>
      ) : (
        <section className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-border p-8">
          <h2 className="text-xl font-semibold">No tests logged yet</h2>
          <p className="max-w-lg text-muted">
            Log your first water test. From the second one on, Tuffo can show what the weather did in between and
            what to add next.
          </p>
          <Link
            href={`/app/pools/${pool.id}/readings/new`}
            className="rounded-xl bg-lagoon px-4 py-2.5 text-sm font-semibold text-white hover:bg-lagoon-deep"
          >
            Log the first test
          </Link>
        </section>
      )}

      {readings && readings.length > 0 ? (
        <section aria-labelledby="history" className="flex flex-col gap-3">
          <h2 id="history" className="text-xl font-semibold">
            History
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-3">When</th>
                  <th className="px-3 py-3 text-right">FC</th>
                  <th className="px-3 py-3 text-right">CC</th>
                  <th className="px-3 py-3 text-right">pH</th>
                  <th className="px-3 py-3 text-right">TA</th>
                  <th className="px-3 py-3 text-right">CH</th>
                  <th className="px-3 py-3 text-right">CYA</th>
                  <th className="px-3 py-3 text-right">Salt</th>
                  <th className="px-3 py-3 text-right">Temp</th>
                </tr>
              </thead>
              <tbody>
                {readings.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-4 py-2.5 whitespace-nowrap">{formatDateTime(r.taken_at, tz)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{cell(r.fc)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{cell(r.cc)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{cell(r.ph, 2)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{cell(r.ta, 0)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{cell(r.ch, 0)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{cell(r.cya, 0)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{cell(r.salt, 0)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {r.water_temp_c === null ? "—" : formatTemperature(r.water_temp_c, units)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}

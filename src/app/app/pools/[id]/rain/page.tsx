import type { Metadata } from "next";
import { safeReturnTo } from "@/lib/return-to";
import { notFound } from "next/navigation";
import { PoolCrumbs } from "@/components/pool-crumbs";
import type { Units } from "@/lib/format";
import { isUuid } from "@/lib/form-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isRainDate, rainForForm } from "@/lib/weather/own-rain";
import { localDateRange } from "@/lib/weather/summary";
import { RainForm } from "./rain-form";

export const metadata: Metadata = { title: "Rain at your pool" };

function dayTitle(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function RainPage({ params, searchParams }: PageProps<"/app/pools/[id]/rain">) {
  const { id } = await params;
  const returnTo = safeReturnTo((await searchParams).from, `/app/pools/${id}`);
  if (!isUuid(id)) notFound();
  const query = await searchParams;

  const supabase = await createSupabaseServerClient();
  const [{ data: pool }, { data: profile }] = await Promise.all([
    supabase
      .from("pools")
      .select("id, name, timezone, cell_id")
      .eq("id", id)
      .maybeSingle<{ id: string; name: string; timezone: string | null; cell_id: string | null }>(),
    supabase.from("profiles").select("units").maybeSingle<{ units: Units }>(),
  ]);
  if (!pool) notFound();
  const units = profile?.units ?? "us";
  const now = new Date().toISOString();
  const today = localDateRange(now, now, pool.timezone ?? "UTC").to;
  const asked = typeof query.date === "string" ? query.date : today;
  const date = isRainDate(asked, today) ? asked : today;

  const [{ data: daily }, { data: forecast }, { data: own }] = await Promise.all([
    pool.cell_id
      ? supabase
          .from("weather_daily")
          .select("precipitation_mm")
          .eq("cell_id", pool.cell_id)
          .eq("date", date)
          .maybeSingle<{ precipitation_mm: number | null }>()
      : Promise.resolve({ data: null }),
    pool.cell_id && date === today
      ? supabase
          .from("weather_forecast")
          .select("precipitation_mm")
          .eq("cell_id", pool.cell_id)
          .eq("date", date)
          .maybeSingle<{ precipitation_mm: number | null }>()
      : Promise.resolve({ data: null }),
    supabase
      .from("pool_rain")
      .select("rain_mm")
      .eq("pool_id", pool.id)
      .eq("date", date)
      .maybeSingle<{ rain_mm: number | string }>(),
  ]);
  const areaMm = daily?.precipitation_mm ?? forecast?.precipitation_mm ?? null;
  const ownMm = own ? Number(own.rain_mm) : null;
  const unit = units === "us" ? "in" : "mm";

  return (
    <>
      <PoolCrumbs poolId={pool.id} poolName={pool.name} here="Rain at your pool" />
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">Rain on {dayTitle(date)}</h1>
        <p className="text-muted">
          The weather service estimates rain for an area a few miles across. Storms can drop very different amounts a
          mile apart, so if you know what fell at your pool (a rain gauge, or a good guess), enter it here. Tuffo uses
          it for this day instead of the area figure: in the chart, between tests, in how fast your pool uses chlorine
          and in the 7-day plan.
        </p>
      </div>
      <p className="text-sm">
        Area figure:{" "}
        <span className="font-semibold tabular-nums">
          {areaMm === null ? "not known yet" : `${rainForForm(areaMm, units)} ${unit}`}
        </span>
        {date === today && areaMm !== null ? " (so far, from the forecast)" : ""}
      </p>
      <RainForm
        returnTo={returnTo}
        poolId={pool.id}
        date={date}
        units={units}
        current={ownMm === null ? null : rainForForm(ownMm, units)}
      />
    </>
  );
}

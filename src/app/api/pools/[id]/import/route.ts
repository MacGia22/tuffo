import { getCurrentUser } from "@/lib/auth/user";
import { isUuid } from "@/lib/form-data";
import { DELIMITERS, parseCsv } from "@/lib/import/csv";
import type { FilterType } from "@/lib/equipment";
import { planUpkeep, poolDay, splitAgainstLogged, upkeepTask, type LoggedReading, type NearDuplicate } from "@/lib/import/logged";
import { IMPORT_FIELDS, MAX_IMPORT_BYTES, NUMBER_FIELDS, planImport, type ImportField, type Mapping } from "@/lib/import/readings";
import { taskById } from "@/lib/maintenance";
import { recomputeAfterResponse } from "@/lib/model/recompute";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { failed } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const PAGE = 1000;

export interface ImportSummary {
  ok: true;
  /** Rows that would be (or were) added. */
  ready: number;
  alreadyLogged: number;
  /** Rows on the same day as a logged test with the same results. */
  nearDuplicates: number;
  nearDuplicateLines: NearDuplicate[];
  /** Whether those are in `ready` (the owner ticked "import anyway"). */
  nearDuplicatesIncluded: boolean;
  duplicatesInFile: number;
  overLimit: number;
  problemCount: number;
  problems: { line: number; reason: string }[];
  imported: number;
  /** Upkeep the file marks as done (Pool Math's Backwashed, Cleaned Filter, Vacuumed). */
  upkeep: {
    /** Days marked, per column. */
    backwash: number;
    filterClean: number;
    vacuum: number;
    /** Backwash events and maintenance days that would be (or were) logged. */
    toLog: number;
    alreadyLogged: number;
    notTracked: number;
    /** The maintenance task "Cleaned filter" counts as, for this pool's filter. */
    filterTask: string | null;
    /** The maintenance task a backwash also counts as (sand and DE filters). */
    backwashTask: string | null;
  };
  upkeepLogged: number;
  upkeepError: string | null;
}

function fail(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

function readMapping(value: unknown, columns: number): Mapping | null {
  if (!value || typeof value !== "object") return null;
  const mapping: Mapping = {};
  const keys = new Set<string>(IMPORT_FIELDS.map((f) => f.key));
  for (const [key, index] of Object.entries(value as Record<string, unknown>)) {
    if (!keys.has(key)) continue;
    if (index === null || index === undefined || index === "") continue;
    if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= columns) return null;
    mapping[key as ImportField] = index;
  }
  return mapping;
}

/**
 * POST { csv, delimiter, decimal, mapping, dateOrder, tempUnit, dryRun, importNearDuplicates, logUpkeep } for
 * one of the signed-in user's pools. Parses and checks the file on the server (the preview
 * in the browser runs the same code), drops rows in the same minute as a test already
 * logged and, unless importNearDuplicates, rows on the same day with the same results.
 * With dryRun false it inserts the rest in one statement as method "imported" and, with
 * logUpkeep, the backwash events and maintenance days the file marks (failing open). The
 * chlorine model is refitted once, after the response.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: poolId } = await params;
  if (!isUuid(poolId)) return fail("Unknown pool.", 404);
  const user = await getCurrentUser();
  if (!user) return fail("Sign in first.", 401);
  if (!request.headers.get("content-type")?.includes("application/json")) return fail("Send JSON.", 415);

  const raw = await request.text();
  if (raw.length > MAX_IMPORT_BYTES * 1.2) return fail("Files up to 1 MB, please.", 413);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return fail("Send JSON.");
  }
  const csv = typeof body.csv === "string" ? body.csv : "";
  if (!csv) return fail("The file is empty.");
  if (csv.length > MAX_IMPORT_BYTES) return fail("Files up to 1 MB, please.", 413);

  const supabase = await createSupabaseServerClient();
  const { data: pool } = await supabase
    .from("pools")
    .select("id, timezone")
    .eq("id", poolId)
    .maybeSingle<{ id: string; timezone: string | null }>();
  if (!pool) return fail("Unknown pool.", 404);

  const delimiter = DELIMITERS.find((d) => d === body.delimiter);
  const table = parseCsv(csv, delimiter);
  const mapping = readMapping(body.mapping, table.headers.length);
  if (!mapping) return fail("The column choices do not match the file.");
  const plan = planImport(table, {
    mapping,
    dateOrder: body.dateOrder === "dmy" ? "dmy" : "mdy",
    tempUnit: body.tempUnit === "C" ? "C" : "F",
    decimal: body.decimal === "," ? "," : ".",
    timeZone: pool.timezone ?? "UTC",
  });

  const timeZone = pool.timezone ?? "UTC";
  const importNearDuplicates = body.importNearDuplicates === true;
  const logUpkeep = body.logUpkeep === true;

  // Tests already logged across the file's time span (a day either side, for same-day
  // matches), page by page.
  const logged: LoggedReading[] = [];
  const backwashDays = new Set<string>();
  const doneDays = new Set<string>();
  let filterType: FilterType | null = null;
  if (plan.rows.length > 0) {
    const times = plan.rows.map((r) => Date.parse(r.taken_at));
    const from = new Date(Math.min(...times) - 36 * 3_600_000).toISOString();
    const to = new Date(Math.max(...times) + 36 * 3_600_000).toISOString();
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabase
        .from("readings")
        .select(`taken_at, ${NUMBER_FIELDS.join(", ")}`)
        .eq("pool_id", poolId)
        .gte("taken_at", from)
        .lte("taken_at", to)
        .order("taken_at")
        .range(offset, offset + PAGE - 1)
        .returns<Record<string, unknown>[]>();
      if (error) return fail(failed("import check", error.message), 500);
      for (const r of data ?? []) {
        const values: LoggedReading["values"] = {};
        for (const f of NUMBER_FIELDS) if (r[f] !== null && r[f] !== undefined) values[f] = Number(r[f]);
        logged.push({ taken_at: r.taken_at as string, values });
      }
      if (!data || data.length < PAGE) break;
    }

    // Upkeep already logged and the pool's filter. Fails open: no upkeep is offered.
    if (plan.rows.some((r) => r.upkeep.length > 0)) {
      const [events, done, filter] = await Promise.all([
        supabase.from("events").select("occurred_at").eq("pool_id", poolId).eq("kind", "backwash").gte("occurred_at", from).lte("occurred_at", to).limit(PAGE),
        supabase
          .from("pool_maintenance")
          .select("task, done_on")
          .eq("pool_id", poolId)
          .gte("done_on", poolDay(from, timeZone))
          .lte("done_on", poolDay(to, timeZone))
          .limit(PAGE)
          .returns<{ task: string; done_on: string }[]>(),
        supabase
          .from("pool_equipment")
          .select("details")
          .eq("pool_id", poolId)
          .eq("kind", "filter")
          .is("removed_on", null)
          .limit(1)
          .returns<{ details: Record<string, unknown> | null }[]>(),
      ]);
      if (events.error || done.error || filter.error) {
        console.error("import: could not load upkeep", events.error?.message ?? done.error?.message ?? filter.error?.message);
      }
      for (const e of events.data ?? []) backwashDays.add(poolDay(e.occurred_at as string, timeZone));
      for (const d of done.data ?? []) doneDays.add(`${d.task}|${d.done_on}`);
      const type = filter.data?.[0]?.details?.type;
      filterType = type === "sand" || type === "cartridge" || type === "de" ? type : null;
    }
  }
  const split = splitAgainstLogged(plan.rows, logged, timeZone, importNearDuplicates);
  const fresh = split.fresh;
  const upkeep = planUpkeep(plan.rows, { timeZone, filterType, backwashDays, doneDays });
  const upkeepCount = upkeep.events.length + upkeep.maintenance.length;

  let imported = 0;
  let upkeepLogged = 0;
  let upkeepError: string | null = null;
  if (body.dryRun !== true) {
    if (fresh.length > 0) {
      const { error } = await supabase.from("readings").insert(
        fresh.map((r) => ({
          pool_id: poolId,
          taken_at: r.taken_at,
          ...r.values,
          water_temp_c: r.water_temp_c,
          method: "imported",
          notes: r.notes,
        })),
      );
      if (error) {
        const notYet = /readings_method_check/.test(error.message);
        return fail(notYet ? "Import is not available yet. Try again in a few minutes." : failed("import", error.message), 500);
      }
      imported = fresh.length;
      recomputeAfterResponse(poolId);
    }
    if (logUpkeep && upkeepCount > 0) {
      const results = await Promise.all([
        upkeep.events.length
          ? supabase.from("events").insert(upkeep.events.map((e) => ({ pool_id: poolId, occurred_at: e.occurred_at, kind: "backwash" })))
          : null,
        upkeep.maintenance.length
          ? supabase.from("pool_maintenance").insert(upkeep.maintenance.map((m) => ({ pool_id: poolId, task: m.task, done_on: m.done_on })))
          : null,
      ]);
      const [eventsResult, maintenanceResult] = results;
      if (eventsResult && !eventsResult.error) upkeepLogged += upkeep.events.length;
      if (maintenanceResult && !maintenanceResult.error) upkeepLogged += upkeep.maintenance.length;
      const message = eventsResult?.error?.message ?? maintenanceResult?.error?.message;
      if (message) {
        console.error("import: could not log upkeep", message);
        upkeepError = "Some upkeep could not be logged. Add it on the Maintenance page.";
      }
      if (upkeep.events.length && !imported) recomputeAfterResponse(poolId);
    }
  }

  const summary: ImportSummary = {
    ok: true,
    ready: fresh.length,
    alreadyLogged: split.alreadyLogged,
    nearDuplicates: split.nearDuplicates.length,
    nearDuplicateLines: split.nearDuplicates.slice(0, 20),
    nearDuplicatesIncluded: importNearDuplicates,
    duplicatesInFile: plan.duplicatesInFile,
    overLimit: plan.overLimit,
    problemCount: plan.problems.length,
    problems: plan.problems.slice(0, 20),
    imported,
    upkeep: {
      backwash: upkeep.days.backwash,
      filterClean: upkeep.days.filter_clean,
      vacuum: upkeep.days.vacuum,
      toLog: upkeepCount,
      alreadyLogged: upkeep.alreadyLogged,
      notTracked: upkeep.notTracked,
      filterTask: taskById(upkeepTask("filter_clean", filterType) ?? "")?.label ?? null,
      backwashTask: taskById(upkeepTask("backwash", filterType) ?? "")?.label ?? null,
    },
    upkeepLogged,
    upkeepError,
  };
  return Response.json(summary);
}

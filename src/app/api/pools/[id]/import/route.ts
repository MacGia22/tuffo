import { getCurrentUser } from "@/lib/auth/user";
import { isUuid } from "@/lib/form-data";
import { parseCsv } from "@/lib/import/csv";
import {
  IMPORT_FIELDS,
  MAX_IMPORT_BYTES,
  minuteKey,
  planImport,
  withoutLogged,
  type ImportField,
  type Mapping,
} from "@/lib/import/readings";
import { recomputeAfterResponse } from "@/lib/model/recompute";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const PAGE = 1000;

export interface ImportSummary {
  ok: true;
  /** Rows that would be (or were) added. */
  ready: number;
  alreadyLogged: number;
  duplicatesInFile: number;
  overLimit: number;
  problemCount: number;
  problems: { line: number; reason: string }[];
  imported: number;
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
 * POST { csv, mapping, dateOrder, tempUnit, dryRun } for one of the signed-in user's
 * pools. Parses and checks the file on the server (the preview in the browser runs the
 * same code), drops rows in the same minute as a test already logged, and with
 * dryRun false inserts the rest in one statement as method "imported". The chlorine
 * model is refitted once, after the response.
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

  const table = parseCsv(csv);
  const mapping = readMapping(body.mapping, table.headers.length);
  if (!mapping) return fail("The column choices do not match the file.");
  const plan = planImport(table, {
    mapping,
    dateOrder: body.dateOrder === "dmy" ? "dmy" : "mdy",
    tempUnit: body.tempUnit === "C" ? "C" : "F",
    timeZone: pool.timezone ?? "UTC",
  });

  // Minutes already logged across the file's time span, page by page.
  const logged = new Set<string>();
  if (plan.rows.length > 0) {
    const times = plan.rows.map((r) => Date.parse(r.taken_at));
    const from = new Date(Math.min(...times) - 60_000).toISOString();
    const to = new Date(Math.max(...times) + 60_000).toISOString();
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabase
        .from("readings")
        .select("taken_at")
        .eq("pool_id", poolId)
        .gte("taken_at", from)
        .lte("taken_at", to)
        .order("taken_at")
        .range(offset, offset + PAGE - 1);
      if (error) return fail(`Could not check for tests already logged (${error.message}).`, 500);
      for (const r of data ?? []) logged.add(minuteKey(r.taken_at as string));
      if (!data || data.length < PAGE) break;
    }
  }
  const fresh = withoutLogged(plan.rows, logged);

  let imported = 0;
  if (body.dryRun !== true && fresh.length > 0) {
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
      return fail(notYet ? "Import is not available yet. Try again in a few minutes." : `Could not import (${error.message}).`, 500);
    }
    imported = fresh.length;
    recomputeAfterResponse(poolId);
  }

  const summary: ImportSummary = {
    ok: true,
    ready: fresh.length,
    alreadyLogged: plan.rows.length - fresh.length,
    duplicatesInFile: plan.duplicatesInFile,
    overLimit: plan.overLimit,
    problemCount: plan.problems.length,
    problems: plan.problems.slice(0, 20),
    imported,
  };
  return Response.json(summary);
}

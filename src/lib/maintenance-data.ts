import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isEquipmentKind, type FeederType, type FilterType, type HeaterType } from "@/lib/equipment";
import {
  cellHoursUsed,
  maintenanceStatus,
  pressureStatus,
  type CellHours,
  type MaintenancePool,
  type PressureStatus,
  type TaskStatus,
} from "@/lib/maintenance";
import { pumpHoursPerDay, type PumpSegment } from "@/lib/pump";
import { localDateRange } from "@/lib/weather/summary";

/**
 * Loads what the maintenance views need for one pool: its equipment, the upkeep log,
 * filter pressure and (on request) the salt cell's and the pump's hours. Works with the signed-in
 * client (row-level security) or the service key (the alert job). Fails open: before the
 * migration lands, or on any error, it gives null and the page shows no maintenance.
 */

export interface EquipmentNow {
  kind: "pump" | "feeder" | "filter" | "heater";
  model: string | null;
  type: string | null;
  details: Record<string, unknown>;
  installedOn: string;
}

export interface PoolMaintenance {
  today: string;
  pool: MaintenancePool;
  overrides: Record<string, unknown>;
  statuses: TaskStatus[];
  pressure: PressureStatus | null;
  equipment: EquipmentNow[];
  /** The pump's running hours since it was installed, from the pump schedules (on request). */
  pumpHours: CellHours | null;
  cell: {
    model: string | null;
    installedOn: string | null;
    hours: CellHours | null;
    /** Hours a day the cell makes chlorine now: pump hours times the setting. */
    hoursPerDay: number | null;
  } | null;
  /** Recent completions, newest first. */
  history: { id: string; task: string; doneOn: string }[];
  /** Every completion loaded (up to 1000), newest first: for checks against install dates. */
  log: { task: string; doneOn: string }[];
  /** Recent pressure readings, newest first. */
  readings: { id: string; readOn: string; kpa: number; clean: boolean }[];
}

interface PoolRow {
  sanitizer: "chlorine" | "swg";
  timezone: string | null;
  maintenance_intervals: Record<string, unknown> | null;
  swg_cell_installed_on: string | null;
  swg_cell_model: string | null;
}

export function poolLocalDate(timeZone: string | null, now = Date.now()): string {
  const iso = new Date(now).toISOString();
  return localDateRange(iso, iso, timeZone ?? "UTC").to;
}

export async function loadPoolMaintenance(
  client: SupabaseClient,
  poolId: string,
  options: { cellHours?: boolean; now?: number } = {},
): Promise<PoolMaintenance | null> {
  try {
    const [{ data: pool, error }, { data: equipment }, { data: done, error: doneError }, { data: pressure }] =
      await Promise.all([
        client
          .from("pools")
          .select("sanitizer, timezone, maintenance_intervals, swg_cell_installed_on, swg_cell_model")
          .eq("id", poolId)
          .maybeSingle<PoolRow>(),
        client
          .from("pool_equipment")
          .select("kind, model, details, installed_on")
          .eq("pool_id", poolId)
          .is("removed_on", null)
          .returns<{ kind: EquipmentNow["kind"]; model: string | null; details: Record<string, unknown> | null; installed_on: string }[]>(),
        client
          .from("pool_maintenance")
          .select("id, task, done_on")
          .eq("pool_id", poolId)
          .order("done_on", { ascending: false })
          .limit(1000)
          .returns<{ id: string; task: string; done_on: string }[]>(),
        client
          .from("pool_pressure")
          .select("id, read_on, kpa, clean, created_at")
          .eq("pool_id", poolId)
          .order("read_on", { ascending: false })
          .limit(200)
          .returns<{ id: string; read_on: string; kpa: number | string; clean: boolean; created_at: string }[]>(),
      ]);
    if (error || doneError || !pool) return null;
    const today = poolLocalDate(pool.timezone, options.now);
    // Only current pump, feeder, filter and heater rows (earlier salt cells are history only).
    const items: EquipmentNow[] = (equipment ?? []).filter((e) => isEquipmentKind(e.kind)).map((e) => ({
      kind: e.kind,
      model: e.model,
      type: typeof e.details?.type === "string" ? e.details.type : null,
      details: e.details ?? {},
      installedOn: e.installed_on,
    }));
    const typeOf = (kind: EquipmentNow["kind"]) => items.find((e) => e.kind === kind)?.type ?? null;
    const filter = items.find((e) => e.kind === "filter") ?? null;
    const maintenancePool: MaintenancePool = {
      sanitizer: pool.sanitizer,
      hasPump: items.some((e) => e.kind === "pump"),
      filterType: typeOf("filter") as FilterType | null,
      heaterType: typeOf("heater") as HeaterType | null,
      feederType: typeOf("feeder") as FeederType | null,
    };

    // Same-day readings in the order they were logged.
    const readingRows = [...(pressure ?? [])].sort((a, b) =>
      a.read_on === b.read_on ? (a.created_at < b.created_at ? 1 : -1) : a.read_on < b.read_on ? 1 : -1,
    );
    const readings = readingRows.map((r) => ({ id: r.id, readOn: r.read_on, kpa: Number(r.kpa), clean: r.clean }));
    const pressureNow = pressureStatus([...readings].reverse(), filter?.installedOn ?? null);
    const history = (done ?? [])
      .map((d) => ({ id: d.id, task: d.task, doneOn: d.done_on }))
      .sort((a, b) => (a.doneOn < b.doneOn ? 1 : a.doneOn > b.doneOn ? -1 : 0));
    const overrides = pool.maintenance_intervals ?? {};
    const installedOn = (kind: EquipmentNow["kind"]) => items.find((e) => e.kind === kind)?.installedOn ?? null;
    const statuses = maintenanceStatus({
      pool: maintenancePool,
      overrides,
      done: history,
      pressure: pressureNow,
      today,
      installedOn: {
        filter: installedOn("filter"),
        pump: installedOn("pump"),
        heater: installedOn("heater"),
        feeder: installedOn("feeder"),
        cell: pool.swg_cell_installed_on,
      },
    });

    // Pump schedules, for the cell's chlorine hours and the pump's running hours.
    const pumpItem = items.find((e) => e.kind === "pump") ?? null;
    const wantCell = pool.sanitizer === "swg" && Boolean(pool.swg_cell_installed_on);
    let schedules: { effective_from: string; cell_hours: number | string; segments: PumpSegment[] | null }[] = [];
    if (options.cellHours && (wantCell || pumpItem)) {
      const { data } = await client
        .from("pump_schedules")
        .select("effective_from, cell_hours, segments")
        .eq("pool_id", poolId)
        // Oldest first, and of two saved for the same moment the later one wins.
        .order("effective_from")
        .order("created_at")
        .limit(1000)
        .returns<{ effective_from: string; cell_hours: number | string; segments: PumpSegment[] | null }[]>();
      schedules = data ?? [];
    }
    // Hours are counted on the pool's own days, not UTC days.
    const localDay = (iso: string) => poolLocalDate(pool.timezone, Date.parse(iso));

    let pumpHours: CellHours | null = null;
    if (options.cellHours && pumpItem && schedules.length > 0) {
      const spans = schedules
        .map((s) => ({ from: localDay(s.effective_from), hours: Array.isArray(s.segments) ? pumpHoursPerDay(s.segments) : null }))
        .filter((s): s is { from: string; hours: number } => s.hours !== null);
      pumpHours = cellHoursUsed({ installedOn: pumpItem.installedOn, today, schedules: spans, settings: [] });
    }

    let cell: PoolMaintenance["cell"] = null;
    if (pool.sanitizer === "swg") {
      let hours: CellHours | null = null;
      let hoursPerDay: number | null = null;
      if (options.cellHours && pool.swg_cell_installed_on) {
        const { data: settings } = await client
          .from("events")
          .select("occurred_at, value")
          .eq("pool_id", poolId)
          .eq("kind", "cell_setting")
          // Oldest first; of two the same minute, the one logged later wins.
          .order("occurred_at")
          .order("created_at")
          .limit(2000)
          .returns<{ occurred_at: string; value: number | string | null }[]>();
        const spans = schedules.map((s) => ({ from: localDay(s.effective_from), hours: Number(s.cell_hours) }));
        const changes = (settings ?? [])
          .filter((s) => s.value !== null)
          .map((s) => ({ at: localDay(s.occurred_at), percent: Number(s.value) }));
        hours = cellHoursUsed({ installedOn: pool.swg_cell_installed_on, today, schedules: spans, settings: changes });
        // Today's pace, for when the rated hours run out: the last change on or before today
        // (the rows are in order, so the last one that qualifies).
        const latest = <T extends { at: string }>(rows: T[]) => rows.filter((r) => r.at <= today).pop();
        const schedule = latest(spans.map((s) => ({ ...s, at: s.from })));
        const setting = latest(changes);
        if (schedule && Number.isFinite(schedule.hours)) {
          hoursPerDay = schedule.hours * (setting ? Math.max(0, Math.min(100, setting.percent)) / 100 : 1);
        }
      }
      cell = { model: pool.swg_cell_model, installedOn: pool.swg_cell_installed_on, hours, hoursPerDay };
    }

    return {
      today,
      pumpHours,
      pool: maintenancePool,
      overrides,
      statuses,
      pressure: pressureNow,
      equipment: items,
      cell,
      history: history.slice(0, 50),
      log: history.map((h) => ({ task: h.task, doneOn: h.doneOn })),
      readings: readings.slice(0, 20),
    };
  } catch (err) {
    console.error(`[maintenance] pool ${poolId}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * The set-up checklist on a new pool's page: what makes the advice, the plan and the
 * reminders work. Pure; the page passes what exists.
 */

export interface SetupInput {
  poolId: string;
  swg: boolean;
  hasLocation: boolean;
  hasTest: boolean;
  hasEquipment: boolean;
  hasFilter: boolean;
  cellInstalled: boolean;
  hasCleanPressure: boolean;
  hasPumpSchedule: boolean;
  alertsOn: boolean;
}

export interface SetupStep {
  key: string;
  label: string;
  done: boolean;
  href: string;
}

export function setupSteps(input: SetupInput): SetupStep[] {
  const pool = `/app/pools/${input.poolId}`;
  const from = `from=${encodeURIComponent(pool)}`;
  const steps: (SetupStep | null)[] = [
    { key: "location", label: "Set the location", done: input.hasLocation, href: `${pool}/location?${from}` },
    { key: "test", label: "Log the first test", done: input.hasTest, href: `${pool}/readings/new?${from}` },
    { key: "equipment", label: "Add your equipment", done: input.hasEquipment, href: `${pool}/settings` },
    input.swg
      ? { key: "cell", label: "Add the salt cell's install date", done: input.cellInstalled, href: `${pool}/maintenance#life` }
      : null,
    {
      key: "pressure",
      label: "Log the filter's clean pressure",
      done: input.hasCleanPressure,
      href: input.hasFilter ? `${pool}/maintenance#pressure` : `${pool}/settings`,
    },
    input.swg
      ? { key: "pump", label: "Add the pump schedule", done: input.hasPumpSchedule, href: `${pool}/pump?${from}` }
      : null,
    { key: "alerts", label: "Choose email alerts", done: input.alertsOn, href: "/app/account#alerts" },
  ];
  return steps.filter((s): s is SetupStep => s !== null);
}

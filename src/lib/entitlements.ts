import "server-only";

/**
 * What the signed-in person may use. Everything is free during the beta; Premium (3.4)
 * will look up the subscription here, so gating a feature is a change to one function.
 */

/** The 7-day plan: on the pool page and in alert emails. */
export async function canSeePlan(): Promise<boolean> {
  return true;
}

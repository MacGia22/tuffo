/**
 * Right after sign-in, PostgREST can reject a fresh token with "JWT issued at future"
 * because the auth server's clock is ahead of the database's. It clears within a few
 * seconds, so callers retry with growing waits instead of showing an error.
 */

const FUTURE = /issued at future|iat/i;

/** Waits between attempts: 1 s, 2 s, 3 s (about 6 s at worst, only when the error shows up). */
export const CLOCK_SKEW_WAITS_MS = [1000, 2000, 3000];

export function isClockSkewError(error: { message?: string } | null | undefined): boolean {
  return Boolean(error?.message && FUTURE.test(error.message));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function retryOnClockSkew<T extends { error?: { message?: string } | null }>(
  run: () => PromiseLike<T>,
  waits: number[] = CLOCK_SKEW_WAITS_MS,
): Promise<T> {
  let result = await run();
  for (const wait of waits) {
    if (!isClockSkewError(result.error)) return result;
    await sleep(wait);
    result = await run();
  }
  return result;
}

/** Same, for a group of queries (a Promise.all tuple): retried together when any hit the skew. */
export async function retryAllOnClockSkew<T extends readonly unknown[]>(
  run: () => Promise<T>,
  waits: number[] = CLOCK_SKEW_WAITS_MS,
): Promise<T> {
  const skewed = (results: T) =>
    results.some((r) => isClockSkewError((r as { error?: { message?: string } | null })?.error));
  let results = await run();
  for (const wait of waits) {
    if (!skewed(results)) return results;
    await sleep(wait);
    results = await run();
  }
  return results;
}

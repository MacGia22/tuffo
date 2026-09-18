/**
 * Right after sign-in, PostgREST can reject a fresh token with "JWT issued at future"
 * because the auth server's clock is a moment ahead of the database's. It clears
 * within a second, so callers retry once instead of showing an error.
 */

const FUTURE = /issued at future|iat/i;

export function isClockSkewError(error: { message?: string } | null | undefined): boolean {
  return Boolean(error?.message && FUTURE.test(error.message));
}

export async function retryOnClockSkew<T extends { error?: { message?: string } | null }>(
  run: () => PromiseLike<T>,
  waitMs = 1500,
): Promise<T> {
  const first = await run();
  if (!isClockSkewError(first.error)) return first;
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  return run();
}

/** Same, for a group of queries (a Promise.all tuple): retried together when any hit the skew. */
export async function retryAllOnClockSkew<T extends readonly unknown[]>(
  run: () => Promise<T>,
  waitMs = 1500,
): Promise<T> {
  const first = await run();
  const skewed = first.some((r) => isClockSkewError((r as { error?: { message?: string } | null })?.error));
  if (!skewed) return first;
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  return run();
}

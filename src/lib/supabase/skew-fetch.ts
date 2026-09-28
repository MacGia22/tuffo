import { secondsAhead, tokenIssuedAt } from "./skew";

/**
 * fetch for the Supabase server client that waits out "JWT issued at future".
 *
 * Right after sign-in or a session refresh, the database can refuse a brand-new token
 * because its clock is a few seconds behind the auth server's. Every query goes through
 * here, so every page and action retries (1, 2, 3, 4 s: 10 s at most) instead of
 * showing the error. Each retry is logged with how far the token's stamp is ahead of
 * our clock, which tells whether the auth clock runs fast or the database clock slow.
 */

const FUTURE = /issued at future/i;
export const SKEW_RETRY_WAITS_MS = [1000, 2000, 3000, 4000];

type Fetch = typeof fetch;

function authorization(init: RequestInit | undefined): string | null {
  const headers = init?.headers;
  if (!headers) return null;
  if (headers instanceof Headers) return headers.get("authorization");
  if (Array.isArray(headers)) return headers.find(([k]) => k.toLowerCase() === "authorization")?.[1] ?? null;
  const record = headers as Record<string, string>;
  return record.Authorization ?? record.authorization ?? null;
}

export function createSkewRetryFetch(
  base: Fetch = fetch,
  options: { waits?: number[]; log?: (message: string) => void; sleep?: (ms: number) => Promise<unknown> } = {},
): Fetch {
  const waits = options.waits ?? SKEW_RETRY_WAITS_MS;
  const log = options.log ?? ((message: string) => console.warn(message));
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

  return async (input, init) => {
    let response = await base(input, init);
    for (let attempt = 0; attempt < waits.length; attempt += 1) {
      if (response.status !== 401) return response;
      const body = await response.clone().text();
      if (!FUTURE.test(body)) return response;
      const token = authorization(init)?.replace(/^Bearer\s+/i, "");
      const iat = tokenIssuedAt(token);
      const ahead = iat === null ? "unknown" : `${secondsAhead(iat, Date.now()).toFixed(1)} s`;
      log(`[supabase] token refused as issued in the future (stamp ${ahead} ahead of our clock); retry ${attempt + 1} in ${waits[attempt]} ms`);
      await sleep(waits[attempt]);
      response = await base(input, init);
    }
    return response;
  };
}

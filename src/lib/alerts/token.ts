import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed unsubscribe links: "<user>.<pool or all>.<signature>", HMAC-SHA256 with a key
 * derived from the server secret, so a link works without signing in and cannot be
 * forged for someone else. No expiry: an old email's link keeps working.
 */

function key(secret: string): Buffer {
  return createHmac("sha256", secret).update("tuffo-unsubscribe-v1").digest();
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", key(secret)).update(payload).digest("base64url").slice(0, 32);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function unsubscribeToken(userId: string, poolId: string | null, secret: string): string {
  const payload = `${userId}.${poolId ?? "all"}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function readUnsubscribeToken(token: string, secret: string): { userId: string; poolId: string | null } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, pool, signature] = parts;
  if (!UUID.test(userId) || (pool !== "all" && !UUID.test(pool))) return null;
  const expected = Buffer.from(sign(`${userId}.${pool}`, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { userId, poolId: pool === "all" ? null : pool };
}

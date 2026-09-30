/**
 * Sign-in with Google: which message the login page shows when the provider or Supabase
 * sends the person back with an error instead of a code.
 */

export type LoginError = "link" | "beta" | "google";

/** Maps the `error` and `error_description` Supabase adds to the callback URL. */
export function oauthErrorKind(error: string | null, description: string | null): LoginError | null {
  if (!error && !description) return null;
  const text = `${error ?? ""} ${description ?? ""}`;
  // Invite-only projects refuse new accounts: "Signups not allowed for this instance".
  if (/signup|sign-up|not allowed/i.test(text)) return "beta";
  return "google";
}

/** A login page `?error=` value, or null when it is not one Tuffo sets. */
export function loginError(value: unknown): LoginError | null {
  return value === "link" || value === "beta" || value === "google" ? value : null;
}

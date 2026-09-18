"use server";

import { headers } from "next/headers";
import { publicEnv } from "@/lib/env";
import { safeNextPath } from "@/lib/auth/redirects";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface SignInState {
  status: "idle" | "sent" | "error";
  message?: string;
  email?: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Base URL the request came in on, so magic links return to the same host (the
 * production domain or a Vercel preview). Anything else falls back to the site URL;
 * Supabase additionally refuses redirect targets outside its allow-list.
 */
async function requestOrigin(): Promise<string> {
  const siteUrl = publicEnv.siteUrl();
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  if (!host) return siteUrl;
  const siteHost = new URL(siteUrl).host;
  const trusted =
    host === siteHost ||
    host.endsWith(".vercel.app") ||
    host.startsWith("localhost:") ||
    host === "localhost";
  if (!trusted) return siteUrl;
  const proto = host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}

export async function sendMagicLink(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const next = safeNextPath(String(formData.get("next") ?? ""));

  if (!EMAIL.test(email) || email.length > 254) {
    return { status: "error", message: "That does not look like an email address.", email };
  }

  const supabase = await createSupabaseServerClient();
  const origin = await requestOrigin();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    // Supabase reports "Signups not allowed" when the project is invite-only.
    const closed = /signup|sign-up|not allowed/i.test(error.message);
    return {
      status: "error",
      email,
      message: closed
        ? "Tuffo is in private beta. This address is not on the list yet."
        : "We could not send the link just now. Try again in a minute.",
    };
  }

  return { status: "sent", email };
}

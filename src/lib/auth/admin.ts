import "server-only";

import { notFound } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { isAdminEmail, parseAdminEmails } from "@/lib/beta";
import { serverEnv } from "@/lib/env";
import { requireUser } from "./user";

/** True when the signed-in user's email is in ADMIN_EMAILS. */
export function isAdmin(user: User | null): boolean {
  return isAdminEmail(user?.email, parseAdminEmails(serverEnv.adminEmails()));
}

/** The admin user for this request; anyone else gets a plain 404, so the page stays hidden. */
export async function requireAdmin(): Promise<User> {
  const user = await requireUser("/app");
  if (!isAdmin(user)) notFound();
  return user;
}

import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Units } from "@/lib/format";
import { PoolForm } from "./pool-form";

export const metadata: Metadata = { title: "Add a pool" };

export default async function NewPoolPage() {
  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase.from("profiles").select("units").maybeSingle<{ units: Units }>();

  return (
    <>
      <nav className="text-sm text-muted">
        <Link href="/app" className="hover:text-foreground">
          Your pools
        </Link>{" "}
        / Add a pool
      </nav>
      <div>
        <h1 className="text-3xl font-semibold">Add a pool</h1>
        <p className="text-muted">Three things: how big it is, how it is sanitized, and where it sits.</p>
      </div>
      <PoolForm defaultUnits={profile?.units ?? "us"} />
    </>
  );
}

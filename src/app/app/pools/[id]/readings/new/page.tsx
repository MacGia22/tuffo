import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Units } from "@/lib/format";
import { ReadingForm } from "./reading-form";

export const metadata: Metadata = { title: "Log a test" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewReadingPage({ params }: PageProps<"/app/pools/[id]/readings/new">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data: pool }, { data: profile }] = await Promise.all([
    supabase.from("pools").select("id, name, sanitizer").eq("id", id).maybeSingle<{
      id: string;
      name: string;
      sanitizer: "chlorine" | "swg";
    }>(),
    supabase.from("profiles").select("units").maybeSingle<{ units: Units }>(),
  ]);
  if (!pool) notFound();

  return (
    <>
      <nav className="text-sm text-muted">
        <Link href="/app" className="hover:text-foreground">
          Your pools
        </Link>{" "}
        /{" "}
        <Link href={`/app/pools/${pool.id}`} className="hover:text-foreground">
          {pool.name}
        </Link>{" "}
        / Log a test
      </nav>
      <div>
        <h1 className="text-3xl font-semibold">Log a test</h1>
        <p className="text-muted">Fill in what you measured; leave the rest blank.</p>
      </div>
      <ReadingForm poolId={pool.id} units={profile?.units ?? "us"} swg={pool.sanitizer === "swg"} />
    </>
  );
}

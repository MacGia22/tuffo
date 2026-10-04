import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteUserReportFiles, pruneReportPhotos, removeReportPhotos } from "../report-store";

const NOW = new Date("2027-10-05T11:30:00Z");

interface Row {
  id: string;
  photo_path: string | null;
  photo_delete_after: string | null;
}

/**
 * A stand-in for the two parts of the Supabase client these helpers use: a scan_reports
 * table (select with not/lte/limit, update with in) and one storage bucket.
 */
function fakeSupabase(rows: Row[], files: string[], opts: { removeError?: string } = {}) {
  const removed: string[][] = [];
  const db = {
    from: (table: string) => {
      expect(table).toBe("scan_reports");
      return {
        select: () => {
          const filters: ((r: Row) => boolean)[] = [];
          const query = {
            not: (col: keyof Row, op: string, value: null) => {
              expect(op).toBe("is");
              filters.push((r) => r[col] !== value);
              return query;
            },
            lte: (col: keyof Row, value: string) => {
              filters.push((r) => r[col] !== null && String(r[col]) <= value);
              return query;
            },
            limit: () => query,
            returns: async () => ({ data: rows.filter((r) => filters.every((f) => f(r))).map(({ id, photo_path }) => ({ id, photo_path })), error: null }),
          };
          return query;
        },
        update: (patch: Partial<Row>) => ({
          in: async (_col: string, ids: string[]) => {
            for (const r of rows) if (ids.includes(r.id)) Object.assign(r, patch);
            return { error: null };
          },
        }),
      };
    },
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          if (opts.removeError) return { data: null, error: { message: opts.removeError } };
          removed.push(paths);
          for (const p of paths) files.splice(files.indexOf(p), files.includes(p) ? 1 : 0);
          return { data: [], error: null };
        },
        list: async (prefix: string, { limit }: { limit: number }) => ({
          data: files
            .filter((f) => f.startsWith(`${prefix}/`))
            .slice(0, limit)
            .map((f) => ({ name: f.slice(prefix.length + 1) })),
          error: null,
        }),
      }),
    },
  };
  return { client: db as unknown as SupabaseClient, removed };
}

afterEach(() => vi.restoreAllMocks());

describe("pruneReportPhotos", () => {
  it("deletes photos whose date has come, clears their paths and keeps the rest", async () => {
    const rows: Row[] = [
      { id: "due", photo_path: "u1/due.jpg", photo_delete_after: "2027-10-04" },
      { id: "today", photo_path: "u1/today.jpg", photo_delete_after: "2027-10-05" },
      { id: "later", photo_path: "u2/later.jpg", photo_delete_after: "2027-10-06" },
      { id: "text-only", photo_path: null, photo_delete_after: null },
    ];
    const files = ["u1/due.jpg", "u1/today.jpg", "u2/later.jpg"];
    const { client } = fakeSupabase(rows, files);
    await expect(pruneReportPhotos(client, NOW)).resolves.toBe(2);
    expect(files).toEqual(["u2/later.jpg"]);
    expect(rows.map((r) => r.photo_path)).toEqual([null, null, "u2/later.jpg", null]);
  });

  it("keeps the paths when storage refuses, so the next run tries again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const rows: Row[] = [{ id: "due", photo_path: "u1/due.jpg", photo_delete_after: "2027-01-01" }];
    const { client } = fakeSupabase(rows, ["u1/due.jpg"], { removeError: "boom" });
    await expect(pruneReportPhotos(client, NOW)).resolves.toBeNull();
    expect(rows[0].photo_path).toBe("u1/due.jpg");
  });

  it("never throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const client = { from: () => { throw new Error("no table"); } } as unknown as SupabaseClient;
    await expect(pruneReportPhotos(client, NOW)).resolves.toBeNull();
  });
});

describe("removeReportPhotos", () => {
  it("does nothing for reports without a photo", async () => {
    const { client, removed } = fakeSupabase([], []);
    await expect(removeReportPhotos(client, [{ id: "a", photo_path: null }])).resolves.toBe(0);
    expect(removed).toEqual([]);
  });
});

describe("deleteUserReportFiles", () => {
  it("removes every file in the person's folder, page by page, and no one else's", async () => {
    const files = [...Array.from({ length: 150 }, (_, i) => `u1/${i}.jpg`), "u2/keep.jpg"];
    const { client, removed } = fakeSupabase([], files);
    await expect(deleteUserReportFiles(client, "u1")).resolves.toBe(true);
    expect(files).toEqual(["u2/keep.jpg"]);
    expect(removed.map((batch) => batch.length)).toEqual([100, 50]);
  });
});

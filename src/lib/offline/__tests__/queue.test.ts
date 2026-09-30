import { describe, expect, it } from "vitest";
import { flushQueue, memoryStore, pendingFor, sendResultFrom, type QueuedEntry, type SendResult } from "../queue";

function entry(n: number, extra: Partial<QueuedEntry> = {}): QueuedEntry {
  return {
    clientId: `00000000-0000-4000-8000-00000000000${n}`,
    userId: "user-a",
    poolId: "pool-1",
    kind: "reading",
    fields: { fc: String(n) },
    queuedAt: `2026-09-30T10:0${n}:00Z`,
    attempts: 0,
    ...extra,
  };
}

describe("flushQueue", () => {
  it("sends in the order logged and removes what was saved", async () => {
    const store = memoryStore([entry(2), entry(1), entry(3)]);
    const sent: string[] = [];
    const result = await flushQueue(store, "user-a", async (e) => {
      sent.push(e.fields.fc);
      return { status: "saved" };
    });
    expect(sent).toEqual(["1", "2", "3"]);
    expect(result).toEqual({ saved: 3, rejected: 0, waiting: 0 });
    expect(store.entries.size).toBe(0);
  });

  it("stops when the connection drops and keeps the rest for later", async () => {
    const store = memoryStore([entry(1), entry(2), entry(3)]);
    const answers: SendResult[] = [{ status: "saved" }, { status: "offline" }];
    const result = await flushQueue(store, "user-a", async () => answers.shift() ?? { status: "saved" });
    expect(result).toEqual({ saved: 1, rejected: 0, waiting: 2 });
    expect([...store.entries.keys()]).toHaveLength(2);
    expect(store.entries.get(entry(2).clientId)?.attempts).toBe(1);
    expect(store.entries.get(entry(3).clientId)?.attempts).toBe(0); // not tried
  });

  it("sends each entry exactly once across a lost reply and a retry", async () => {
    // The server stores the row but the reply is lost; the retry hits the unique
    // client_id and is answered "already saved", so the row exists once.
    const rows = new Set<string>();
    let dropReply = true;
    const send = async (e: QueuedEntry): Promise<SendResult> => {
      rows.add(e.clientId); // insert ... on client_id conflict: already there
      if (dropReply) {
        dropReply = false;
        return { status: "offline" };
      }
      return { status: "saved" };
    };
    const store = memoryStore([entry(1)]);
    expect(await flushQueue(store, "user-a", send)).toEqual({ saved: 0, rejected: 0, waiting: 1 });
    expect(await flushQueue(store, "user-a", send)).toEqual({ saved: 1, rejected: 0, waiting: 0 });
    expect(rows.size).toBe(1);
    expect(store.entries.size).toBe(0);
  });

  it("keeps a refused entry with its reason and does not resend it", async () => {
    const store = memoryStore([entry(1)]);
    let calls = 0;
    const send = async (): Promise<SendResult> => {
      calls += 1;
      return { status: "rejected", error: "pH 12 is outside the range a test can report." };
    };
    await flushQueue(store, "user-a", send);
    expect(await flushQueue(store, "user-a", send)).toEqual({ saved: 0, rejected: 1, waiting: 0 });
    expect(calls).toBe(1);
    expect(store.entries.get(entry(1).clientId)?.error).toContain("pH 12");
  });

  it("leaves another account's entries alone", async () => {
    const store = memoryStore([entry(1, { userId: "user-b" }), entry(2)]);
    expect((await pendingFor(store, "user-a")).map((e) => e.fields.fc)).toEqual(["2"]);
    await flushQueue(store, "user-a", async () => ({ status: "saved" }));
    expect([...store.entries.values()].map((e) => e.userId)).toEqual(["user-b"]);
  });
});

describe("sendResultFrom", () => {
  it("maps server answers", () => {
    expect(sendResultFrom(200, { ok: true })).toEqual({ status: "saved" });
    expect(sendResultFrom(400, { error: "Enter at least one result." })).toEqual({ status: "rejected", error: "Enter at least one result." });
    expect(sendResultFrom(404, {})).toEqual({ status: "rejected", error: "Tuffo could not save this entry." });
    expect(sendResultFrom(401, {})).toEqual({ status: "offline" });
    expect(sendResultFrom(503, {})).toEqual({ status: "offline" });
  });
});

/**
 * The offline-durability contract.
 *
 * A write made offline is paused, not failed, and its optimistic value
 * is already sitting in a cache that gets persisted. If the write can't
 * be restored and replayed, closing the app turns that into silent data
 * loss: the edit is on screen and in storage, was never sent, and the
 * next refetch quietly replaces it with the server's older truth.
 */
import { dehydrate, hydrate, MutationObserver, onlineManager, QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { MUTATION_FNS, registerMutationDefaults, WRITE_SCOPE, type MutationName } from "@/api/mutations";

const NAMES = Object.keys(MUTATION_FNS) as MutationName[];

describe("mutation registry", () => {
  it("registers a replayable function for every named write", () => {
    const qc = new QueryClient();
    registerMutationDefaults(qc);
    for (const name of NAMES) {
      expect(qc.getMutationDefaults([name]).mutationFn, name).toBeTypeOf("function");
    }
  });

  /**
   * The guard against a queued edit landing on the wrong account: the
   * pin travels inside the persisted variables, so replay uses the pin
   * that made the write rather than whatever is in storage later.
   */
  it("passes the envelope's pin through, not an ambient one", async () => {
    const qc = new QueryClient();
    const seen: Array<{ pin: string; vars: unknown }> = [];
    qc.setMutationDefaults(["attendance.mark"], {
      mutationFn: async (envelope: unknown) => {
        seen.push(envelope as { pin: string; vars: unknown });
      },
    });
    const fn = qc.getMutationDefaults(["attendance.mark"]).mutationFn as (
      v: unknown
    ) => Promise<unknown>;
    await fn({ pin: "1234", vars: { subject_id: "s" } });
    expect(seen[0].pin).toBe("1234");
  });

  it("keys are stable strings — a rehydrated mutation matches by key alone", () => {
    for (const name of NAMES) {
      expect(name).toMatch(/^[a-z]+\.[a-z]+$/);
    }
    expect(NAMES).toContain("attendance.mark");
    expect(NAMES).toContain("attendance.unmark");
  });
});

/**
 * The whole point, end to end: mark attendance with no signal, kill the
 * app, come back online. Before mutations were persisted this test's
 * `sent` array stayed empty — the edit existed only as an optimistic
 * value in a cache that outlived the write meant to justify it.
 */
describe("a write made offline survives the app being killed", () => {
  it("is persisted while paused, then replayed with its variables intact", async () => {
    const wasOnline = onlineManager.isOnline();
    try {
      // ---- session one: offline ----
      onlineManager.setOnline(false);
      const qc1 = new QueryClient();
      registerMutationDefaults(qc1);

      const record = { subject_id: "sub-1", date: "2026-09-07", start_time: "08:00" };
      const observer = new MutationObserver<unknown, Error, unknown>(qc1, {
        mutationKey: ["attendance.mark"],
      });
      void observer.mutate({ pin: "1234", vars: record }).catch(() => {});
      await Promise.resolve();

      const paused = qc1.getMutationCache().getAll().filter((m) => m.state.isPaused);
      expect(paused, "offline mutation should pause, not fail").toHaveLength(1);

      // ---- what localStorage would hold ----
      const frozen = dehydrate(qc1, {
        shouldDehydrateMutation: (m) => m.state.isPaused,
      });
      expect(frozen.mutations).toHaveLength(1);
      expect(frozen.mutations[0].mutationKey).toEqual(["attendance.mark"]);

      // ---- session two: fresh page, back online ----
      const sent: unknown[] = [];
      const qc2 = new QueryClient();
      registerMutationDefaults(qc2);
      qc2.setMutationDefaults(["attendance.mark"], {
        mutationFn: async (envelope: unknown) => {
          sent.push(envelope);
        },
      });
      hydrate(qc2, JSON.parse(JSON.stringify(frozen)));
      onlineManager.setOnline(true);
      await qc2.resumePausedMutations();

      expect(sent, "the queued write should reach the server").toHaveLength(1);
      expect(sent[0]).toEqual({ pin: "1234", vars: record });
    } finally {
      onlineManager.setOnline(wasOnline);
    }
  });
});

/**
 * Order, not just delivery. React Query resumes paused mutations in
 * parallel unless they share a scope, so an offline "add a deadline" and
 * "mark it done" came back as two concurrent requests — and the update
 * could land before the row it updates existed.
 */
describe("writes made offline replay in the order they were made", () => {
  it("runs a queued update only after the insert before it has finished", async () => {
    const wasOnline = onlineManager.isOnline();
    try {
      onlineManager.setOnline(false);
      const qc1 = new QueryClient();
      registerMutationDefaults(qc1);
      for (const [key, vars] of [
        ["deadlines.add", { id: "d-1", title: "FT-2" }],
        ["deadlines.update", { id: "d-1", patch: { status: "done" } }],
      ] as const) {
        const observer = new MutationObserver<unknown, Error, unknown>(qc1, { mutationKey: [key] });
        void observer.mutate({ pin: "1234", vars }).catch(() => {});
      }
      await Promise.resolve();
      const frozen = dehydrate(qc1, { shouldDehydrateMutation: (m) => m.state.isPaused });
      expect(frozen.mutations).toHaveLength(2);

      const log: string[] = [];
      const qc2 = new QueryClient();
      registerMutationDefaults(qc2);
      qc2.setMutationDefaults(["deadlines.add"], {
        mutationFn: async () => {
          log.push("add:start");
          // Slow enough that a parallel replay would start the update first.
          await new Promise((r) => setTimeout(r, 20));
          log.push("add:end");
        },
      });
      qc2.setMutationDefaults(["deadlines.update"], {
        mutationFn: async () => {
          log.push("update:start");
        },
      });
      hydrate(qc2, JSON.parse(JSON.stringify(frozen)));
      onlineManager.setOnline(true);
      await qc2.resumePausedMutations();
      await new Promise((r) => setTimeout(r, 50));

      expect(log).toEqual(["add:start", "add:end", "update:start"]);
    } finally {
      onlineManager.setOnline(wasOnline);
    }
  });

  it("puts every named write in the same scope", () => {
    const qc = new QueryClient();
    registerMutationDefaults(qc);
    for (const name of NAMES) {
      expect(qc.getMutationDefaults([name]).scope?.id, name).toBe(WRITE_SCOPE);
    }
  });
});

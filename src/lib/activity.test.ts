/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const insert = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: { from: (table: string) => ({ insert: (row: unknown) => insert(table, row) }) },
}));

import { recordActiveDay } from "@/lib/activity";

const WED = new Date(2026, 9, 7, 9, 0);
const THU = new Date(2026, 9, 8, 9, 0);

beforeEach(() => {
  insert.mockReset().mockResolvedValue({ error: null });
  localStorage.clear();
});

describe("recordActiveDay", () => {
  it("writes the PIN and the day, and nothing that identifies the person", async () => {
    await recordActiveDay("1234", WED);
    expect(insert).toHaveBeenCalledWith("active_days", {
      device_id: "1234",
      day: "2026-10-07",
      installed: false,
      release: "test",
    });
  });

  it("writes once a day, however often the app is opened", async () => {
    await recordActiveDay("1234", WED);
    await recordActiveDay("1234", WED);
    expect(insert).toHaveBeenCalledTimes(1);
    await recordActiveDay("1234", THU);
    expect(insert).toHaveBeenCalledTimes(2);
  });

  /** Signing in to another account on the same phone is another user. */
  it("counts another account on the same device separately", async () => {
    await recordActiveDay("1234", WED);
    await recordActiveDay("5678", WED);
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it("tries again next launch when the write is refused", async () => {
    insert.mockResolvedValueOnce({ error: { message: "offline" } });
    await recordActiveDay("1234", WED);
    await recordActiveDay("1234", WED);
    expect(insert).toHaveBeenCalledTimes(2);
  });

  /** Already recorded today, e.g. from another tab: that's success, not a retry. */
  it("takes a duplicate as already recorded", async () => {
    insert.mockResolvedValueOnce({ error: { code: "23505", message: "duplicate key" } });
    await recordActiveDay("1234", WED);
    await recordActiveDay("1234", WED);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("never throws, even when the network does", async () => {
    insert.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(recordActiveDay("1234", WED)).resolves.toBeUndefined();
  });
});

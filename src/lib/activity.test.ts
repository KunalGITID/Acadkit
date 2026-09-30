/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: { from: (table: string) => ({ upsert: (row: unknown, opts: unknown) => upsert(table, row, opts) }) },
}));

import { recordActiveDay } from "@/lib/activity";

const WED = new Date(2026, 9, 7, 9, 0);
const THU = new Date(2026, 9, 8, 9, 0);

beforeEach(() => {
  upsert.mockReset().mockResolvedValue({ error: null });
  localStorage.clear();
});

describe("recordActiveDay", () => {
  it("writes the PIN and the day, and nothing that identifies the person", async () => {
    await recordActiveDay("1234", WED);
    expect(upsert).toHaveBeenCalledWith(
      "active_days",
      { device_id: "1234", day: "2026-10-07", installed: false, release: "test" },
      { onConflict: "device_id,day", ignoreDuplicates: true }
    );
  });

  it("writes once a day, however often the app is opened", async () => {
    await recordActiveDay("1234", WED);
    await recordActiveDay("1234", WED);
    expect(upsert).toHaveBeenCalledTimes(1);
    await recordActiveDay("1234", THU);
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  /** Signing in to another account on the same phone is another user. */
  it("counts another account on the same device separately", async () => {
    await recordActiveDay("1234", WED);
    await recordActiveDay("5678", WED);
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it("tries again next launch when the write is refused", async () => {
    upsert.mockResolvedValueOnce({ error: { message: "offline" } });
    await recordActiveDay("1234", WED);
    await recordActiveDay("1234", WED);
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it("never throws, even when the network does", async () => {
    upsert.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(recordActiveDay("1234", WED)).resolves.toBeUndefined();
  });
});

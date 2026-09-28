import { describe, expect, it } from "vitest";
import { evictionPlan } from "./fileCache";

describe("evictionPlan", () => {
  it("keeps everything while it fits", () => {
    expect(evictionPlan({ a: { size: 10, used: 1 }, b: { size: 10, used: 2 } }, 20)).toEqual([]);
  });

  it("drops the least recently opened first, only as many as needed", () => {
    const index = {
      old: { size: 50, used: 1 },
      mid: { size: 50, used: 5 },
      new: { size: 50, used: 9 },
    };
    expect(evictionPlan(index, 100)).toEqual(["old"]);
    expect(evictionPlan(index, 60)).toEqual(["old", "mid"]);
  });

  it("can empty the cache when one file alone is over the cap", () => {
    expect(evictionPlan({ big: { size: 500, used: 3 } }, 100)).toEqual(["big"]);
  });
});

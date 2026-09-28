import { describe, expect, it } from "vitest";
import { buildEffectiveMap, getDayInfo, nextWorkingDate } from "@/lib/calendar";

describe("getDayInfo", () => {
  it("resolves a working day's order", () => {
    expect(getDayInfo("2026-07-21").dayOrder).toBe(1);
    expect(getDayInfo("2026-07-24").dayOrder).toBe(4);
  });

  it("flags weekends with no order", () => {
    const d = getDayInfo("2026-07-25");
    expect(d.kind).toBe("weekend");
    expect(d.dayOrder).toBeNull();
  });

  it("flags official holidays with their name", () => {
    const d = getDayInfo("2026-08-26");
    expect(d.kind).toBe("official-holiday");
    expect(d.holidayName).toBe("Milad-un-Nabi");
    expect(d.dayOrder).toBeNull();
  });

  it("flags pre- and post-semester", () => {
    expect(getDayInfo("2026-06-14").kind).toBe("pre-semester");
    expect(getDayInfo("2026-12-01").kind).toBe("post-semester");
  });
});

describe("declared-holiday shifting", () => {
  it("shifts remaining day orders forward onto the next working days", () => {
    const declared = [{ date: "2026-07-22", name: "Strike" }];
    // 07-22 was Day Order 2; with it removed, the sequence slides:
    expect(getDayInfo("2026-07-22", declared).kind).toBe("declared-holiday");
    expect(getDayInfo("2026-07-21", declared).dayOrder).toBe(1);
    expect(getDayInfo("2026-07-23", declared).dayOrder).toBe(2); // was 3
    expect(getDayInfo("2026-07-24", declared).dayOrder).toBe(3); // was 4
    expect(getDayInfo("2026-07-27", declared).dayOrder).toBe(4); // was 5
  });

  it("buildEffectiveMap is identity with no declared holidays", () => {
    const map = buildEffectiveMap([]);
    expect(map["2026-07-21"]).toBe(1);
    expect(map["2026-07-27"]).toBe(5);
  });
});

describe("nextWorkingDate", () => {
  it("finds the next date with a day order", () => {
    const n = nextWorkingDate("2026-07-24"); // Fri DO4; next working is Mon 07-27 DO5
    expect(n?.date).toBe("2026-07-27");
    expect(n?.dayOrder).toBe(5);
  });
});

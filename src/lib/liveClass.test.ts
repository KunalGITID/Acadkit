import { describe, expect, it } from "vitest";
import { classProgress, formatGap, liveState, type LiveSlot } from "@/lib/liveClass";
import type { Subject, TimetableSlot } from "@/types";

const slot = (start: string, end: string, name: string): LiveSlot => ({
  slot: { start_time: start, end_time: end, id: name } as TimetableSlot,
  subject: { name } as Subject,
});

/** 08:00–08:50, 08:50–09:40, then a long gap to 11:00–11:50. */
const DAY = [
  slot("08:00:00", "08:50:00", "OS"),
  slot("08:50:00", "09:40:00", "DSA"),
  slot("11:00:00", "11:50:00", "Ethics"),
];

const at = (h: number, m: number) => h * 60 + m;

describe("liveState", () => {
  it("says nothing when the day has no classes", () => {
    expect(liveState([], at(10, 0))).toEqual({ kind: "none" });
  });

  it("counts down to the first class", () => {
    const s = liveState(DAY, at(7, 30));
    expect(s.kind).toBe("before");
    if (s.kind !== "before") return;
    expect(s.next.subject?.name).toBe("OS");
    expect(s.minutesUntil).toBe(30);
  });

  it("knows which class you are sitting in, and how much is left", () => {
    const s = liveState(DAY, at(8, 20));
    expect(s.kind).toBe("in");
    if (s.kind !== "in") return;
    expect(s.current.subject?.name).toBe("OS");
    expect(s.minutesElapsed).toBe(20);
    expect(s.minutesLeft).toBe(30);
    expect(s.next?.subject?.name).toBe("DSA");
  });

  it("hands over cleanly when one class ends as the next begins", () => {
    // 08:50 is the end of OS and the start of DSA. Treating the end
    // minute as still-inside would match both.
    const s = liveState(DAY, at(8, 50));
    expect(s.kind).toBe("in");
    if (s.kind !== "in") return;
    expect(s.current.subject?.name).toBe("DSA");
    expect(s.minutesElapsed).toBe(0);
  });

  it("is in a gap between classes, not waiting for the first", () => {
    const s = liveState(DAY, at(10, 0));
    expect(s.kind).toBe("gap");
    if (s.kind !== "gap") return;
    expect(s.previous.subject?.name).toBe("DSA");
    expect(s.next.subject?.name).toBe("Ethics");
    expect(s.minutesUntil).toBe(60);
  });

  it("has no next class after the last one ends", () => {
    const s = liveState(DAY, at(12, 30));
    expect(s.kind).toBe("done");
    if (s.kind !== "done") return;
    expect(s.last.subject?.name).toBe("Ethics");
  });

  it("reports no next class while sitting in the last one", () => {
    const s = liveState(DAY, at(11, 10));
    expect(s.kind).toBe("in");
    if (s.kind !== "in") return;
    expect(s.next).toBeNull();
  });

  it("does not depend on the caller sorting the slots", () => {
    const shuffled = [DAY[2], DAY[0], DAY[1]];
    const s = liveState(shuffled, at(8, 20));
    expect(s.kind).toBe("in");
    if (s.kind !== "in") return;
    expect(s.current.subject?.name).toBe("OS");
  });

  it("treats the final end minute as finished", () => {
    expect(liveState(DAY, at(11, 50)).kind).toBe("done");
  });
});

describe("formatGap", () => {
  it("reads in minutes under an hour", () => {
    expect(formatGap(12)).toBe("12 min");
    expect(formatGap(59)).toBe("59 min");
  });

  it("keeps the minutes when it crosses an hour", () => {
    // "2h" would be a lie you'd act on — this is used to decide when to
    // leave for class.
    expect(formatGap(90)).toBe("1h 30m");
    expect(formatGap(60)).toBe("1h");
    expect(formatGap(125)).toBe("2h 5m");
  });

  it("does not round a live countdown down to zero", () => {
    expect(formatGap(0)).toBe("under a minute");
  });
});

describe("classProgress", () => {
  it("is the fraction of the class that has elapsed", () => {
    expect(classProgress(liveState(DAY, at(8, 25)))).toBeCloseTo(0.5);
  });

  it("is zero when you are not in a class", () => {
    expect(classProgress(liveState(DAY, at(10, 0)))).toBe(0);
    expect(classProgress(liveState([], at(10, 0)))).toBe(0);
  });
});

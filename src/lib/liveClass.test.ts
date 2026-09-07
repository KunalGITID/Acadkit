import { describe, expect, it } from "vitest";
import { classProgress, dayIsOver, formatGap, liveState, stillScheduled, type LiveSlot } from "@/lib/liveClass";
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

describe("stillScheduled", () => {
  /**
   * Reported from a phone: the card read "next: Transforms, 32 min of
   * freedom" while the same screen showed that class cancelled two rows
   * below. The countdown was running down to a room nobody was going to.
   */
  const at = (start: string, end: string, id = start): LiveSlot => ({
    slot: {
      id,
      device_id: "0000",
      subject_id: `s-${id}`,
      day_order: 1,
      start_time: start,
      end_time: end,
      room: null,
    },
    subject: undefined,
  });

  const morning = at("09:00:00", "09:50:00", "a");
  const afternoon = at("16:00:00", "16:50:00", "b");

  it("drops a cancelled class", () => {
    const kept = stillScheduled([morning, afternoon], (s) =>
      s.slot.id === "b" ? "holiday" : null
    );
    expect(kept.map((s) => s.slot.id)).toEqual(["a"]);
  });

  it("keeps a class nobody has marked yet", () => {
    // Most of the day is in this state; dropping it would empty the card.
    expect(stillScheduled([morning, afternoon], () => null)).toHaveLength(2);
  });

  it("keeps a class that happened, however it went", () => {
    for (const status of ["present", "absent", "od"] as const) {
      expect(stillScheduled([morning], () => status)).toHaveLength(1);
    }
  });

  it("stops a cancelled class being announced as next", () => {
    // 15:28, the afternoon class cancelled: the day is done, not
    // counting down to something that isn't happening.
    const now = 15 * 60 + 28;
    const all = liveState([morning, afternoon], now);
    expect(all.kind).toBe("gap");

    const real = liveState(
      stillScheduled([morning, afternoon], (s) => (s.slot.id === "b" ? "holiday" : null)),
      now
    );
    expect(real.kind).toBe("done");
  });

  it("says nothing at all when the whole day is cancelled", () => {
    expect(liveState(stillScheduled([morning], () => "holiday"), 600).kind).toBe("none");
  });
});

describe("dayIsOver", () => {
  /**
   * Reported from a phone at 15:35: five classes done, the 16:00 one
   * cancelled, and the dashboard still showing today's finished list
   * because that last slot had not "ended" yet. It was never going to.
   */
  const at = (start: string, end: string, id = start): LiveSlot => ({
    slot: {
      id,
      device_id: "0000",
      subject_id: `s-${id}`,
      day_order: 1,
      start_time: start,
      end_time: end,
      room: null,
    },
    subject: undefined,
  });

  const morning = at("09:00:00", "09:50:00", "a");
  const evening = at("16:00:00", "16:50:00", "b");
  const at1535 = 15 * 60 + 35;

  it("waits for a class that is still going to happen", () => {
    expect(dayIsOver([morning, evening], at1535, () => null)).toBe(false);
  });

  it("is over once the only thing left is cancelled", () => {
    expect(
      dayIsOver([morning, evening], at1535, (s) => (s.slot.id === "b" ? "holiday" : null))
    ).toBe(true);
  });

  it("is over when every class has genuinely ended", () => {
    expect(dayIsOver([morning, evening], 23 * 60, () => null)).toBe(true);
  });

  it("is over when the whole day was cancelled", () => {
    // Nothing is going to happen in it, so there is nothing to wait for.
    expect(dayIsOver([morning, evening], 8 * 60, () => "holiday")).toBe(true);
  });

  it("is not over on a day that never had classes", () => {
    // A Sunday should say weekend, not roll you forward to Monday.
    expect(dayIsOver([], 23 * 60, () => null)).toBe(false);
  });

  it("counts a class you attended or missed as done, not pending", () => {
    for (const status of ["present", "absent", "od"] as const) {
      expect(dayIsOver([morning], 23 * 60, () => status)).toBe(true);
      expect(dayIsOver([evening], at1535, () => status)).toBe(false);
    }
  });
});

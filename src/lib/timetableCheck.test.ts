import { describe, expect, it } from "vitest";
import { auditTimetable, describeAudit, suspectAudits } from "@/lib/timetableCheck";
import type { PortalSnapshot, Subject, TimetableSlot } from "@/types";

/** A short, holiday-free window: 4 full day-order cycles, 20 working days. */
const WINDOW = { start: "2026-07-21", end: "2026-08-17" };
/** 2026-07-21 is Day Order 1; the 20th working day is 2026-08-14. */
const AS_OF = "2026-08-14";

const subject = (id: string, code: string): Subject =>
  ({ id, code, name: code, credits: 4, type: "theory" }) as Subject;

const slot = (subjectId: string, dayOrder: number, start: string): TimetableSlot =>
  ({
    id: `${subjectId}-${dayOrder}-${start}`,
    subject_id: subjectId,
    day_order: dayOrder,
    start_time: `${start}:00`,
    end_time: `${start}:00`,
  }) as TimetableSlot;

const snap = (code: string, conducted: number): PortalSnapshot =>
  ({ subject_code: code, conducted, absent: 0, percentage: null, as_of: AS_OF }) as PortalSnapshot;

const DSA = subject("dsa", "21CSC201J");
const OS = subject("os", "21CSC202J");

/** DSA meets on day orders 1 and 3 → 8 classes over 4 cycles. */
const TIMETABLE = [slot("dsa", 1, "08:00"), slot("dsa", 3, "09:00"), slot("os", 2, "08:00")];

const audit = (snapshots: PortalSnapshot[], timetable = TIMETABLE) =>
  auditTimetable({
    subjects: [DSA, OS],
    timetable,
    snapshots,
    window: WINDOW,
  });

describe("auditTimetable", () => {
  it("agrees with itself when the timetable is right", () => {
    const [a] = audit([snap("21CSC201J", 8)]);
    expect(a.implied).toBe(8);
    expect(a.gap).toBe(0);
    expect(a.verdict).toBe("ok");
  });

  it("absorbs the ordinary churn of a term without crying wolf", () => {
    // A cancelled hour and a makeup are not a broken timetable.
    expect(audit([snap("21CSC201J", 6)])[0].verdict).toBe("ok");
    expect(audit([snap("21CSC201J", 10)])[0].verdict).toBe("ok");
  });

  it("suspects a missing slot when the portal keeps conducting more", () => {
    // 12 conducted vs 8 implied: a whole weekly class unaccounted for.
    const [a] = audit([snap("21CSC201J", 12)]);
    expect(a.verdict).toBe("missing");
    expect(a.gap).toBe(4);
    expect(a.perCycle).toBe(1);
    expect(describeAudit(a)).toMatch(/slot is probably missing/);
  });

  it("suspects a wrong slot when the timetable schedules more than happens", () => {
    const [a] = audit([snap("21CSC201J", 3)]);
    expect(a.verdict).toBe("extra");
    expect(a.gap).toBe(-5);
    expect(describeAudit(a)).toMatch(/schedules 5 more/);
  });

  /**
   * The one case stated plainly rather than hedged: there is nothing
   * ambiguous about a subject being taught that the timetable has never
   * heard of, and it is the single worst kind of hole — every
   * projection for it is computed from zero classes.
   */
  it("says so outright when a subject isn't on the timetable at all", () => {
    const [a] = audit([snap("21CSC201J", 9)], [slot("os", 2, "08:00")]);
    expect(a.verdict).toBe("absent");
    expect(a.implied).toBe(0);
    expect(describeAudit(a)).toMatch(/isn't on your timetable at all/);
  });

  it("holds its tongue in the first week, when nothing is comparable yet", () => {
    const early = auditTimetable({
      subjects: [DSA],
      timetable: TIMETABLE,
      snapshots: [{ ...snap("21CSC201J", 9), as_of: "2026-07-23" }],
      window: WINDOW,
    });
    expect(early[0].verdict).toBe("unsure");
  });

  /**
   * The portal's number is a week old as often as not. Measuring the
   * timetable to today against a total as of last Friday manufactures a
   * gap out of the delay alone.
   */
  it("measures the timetable over the portal's own window, not to today", () => {
    const stale = auditTimetable({
      subjects: [DSA],
      timetable: TIMETABLE,
      snapshots: [{ ...snap("21CSC201J", 6), as_of: "2026-08-07" }],
      window: WINDOW,
    });
    // 15 working days to 7 Aug → 6 DSA classes, not the 8 of the full window.
    expect(stale[0].implied).toBe(6);
    expect(stale[0].verdict).toBe("ok");
  });

  /**
   * A declared holiday doesn't delete a day order, it pushes the
   * rotation forward onto the following working days — so a subject
   * loses a *day*, not its classes. Reading the calendar through
   * buildEffectiveMap is what gets this right; walking dates and
   * skipping the holiday would have under-counted the subject and
   * invented a "missing slot" out of a day off.
   */
  it("follows the rotation a declared holiday shifts, rather than losing a class to it", () => {
    const shifted = auditTimetable({
      subjects: [DSA],
      timetable: TIMETABLE,
      snapshots: [snap("21CSC201J", 8)],
      declared: [{ date: "2026-07-22", name: "Strike" }],
      window: WINDOW,
    });
    expect(shifted[0].implied).toBe(8);
    expect(shifted[0].verdict).toBe("ok");
    // The window really did lose a day; it just wasn't this subject's.
    expect(shifted[0].cycles).toBeLessThan(4);
  });

  it("ignores subjects the portal has said nothing about", () => {
    expect(audit([]).length).toBe(0);
    expect(audit([snap("21CSC201J", 8)]).map((a) => a.subject.id)).toEqual(["dsa"]);
  });

  it("ignores a snapshot for a code you don't have", () => {
    expect(audit([snap("21XXX999T", 40)])).toEqual([]);
  });

  it("puts the worst first", () => {
    const list = audit(
      [snap("21CSC201J", 12), snap("21CSC202J", 9)],
      [slot("dsa", 1, "08:00"), slot("dsa", 3, "09:00")]
    );
    expect(list.map((a) => a.verdict)).toEqual(["absent", "missing"]);
  });
});

describe("suspectAudits", () => {
  it("keeps only what is worth interrupting someone about", () => {
    const list = audit([snap("21CSC201J", 8), snap("21CSC202J", 12)]);
    expect(list).toHaveLength(2);
    expect(suspectAudits(list).map((a) => a.subject.code)).toEqual(["21CSC202J"]);
  });
});

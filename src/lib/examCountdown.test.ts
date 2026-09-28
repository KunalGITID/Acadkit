import { describe, expect, it } from "vitest";
import { countdownLabel, examUrgency, HORIZON_DAYS, nextExam } from "@/lib/examCountdown";
import type { Deadline } from "@/types";

const TODAY = "2026-09-07";

const exam = (due: string, over: Partial<Deadline> = {}): Deadline =>
  ({
    id: due,
    type: "exam",
    status: "pending",
    due_date: due,
    ...over,
  }) as Deadline;

describe("nextExam", () => {
  it("says nothing when there are no deadlines", () => {
    expect(nextExam(undefined, TODAY)).toBeNull();
    expect(nextExam([], TODAY)).toBeNull();
  });

  it("picks the soonest exam", () => {
    const c = nextExam([exam("2026-09-20"), exam("2026-09-10"), exam("2026-09-15")], TODAY)!;
    expect(c.deadline.due_date).toBe("2026-09-10");
    expect(c.daysAway).toBe(3);
  });

  it("ignores labs and assignments", () => {
    // Those already have a row in the deadlines card, and nobody
    // practises toward a lab record.
    const c = nextExam(
      [exam("2026-09-08", { type: "lab" }), exam("2026-09-12")],
      TODAY
    )!;
    expect(c.deadline.due_date).toBe("2026-09-12");
  });

  it("ignores exams already marked done", () => {
    expect(nextExam([exam("2026-09-09", { status: "done" })], TODAY)).toBeNull();
  });

  it("counts an exam today, which is when it matters most", () => {
    const c = nextExam([exam(TODAY)], TODAY)!;
    expect(c.daysAway).toBe(0);
  });

  it("drops an exam that has already happened", () => {
    expect(nextExam([exam("2026-09-06")], TODAY)).toBeNull();
  });

  it("stays quiet beyond the horizon", () => {
    // A countdown to something seven weeks out is a fact, not a prompt.
    const justInside = "2026-09-28"; // 21 days
    const justOutside = "2026-09-29"; // 22 days
    expect(nextExam([exam(justInside)], TODAY)?.daysAway).toBe(HORIZON_DAYS);
    expect(nextExam([exam(justOutside)], TODAY)).toBeNull();
  });

  it("tolerates a timestamp in due_date", () => {
    const c = nextExam([exam("2026-09-10T14:30:00")], TODAY)!;
    expect(c.daysAway).toBe(3);
  });
});

describe("countdownLabel", () => {
  it("names the near days rather than counting them", () => {
    expect(countdownLabel(0)).toBe("today");
    expect(countdownLabel(1)).toBe("tomorrow");
    expect(countdownLabel(6)).toBe("6 days");
  });
});

describe("examUrgency", () => {
  it("bands coarsely, so a change of colour is news", () => {
    expect(examUrgency(0)).toBe("imminent");
    expect(examUrgency(1)).toBe("imminent");
    expect(examUrgency(2)).toBe("near");
    expect(examUrgency(6)).toBe("near");
    expect(examUrgency(7)).toBe("far");
  });
});

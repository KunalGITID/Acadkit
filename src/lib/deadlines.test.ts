import { describe, expect, it } from "vitest";
import { deadlineLabel, derivedTitle, upcomingDeadlines } from "@/lib/deadlines";
import type { Deadline, Subject } from "@/types";

const DSA = {
  code: "21CSC201J",
  name: "Data Structures & Algorithms",
} as Subject;

describe("deadlineLabel", () => {
  it("leads with the subject's real name, however long", () => {
    // The row wraps to a second line, so there is nothing to gain by
    // abbreviating this to DSA.
    expect(deadlineLabel({ type: "lab" }, DSA)).toBe("Data Structures & Algorithms");
  });

  it("still prefers a short name the user typed", () => {
    // This is the only place left that reads short_name. If it stopped
    // winning here the subject sheet would be collecting a field that
    // nothing ever displays.
    expect(
      deadlineLabel({ type: "lab" }, { name: "Whatever", short_name: "OS" } as Subject)
    ).toBe("OS");
  });

  it("trims the name it returns", () => {
    expect(deadlineLabel({ type: "lab" }, { name: "  Operating Systems " } as Subject)).toBe(
      "Operating Systems"
    );
  });

  it("falls back to the type when the deadline has no subject", () => {
    expect(deadlineLabel({ type: "exam" }, null)).toBe("Exam");
    expect(deadlineLabel({ type: "assignment" })).toBe("Assignment");
  });

  it("treats a blank subject name as no subject", () => {
    expect(deadlineLabel({ type: "other" }, { name: "   " } as Subject)).toBe("Other");
  });
});

describe("derivedTitle", () => {
  it("combines the subject code with the type", () => {
    expect(derivedTitle("lab", DSA)).toBe("21CSC201J Lab");
  });

  it("is just the type when unassigned", () => {
    expect(derivedTitle("exam")).toBe("Exam");
    expect(derivedTitle("exam", null)).toBe("Exam");
  });

  it("never returns an empty string, since the column is NOT NULL", () => {
    for (const type of ["assignment", "exam", "lab", "other"] as const) {
      expect(derivedTitle(type, { code: "  " } as Subject)).not.toBe("");
    }
  });
});

describe("upcomingDeadlines", () => {
  const now = new Date("2026-09-23T12:00:00+05:30").getTime();
  const dl = (id: string, due: string, status: Deadline["status"] = "pending") =>
    ({ id, due_date: new Date(due).toISOString(), status }) as Deadline;

  it("drops a deadline the moment it passes, including earlier today", () => {
    const list = [dl("morning", "2026-09-23T09:00:00+05:30"), dl("evening", "2026-09-23T18:00:00+05:30")];
    expect(upcomingDeadlines(list, now).map((d) => d.id)).toEqual(["evening"]);
  });

  it("drops yesterday's, which the old 24-hour grace period kept", () => {
    expect(upcomingDeadlines([dl("y", "2026-09-22T21:00:00+05:30")], now)).toEqual([]);
  });

  it("skips finished ones, sorts soonest first and caps the list", () => {
    const list = [
      dl("c", "2026-09-26T09:00:00+05:30"),
      dl("done", "2026-09-24T09:00:00+05:30", "done"),
      dl("a", "2026-09-24T09:00:00+05:30"),
      dl("b", "2026-09-25T09:00:00+05:30"),
    ];
    expect(upcomingDeadlines(list, now, 2).map((d) => d.id)).toEqual(["a", "b"]);
  });
});

import { describe, expect, it } from "vitest";
import { deadlineLabel, derivedTitle } from "@/lib/deadlines";
import type { Subject } from "@/types";

const DSA = {
  code: "21CSC201J",
  name: "Data Structures & Algorithms",
} as Subject;

describe("deadlineLabel", () => {
  it("leads with the subject, abbreviated when it wouldn't fit the row", () => {
    // 28 characters sits beside a date and a badge, so the full name
    // would truncate to an ellipsis anyway.
    expect(deadlineLabel({ type: "lab" }, DSA)).toBe("DSA");
  });

  it("keeps a short subject name intact", () => {
    expect(deadlineLabel({ type: "lab" }, { name: "Operating Systems" } as Subject)).toBe(
      "Operating Systems"
    );
  });

  it("prefers an explicit short name", () => {
    expect(
      deadlineLabel({ type: "lab" }, { name: "Whatever", short_name: "OS" } as Subject)
    ).toBe("OS");
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

import { describe, expect, it } from "vitest";
import { deadlineLabel, derivedTitle } from "@/lib/deadlines";
import type { Subject } from "@/types";

const DSA = {
  code: "21CSC201J",
  name: "Data Structures & Algorithms",
} as Subject;

describe("deadlineLabel", () => {
  it("leads with the subject when there is one", () => {
    expect(deadlineLabel({ type: "lab" }, DSA)).toBe("Data Structures & Algorithms");
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

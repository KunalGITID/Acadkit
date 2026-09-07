import { describe, expect, it } from "vitest";
import {
  AUTO_LABEL,
  isLabIntegrated,
  labelMatchKey,
  labelPrefix,
  nextComponentLabel,
} from "@/lib/componentLabel";
import { inferType } from "@/lib/plan";
import type { Mark, TimetableSlot } from "@/types";

const slot = (subject_id: string, slot_type: "theory" | "lab"): TimetableSlot => ({
  id: `${subject_id}-${slot_type}`,
  device_id: "0000",
  subject_id,
  day_order: 1,
  start_time: "08:00:00",
  end_time: "08:50:00",
  room: null,
  slot_type,
});

const mk = (type: Mark["component_type"], label: string): Mark => ({
  id: label,
  device_id: "0000",
  subject_id: "s1",
  component_type: type,
  label,
  marks_obtained: 1,
  max_marks: 5,
  is_external: false,
});

describe("isLabIntegrated", () => {
  it("reads the timetable first, because that is what you maintain", () => {
    const subject = { id: "s1", code: "21CSS202T" }; // code says theory…
    expect(isLabIntegrated(subject, [slot("s1", "lab")])).toBe(true); // …slots say lab
    expect(isLabIntegrated(subject, [slot("s1", "theory")])).toBe(false);
  });

  it("falls back to the letter SRM puts in the code", () => {
    // A subject whose slots haven't been entered yet still gets it right.
    expect(isLabIntegrated({ id: "s1", code: "21CSC202J" }, [])).toBe(true);
    expect(isLabIntegrated({ id: "s1", code: "21CSS202T" }, [])).toBe(false);
    expect(isLabIntegrated({ id: "s1", code: " 21csc202j " }, [])).toBe(true);
  });

  it("ignores other subjects' slots", () => {
    expect(isLabIntegrated({ id: "s1", code: "21CSS202T" }, [slot("s2", "lab")])).toBe(false);
  });
});

describe("labelPrefix", () => {
  it("uses the dialect the course actually speaks", () => {
    expect(labelPrefix("CT", false)).toBe("FT");
    expect(labelPrefix("CT", true)).toBe("FJ");
    expect(labelPrefix("Lab", false)).toBe("LLT");
    expect(labelPrefix("Lab", true)).toBe("LLJ");
  });

  it("leaves the families SRM doesn't rename alone", () => {
    expect(labelPrefix("Assignment", true)).toBe("Assignment");
    expect(labelPrefix("Project", false)).toBe("Project");
  });
});

describe("nextComponentLabel", () => {
  it("counts within the family, not the exact prefix", () => {
    // A subject whose earlier marks went in under the old CT-n naming
    // continues at 2 rather than restarting.
    const existing = [mk("CT", "CT-1")];
    expect(nextComponentLabel("CT", false, existing)).toBe("FT-2");
    expect(nextComponentLabel("CT", true, existing)).toBe("FJ-2");
  });

  it("numbers each family separately", () => {
    const existing = [mk("CT", "FJ-1"), mk("CT", "FJ-2"), mk("Lab", "LLJ-1")];
    expect(nextComponentLabel("CT", true, existing)).toBe("FJ-3");
    expect(nextComponentLabel("Lab", true, existing)).toBe("LLJ-2");
  });
});

describe("inferType understands the institution's vocabulary", () => {
  it("maps SRM's names onto the stored types", () => {
    // These are the labels people actually type, and every one of them
    // used to fall through to CT.
    expect(inferType("FT-1")).toBe("CT");
    expect(inferType("FJ-2")).toBe("CT");
    expect(inferType("LLT-1")).toBe("Lab");
    expect(inferType("LLJ-1")).toBe("Lab");
  });

  it("does not swallow words that merely start the same way", () => {
    expect(inferType("Field trip")).toBe("CT"); // not an F-family component
    expect(inferType("Final project")).toBe("Project");
  });
});

describe("AUTO_LABEL", () => {
  it("recognises both dialects, so switching type regenerates", () => {
    for (const l of ["FT-1", "FJ-12", "LLT-3", "LLJ-1", "CT-2", "Assignment-1"]) {
      expect(AUTO_LABEL.test(l), l).toBe(true);
    }
  });

  it("leaves a hand-typed label alone", () => {
    for (const l of ["Surprise quiz", "FT1", "My FT-1", "FT-"]) {
      expect(AUTO_LABEL.test(l), l).toBe(false);
    }
  });
});

describe("labelMatchKey", () => {
  /**
   * The case this exists for: a mark recorded as CT-1 before the rename,
   * against a plan row now called FT-1. Matching on raw text made them
   * two components — the same test reported twice, once graded and once
   * still owed — and no amount of renaming the plan would fix a device
   * that had already synced the old label.
   */
  it("treats the three names for one component as one component", () => {
    const key = labelMatchKey("CT-1");
    expect(labelMatchKey("FT-1")).toBe(key);
    expect(labelMatchKey("FJ-1")).toBe(key);
    expect(labelMatchKey("ct 1")).toBe(key);
    expect(labelMatchKey("  Ft_1 ")).toBe(key);
  });

  it("does the same for the life-long-learning family", () => {
    const key = labelMatchKey("Lab-2");
    expect(labelMatchKey("LLT-2")).toBe(key);
    expect(labelMatchKey("LLJ-2")).toBe(key);
  });

  it("keeps the two families apart", () => {
    expect(labelMatchKey("FT-1")).not.toBe(labelMatchKey("LLT-1"));
  });

  it("keeps different numbers apart", () => {
    expect(labelMatchKey("FT-1")).not.toBe(labelMatchKey("FT-2"));
  });

  it("leaves anything it doesn't recognise as itself", () => {
    // A hand-typed name is not a dialect of anything.
    expect(labelMatchKey("Surprise quiz")).toBe("surprisequiz");
    expect(labelMatchKey("Model exam")).toBe("modelexam");
    // No number: not one of the numbered families.
    expect(labelMatchKey("FT")).toBe("ft");
    expect(labelMatchKey("Lab")).toBe("lab");
  });
});

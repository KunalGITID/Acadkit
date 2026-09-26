import { describe, expect, it } from "vitest";
import { announceComponent, announcedPending } from "@/lib/plan";
import type { Mark, Subject } from "@/types";

const subject = (components: Array<{ label: string; max: number }>, complete = false): Subject => ({
  id: "os",
  device_id: "",
  code: "21CSC202J",
  name: "OS",
  credits: 4,
  type: "theory",
  faculty: null,
  color_hex: "#000",
  assessment: {
    internal: 60,
    complete,
    components: components.map((c, i) => ({ key: `k${i}`, label: c.label, type: "CT", max: c.max })),
  },
});

const mark = (label: string): Mark =>
  ({ id: label, subject_id: "os", component_type: "CT", label, marks_obtained: 2, max_marks: 5, is_external: false }) as Mark;

describe("announceComponent", () => {
  it("adds the component to the plan and keeps what was there", () => {
    const r = announceComponent(subject([{ label: "FT-1", max: 5 }]), { label: "FT-2", type: "CT", max: 15 });
    expect("assessment" in r && r.assessment.components.map((c) => c.label)).toEqual(["FT-1", "FT-2"]);
    expect("assessment" in r && r.assessment.internal).toBe(60);
  });

  it("works on a subject with no plan at all", () => {
    const bare = { ...subject([]), assessment: null };
    const r = announceComponent(bare, { label: "FT-1", type: "CT", max: 5 });
    expect("assessment" in r && r.assessment.components).toHaveLength(1);
  });

  it("refuses the same test twice, however it's typed", () => {
    const r = announceComponent(subject([{ label: "FT-2", max: 15 }]), { label: "ft 2", type: "CT", max: 15 });
    expect(r).toEqual({ error: "ft 2 is already announced" });
  });

  it("refuses more than the unannounced weight rather than rescaling the plan", () => {
    const full = subject([
      { label: "FT-1", max: 5 },
      { label: "FT-2", max: 15 },
      { label: "FT-3", max: 15 },
      { label: "FT-4", max: 15 },
    ]);
    const r = announceComponent(full, { label: "Quiz", type: "CT", max: 15 });
    expect("error" in r && r.error).toMatch(/Only 10 of the 60/);
  });

  it("counts graded marks the plan doesn't name, which the budget counts too", () => {
    const s = subject([{ label: "FT-1", max: 5 }]);
    const extra = { ...mark("Quiz 1"), max_marks: 50 };
    const r = announceComponent(s, { label: "FT-2", type: "CT", max: 15 }, [extra]);
    expect("error" in r && r.error).toMatch(/Only 5 of the 60.*Quiz 1 \/50/);
    // A mark that *is* a declared component isn't counted twice.
    const ok = announceComponent(s, { label: "FT-2", type: "CT", max: 15 }, [mark("FT-1")]);
    expect("assessment" in ok).toBe(true);
  });

  it("doesn't weigh-check a plan marked complete (it's in its own units)", () => {
    const r = announceComponent(subject([{ label: "FT-1", max: 50 }], true), { label: "FT-2", type: "CT", max: 50 });
    expect("assessment" in r).toBe(true);
  });

  it("needs a label and a weight", () => {
    const s = subject([]);
    expect(announceComponent(s, { label: " ", type: "CT", max: 5 })).toHaveProperty("error");
    expect(announceComponent(s, { label: "FT-1", type: "CT", max: NaN })).toHaveProperty("error");
  });
});

describe("announcedPending", () => {
  it("lists declared components that have no mark yet", () => {
    const s = subject([
      { label: "FT-1", max: 5 },
      { label: "FT-2", max: 15 },
    ]);
    expect(announcedPending(s, [mark("CT-1")]).map((c) => c.label)).toEqual(["FT-2"]);
  });
});

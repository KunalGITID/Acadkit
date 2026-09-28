import { describe, expect, it } from "vitest";
import { buildShareData } from "@/lib/shareCard";
import type { Grade } from "@/lib/grades";

const DATE = new Date("2026-09-03T12:00:00Z");

function subject(code: string, grade: Grade, hasMarks = true) {
  return { code, grade, color: "#7c6af7", hasMarks };
}

describe("buildShareData", () => {
  it("formats SGPA to two decimals", () => {
    const d = buildShareData({
      sgpa: 8.6543,
      attendancePct: 82.4,
      subjects: [],
      date: DATE,
    });
    expect(d.sgpa).toBe("8.65");
    expect(d.sgpaLabel).toBe("predicted SGPA");
  });

  it("reads honestly when there is no SGPA yet", () => {
    const d = buildShareData({
      sgpa: null,
      attendancePct: null,
      subjects: [],
      date: DATE,
    });
    expect(d.sgpa).toBe("—");
    expect(d.sgpaLabel).toBe("no marks yet");
    expect(d.attendance).toBe("—");
  });

  it("rounds attendance to a whole percent", () => {
    const d = buildShareData({
      sgpa: 9,
      attendancePct: 74.6,
      subjects: [],
      date: DATE,
    });
    expect(d.attendance).toBe("75%");
  });

  it("uses the name when there is one", () => {
    expect(
      buildShareData({ name: "Kunal", sgpa: 9, attendancePct: 80, subjects: [], date: DATE })
        .title
    ).toBe("Kunal's semester");
    expect(
      buildShareData({ sgpa: 9, attendancePct: 80, subjects: [], date: DATE }).title
    ).toBe("My semester");
  });

  it("leaves out subjects with no marks", () => {
    const d = buildShareData({
      sgpa: 9,
      attendancePct: 80,
      subjects: [subject("21CSC201J", "A"), subject("21LEM201T", "F", false)],
      date: DATE,
    });
    expect(d.rows.map((r) => r.code)).toEqual(["21CSC201J"]);
  });

  it("caps the chip list so the card doesn't overflow", () => {
    const many = Array.from({ length: 12 }, (_, i) => subject(`SUB${i}`, "A"));
    expect(buildShareData({ sgpa: 9, attendancePct: 80, subjects: many, date: DATE }).rows)
      .toHaveLength(8);
  });

  it("stamps the semester and date in the footer", () => {
    const d = buildShareData({
      semester: 3,
      sgpa: 9,
      attendancePct: 80,
      subjects: [],
      date: DATE,
    });
    expect(d.footer).toContain("Semester 3");
    expect(d.footer).toContain("2026");
    expect(d.footer).toContain("AcadKit");
  });

  it("omits the semester when unknown", () => {
    const d = buildShareData({ sgpa: 9, attendancePct: 80, subjects: [], date: DATE });
    expect(d.footer).not.toContain("Semester");
  });
});

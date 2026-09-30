import { describe, expect, it } from "vitest";
import { draftProblem, draftsFromPortal, draftsFromPreset, tidyTitle } from "@/lib/onboarding";

const row = (subject_code: string, extra: object = {}) => ({
  subject_code,
  conducted: 40,
  absent: 4,
  percentage: 90,
  ...extra,
});

describe("draftsFromPortal", () => {
  it("makes one subject per course, named by its title", () => {
    const drafts = draftsFromPortal([
      row("21CSC202J", { title: "Operating Systems", category: "Theory" }),
      row("21XYZ101T", { title: "Something New", category: "Theory" }),
    ]);
    expect(drafts.map((d) => [d.code, d.name])).toEqual([
      ["21CSC202J", "Operating Systems"],
      ["21XYZ101T", "Something New"],
    ]);
  });

  /** A guessed credit count would quietly skew SGPA, so only courses we know get one. */
  it("fills credits only for courses it already knows", () => {
    const [known, unknown] = draftsFromPortal([row("21CSC202J"), row("21XYZ101T")]);
    expect(known.credits).toBe(4);
    expect(unknown.credits).toBeNull();
  });

  it("falls back to the code when the table had no title column", () => {
    expect(draftsFromPortal([row("21XYZ101T")])[0].name).toBe("21XYZ101T");
  });

  it("reads practicals as labs", () => {
    expect(draftsFromPortal([row("21CSC206P", { category: "Practical" })])[0].type).toBe("lab");
    expect(draftsFromPortal([row("21CSC202J", { category: "Theory" })])[0].type).toBe("theory");
  });

  it("drops the staff ID the portal appends to a faculty name", () => {
    expect(draftsFromPortal([row("21CSC202J", { faculty: "Dr. A Kumar (100001)" })])[0].faculty).toBe("Dr. A Kumar");
  });

  /** A course with both theory and lab hours can be listed twice. */
  it("lists a repeated code once", () => {
    expect(draftsFromPortal([row("21CSC202J"), row("21CSC202J")])).toHaveLength(1);
  });

  it("gives each subject its own colour", () => {
    const colours = draftsFromPortal([row("A1"), row("A2"), row("A3")]).map((d) => d.color_hex);
    expect(new Set(colours).size).toBe(3);
  });
});

describe("draftProblem", () => {
  it("is happy with the preset list", () => {
    expect(draftProblem(draftsFromPreset())).toBeNull();
  });

  it("names the one subject still missing credits", () => {
    const drafts = draftsFromPortal([row("21CSC202J"), row("21XYZ101T", { title: "Something New" })]);
    expect(draftProblem(drafts)).toBe("Add the credits for Something New");
  });

  it("counts them when several are missing", () => {
    expect(draftProblem(draftsFromPortal([row("X1"), row("X2")]))).toBe("Add the credits for 2 subjects");
  });

  it("accepts 0-credit courses and rejects impossible ones", () => {
    const [d] = draftsFromPortal([row("X1")]);
    expect(draftProblem([{ ...d, credits: 0 }])).toBeNull();
    expect(draftProblem([{ ...d, credits: 2.5 }])).not.toBeNull();
    expect(draftProblem([{ ...d, credits: 40 }])).not.toBeNull();
  });

  it("allows starting with no subjects at all", () => {
    expect(draftProblem([])).toBeNull();
  });
});

describe("tidyTitle", () => {
  /** sp.srmist.edu.in prints course titles in capitals. */
  it("turns an all-caps title into title case", () => {
    expect(tidyTitle("DATA STRUCTURES AND ALGORITHMS")).toBe("Data Structures and Algorithms");
    expect(tidyTitle("ADVANCED OBJECT ORIENTED PROGRAMMING")).toBe("Advanced Object Oriented Programming");
  });

  it("leaves a title that already has lower case alone", () => {
    expect(tidyTitle("Transforms and Boundary Value Problems")).toBe("Transforms and Boundary Value Problems");
    expect(tidyTitle("Intro to AI")).toBe("Intro to AI");
  });

  it("squeezes stray whitespace", () => {
    expect(tidyTitle("  Operating   Systems ")).toBe("Operating Systems");
  });
});

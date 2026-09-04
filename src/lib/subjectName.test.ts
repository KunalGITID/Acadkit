import { describe, expect, it } from "vitest";
import { abbreviate, fitName, shortName } from "@/lib/subjectName";
import type { Subject } from "@/types";

const s = (name: string, short?: string | null) =>
  ({ name, short_name: short }) as Subject;

describe("abbreviate", () => {
  it("keeps the end of the name, which truncation loses", () => {
    // "Transforms & Boundary V…" hides the part that identifies it.
    expect(abbreviate("Transforms & Boundary Value Problems")).toBe("TBVP");
  });

  it("drops words that carry no signal", () => {
    expect(abbreviate("Fundamentals of Data Science")).toBe("FDS");
    expect(abbreviate("Design Thinking and Methodology")).toBe("DTM");
  });

  it("handles the worst real name in the account", () => {
    expect(
      abbreviate("UNIVERSAL HUMAN VALUES - II: UNDERSTANDING HARMONY AND ETHICAL HUMAN CONDUCT")
    ).toBe("UHVUH");
  });

  it("keeps a single word readable instead of reducing it to a letter", () => {
    expect(abbreviate("Chemistry")).toBe("Chemis");
  });

  it("survives punctuation-only and empty input", () => {
    expect(abbreviate("---")).toBeTruthy();
    expect(abbreviate("")).toBe("");
  });

  it("caps the length so rows stay aligned", () => {
    expect(abbreviate("Alpha Beta Gamma Delta Epsilon Zeta Eta").length).toBeLessThanOrEqual(5);
  });
});

describe("shortName", () => {
  it("an explicit short name always wins", () => {
    expect(shortName(s("Transforms & Boundary Value Problems", "Maths"))).toBe("Maths");
  });

  it("falls back to the abbreviation", () => {
    expect(shortName(s("Operating Systems"))).toBe("OS");
  });

  it("ignores a blank override rather than showing an empty row", () => {
    expect(shortName(s("Operating Systems", "   "))).toBe("OS");
  });
});

describe("fitName", () => {
  it("leaves a name alone when it already fits", () => {
    expect(fitName(s("Operating Systems"))).toBe("Operating Systems");
  });

  it("abbreviates only what wouldn't fit", () => {
    expect(fitName(s("Transforms & Boundary Value Problems"))).toBe("TBVP");
  });

  it("respects an explicit short name even when the full one fits", () => {
    expect(fitName(s("Operating Systems", "OS"))).toBe("OS");
  });
});

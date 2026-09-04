import { describe, expect, it } from "vitest";
import { abbreviate } from "@/lib/subjectName";
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

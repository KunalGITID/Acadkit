import { describe, expect, it } from "vitest";
import { describeElectives, mathsShare, themeOf } from "./electives";
import type { CourseUnits } from "./units";

const course = (code: string, topics: string[], prerequisites: string | null = "Nil"): CourseUnits => ({
  code,
  title: code,
  semester: "E",
  credits: 3,
  prerequisites,
  file: null,
  hasFiles: false,
  units: [{ n: 1, title: "Unit", hours: 9, topics, refs: [], files: 0 }],
});

describe("themeOf", () => {
  it.each([
    ["Financial Machine Learning", "applied"],
    ["Deep Learning for Data Analytics", "ml"],
    ["Cloud Computing for Data Analytics", "systems"],
    ["Big Data Visualization", "data"],
    ["Natural Language Processing", "ml"],
  ])("%s → %s", (t, want) => expect(themeOf(t, [])).toBe(want));
});

describe("mathsShare", () => {
  it("counts topics that are maths", () => {
    expect(mathsShare(course("x", ["Linear regression", "Bayes theorem", "Tableau dashboards", "Charts"]))).toBe(0.5);
    expect(mathsShare(course("x", []))).toBe(0);
    // "unit test" is not a t-test; a convolution layer is not maths homework.
    expect(mathsShare(course("x", ["Unit testing and unit test cases", "Convolution layers"]))).toBe(0);
    expect(mathsShare(course("x", ["Paired t-test"]))).toBe(1);
  });
});

describe("describeElectives", () => {
  it("fills in what the syllabus says and drops a Nil prerequisite", () => {
    const out = describeElectives(
      { E: [["21CSE425T", "Advanced Machine Learning"]], O: [["21CSO352T", "Python Programming"]] },
      { "21CSE425T": course("21CSE425T", ["Gradient descent", "Kernels"], "Nil") }
    );
    expect(out[0]).toMatchObject({ kind: "E", theme: "ml", maths: 0.5, prerequisites: null, hasSyllabus: true });
    expect(out[1]).toMatchObject({ kind: "O", hasSyllabus: false });
  });
});

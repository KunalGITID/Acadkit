import { describe, expect, it } from "vitest";
import { clusterVectors, labelClusters, paperId, paperYear, pastPapers, splitQuestions } from "./topics.mjs";

describe("which files are papers", () => {
  const file = (p: string) => ({ path: p, ext: p.split(".").pop()!.toLowerCase(), key: `x/blobs/${p.length}.pdf`, full: `/tmp/${p}` });

  it("finds papers under 07_PYQs/<test>/ in coded subject folders", () => {
    const subjects = pastPapers([
      file("OS_21CSC202J/07_PYQs/End_Sem/May_2023.pdf"),
      file("OS_21CSC202J/07_PYQs/End_Sem/Nov_2024.pdf"),
      file("OS_21CSC202J/02_Notes/Unit1.pdf"), // not a paper
      file("DSA_Lab/07_PYQs/x.pdf"), // no course code
      file("DSA_21CSC201J/07_PYQs/Important_Topics/list.pdf"), // not a paper
      file("DSA_21CSC201J/07_PYQs/FJ-III/2024_FJ-III_SetC_photo_20241106-WA0034.jpg"),
      file("DSA_21CSC201J/07_PYQs/FJ-III/2024_FJ-III_SetC_photo_20241106-WA0035.jpg"),
    ]);
    const os = subjects.find((s) => s.subjectCode === "21CSC202J")!;
    expect(os.papers.map((p) => [p.group, p.year])).toEqual([["End_Sem", 2023], ["End_Sem", 2024]]);
    const dsa = subjects.find((s) => s.subjectCode === "21CSC201J")!;
    // Two photos, one paper.
    expect(dsa.papers).toHaveLength(1);
    expect(dsa.papers[0].files).toHaveLength(2);
  });

  it("reads a paper's identity and year off its path", () => {
    expect(paperId("A/07_PYQs/FJ-II/2024_CT2_SetD.pdf")).toBe("A/07_PYQs/FJ-II/2024_CT2_SetD");
    expect(paperYear("A/07_PYQs/End_Sem/May_2025.pdf")).toBe(2025);
    expect(paperYear("A/07_PYQs/End_Sem/More.pdf")).toBeNull();
  });
});

describe("splitQuestions", () => {
  it("splits at question numbers and at (OR), dropping marks columns", () => {
    const page = [
      "SRM INSTITUTE OF SCIENCE AND TECHNOLOGY",
      "SRM Nagar, Kattankulathur – 603203, Chengalpattu District",
      "B.Tech. DEGREE EXAMINATION, MAY 2023",
      "21CSC202J – OPERATING SYSTEMS",
      "Reg. No.",
      "PART - B",
      "30. a. Describe a solution to the dining philosopher problem so that no race",
      "condition arises.",
      "12",
      "(OR)",
      "b. Consider the following snapshot and answer using bankers algorithm",
      "3 4",
      "31. a. Explain the first fit, best fit and worst fit allocation algorithms",
      "Page 4 of 4",
    ].join("\n");
    expect(splitQuestions(page)).toEqual([
      "Describe a solution to the dining philosopher problem so that no race condition arises.",
      "Consider the following snapshot and answer using bankers algorithm",
      "Explain the first fit, best fit and worst fit allocation algorithms",
    ]);
  });

  it("ignores fragments too short to be a question", () => {
    expect(splitQuestions("1. (a)\n2. Yes")).toEqual([]);
  });
});

describe("clusterVectors", () => {
  const unit = (v: number[]) => {
    const n = Math.hypot(...v);
    return v.map((x) => x / n);
  };

  it("groups near-identical directions and keeps different ones apart", () => {
    const vectors = [unit([1, 0.05, 0]), unit([1, 0, 0.05]), unit([0, 1, 0]), unit([0.02, 1, 0]), unit([0, 0, 1])];
    const clusters = clusterVectors(vectors, 0.9).map((c) => [...c].sort()).sort((a, b) => a[0] - b[0]);
    expect(clusters).toEqual([[0, 1], [2, 3], [4]]);
  });

  it("handles nothing", () => {
    expect(clusterVectors([])).toEqual([]);
  });
});

describe("labelClusters", () => {
  it("names each cluster by what sets it apart", () => {
    const labels = labelClusters([
      ["Explain the banker's algorithm with an example", "Using banker's algorithm, is the system in a safe state"],
      ["Explain LRU page replacement", "Count page faults for FIFO page replacement"],
    ]);
    expect(labels[0]).toContain("bankers algorithm");
    expect(labels[1]).toContain("page replacement");
    // A chosen bigram suppresses its own words.
    expect(labels[1].split(" · ")).not.toContain("page");
  });

  it("never names a topic after a course code", () => {
    const [label] = labelClusters([["15CS302J paging and segmentation", "15CS302J paging with segmentation"]]);
    expect(label).not.toMatch(/15cs302j/);
    expect(label).toContain("paging");
  });
});

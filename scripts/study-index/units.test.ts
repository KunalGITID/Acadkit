import { describe, expect, it } from "vitest";
import { syllabusTopics, topicText, unitText } from "./units.mjs";
import { nearestUnit } from "./topics.mjs";

describe("syllabusTopics", () => {
  it("keeps names in order, drops repeats and stray punctuation", () => {
    expect(syllabusTopics([" Semaphores ", "semaphores", "Monitors.", "-", "Push"])).toEqual(["Semaphores", "Monitors", "Push"]);
  });
  it("gives each topic its course", () => {
    expect(topicText({ title: "Operating Systems" }, "Semaphores")).toBe("Operating Systems: Semaphores");
  });
});

const OS = {
  code: "21CSC202J",
  title: "Operating Systems",
  units: [
    { n: 1, title: "Introduction", topics: ["System Calls", "Kernel Data Structures", "System Boot", "Protection"] },
    { n: 2, title: "Process Management", topics: ["Semaphores", "Monitors"] },
  ],
};

describe("unitText", () => {
  it("embeds course, unit and topics", () => {
    expect(unitText(OS, OS.units[1])).toBe("Operating Systems. Unit 2: Process Management. Semaphores, Monitors");
  });
});

describe("nearestUnit", () => {
  it("picks the unit whose vector points the same way", () => {
    const units = [
      { n: 1, vector: [1, 0, 0] },
      { n: 2, vector: [0, 1, 0] },
    ];
    expect(nearestUnit([0.1, 0.9, 0], units)).toBe(2);
    expect(nearestUnit([0.9, 0.2, 0.1], units)).toBe(1);
  });
});

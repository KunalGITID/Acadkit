import { describe, expect, it } from "vitest";
import { chunkPages, cleanPage, titleFor } from "./chunk.mjs";

describe("cleanPage", () => {
  it("rejoins hyphenated words, collapses spacing and drops bare page numbers", () => {
    const page = "Deadlock avoid-\nance uses   the\nbanker's algorithm\n\n12\nPage 3 of 9\n";
    expect(cleanPage(page)).toBe("Deadlock avoidance uses the\nbanker's algorithm");
  });
});

describe("chunkPages", () => {
  const sentence = "The banker's algorithm checks whether granting a request leaves the system in a safe state. ";

  it("keeps each passage on its page, numbered through the document", () => {
    const chunks = chunkPages([sentence.repeat(3), sentence.repeat(3)]);
    expect(chunks.map((c) => c.page)).toEqual([1, 2]);
    expect(chunks.map((c) => c.index)).toEqual([0, 1]);
  });

  it("cuts long pages into overlapping passages at sentence ends", () => {
    const chunks = chunkPages([sentence.repeat(40)], { size: 900, overlap: 150 });
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) expect(c.content.length).toBeLessThanOrEqual(900);
    // Every cut but the last lands after a full stop.
    for (const c of chunks.slice(0, -1)) expect(c.content.endsWith(".")).toBe(true);
    // Consecutive passages share text.
    const tail = chunks[0].content.slice(-60);
    expect(chunks[1].content.includes(tail.slice(-30))).toBe(true);
  });

  it("drops passages with too few letters to mean anything", () => {
    expect(chunkPages(["12 13 14 15\n16 17 18\n— — —"])).toEqual([]);
  });
});

describe("titleFor", () => {
  it("names a passage by subject folder and file", () => {
    expect(titleFor("OS_21CSC202J/02_Notes/Unit_3_Deadlocks.pdf")).toBe("OS 21CSC202J · Unit 3 Deadlocks");
    expect(titleFor("Deadlines_till_20_Nov.pdf")).toBe("Deadlines till 20 Nov");
  });
});

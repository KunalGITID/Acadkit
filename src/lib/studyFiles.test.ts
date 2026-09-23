import { describe, expect, it } from "vitest";
import {
  extOf,
  formatSize,
  listFolder,
  opensInBrowser,
  prettyName,
  searchFiles,
  type StudyFile,
} from "./studyFiles";

const f = (path: string, size = 1000): StudyFile => ({ path, size, mtime: 0, key: `0000/blobs/${path.length}` });

const FILES = [
  f("00_OVERVIEW.pdf"),
  f("OS_21CSC202J/02_Notes/Unit1_OS.pptx"),
  f("OS_21CSC202J/02_Notes/Unit2_OS.pdf"),
  f("OS_21CSC202J/Syllabus.pdf"),
  f("DSA_21CSC201J/02_Notes/Unit10.pdf"),
  f("DSA_21CSC201J/02_Notes/Unit2.pdf"),
  f("CodIn_Java/Java_Weeks_1-3.html"),
];

describe("listFolder", () => {
  it("shows top-level folders with recursive counts, then root files", () => {
    const v = listFolder(FILES, "");
    expect(v.folders.map((x) => [x.name, x.count])).toEqual([
      ["CodIn_Java", 1],
      ["DSA_21CSC201J", 2],
      ["OS_21CSC202J", 3],
    ]);
    expect(v.files.map((x) => x.path)).toEqual(["00_OVERVIEW.pdf"]);
  });

  it("lists a nested folder, sorting numbers naturally", () => {
    const v = listFolder(FILES, "DSA_21CSC201J/02_Notes");
    expect(v.folders).toEqual([]);
    expect(v.files.map((x) => x.path)).toEqual(["DSA_21CSC201J/02_Notes/Unit2.pdf", "DSA_21CSC201J/02_Notes/Unit10.pdf"]);
  });

  it("does not treat a folder whose name only starts the same as a child", () => {
    const v = listFolder([f("OS/a.pdf"), f("OS_Lab/b.pdf")], "OS");
    expect(v.files.map((x) => x.path)).toEqual(["OS/a.pdf"]);
  });
});

describe("searchFiles", () => {
  it("matches every word in any order, across folder and file names", () => {
    expect(searchFiles(FILES, "os unit 1").map((x) => x.path)).toEqual(["OS_21CSC202J/02_Notes/Unit1_OS.pptx"]);
  });

  it("matches words written without the separator, but numbers only whole", () => {
    expect(searchFiles(FILES, "unit1").map((x) => x.path)).toEqual(["OS_21CSC202J/02_Notes/Unit1_OS.pptx"]);
    expect(searchFiles(FILES, "unit 10").map((x) => x.path)).toEqual(["DSA_21CSC201J/02_Notes/Unit10.pdf"]);
  });

  it("matches the start of a word", () => {
    expect(searchFiles(FILES, "syll").map((x) => x.path)).toEqual(["OS_21CSC202J/Syllabus.pdf"]);
  });

  it("puts matches in the file name ahead of matches only in a folder", () => {
    expect(searchFiles(FILES, "os").map((x) => x.path)[0]).toBe("OS_21CSC202J/02_Notes/Unit1_OS.pptx");
  });

  it("returns nothing for a blank query", () => {
    expect(searchFiles(FILES, "   ")).toEqual([]);
  });
});

describe("helpers", () => {
  it("reads extensions case-insensitively and ignores dotfiles", () => {
    expect(extOf("a/B.PDF")).toBe("pdf");
    expect(extOf("a/.hidden")).toBe("");
  });

  it("knows which files open in a browser tab", () => {
    expect(opensInBrowser("x.pdf")).toBe(true);
    expect(opensInBrowser("x.pptx")).toBe(false);
  });

  it("formats sizes and names", () => {
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(2048)).toBe("2 KB");
    expect(formatSize(12.2 * 1024 * 1024)).toBe("12.2 MB");
    expect(prettyName("OS_21CSC202J")).toBe("OS 21CSC202J");
  });
});

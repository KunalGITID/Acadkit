import { describe, expect, it } from "vitest";
import { codeLanguage, columnName, parseDelimited, splitHighlighted, trimSheet, viewerHref, viewerKind } from "@/lib/viewer";

describe("viewerKind", () => {
  it("routes each format the viewer reads to its renderer", () => {
    expect(viewerKind("OS/Unit_1/Notes.PDF")).toBe("pdf");
    expect(viewerKind("a/Handout.docx")).toBe("docx");
    expect(viewerKind("a/Slides.pptx")).toBe("pptx");
    expect(viewerKind("lab/ex1.c")).toBe("code");
    expect(viewerKind("lab/ex1.cpp")).toBe("code");
    expect(viewerKind("lab/Main.java")).toBe("code");
    expect(viewerKind("lab/q.py")).toBe("code");
    expect(viewerKind("a/readme.md")).toBe("text");
    expect(viewerKind("a/Marks.xlsx")).toBe("sheet");
    expect(viewerKind("a/export.csv")).toBe("sheet");
    expect(viewerKind("a/board.JPG")).toBe("image");
  });

  it("marks the binary Office formats as needing the Mac's conversion", () => {
    expect(viewerKind("a/old.doc")).toBe("legacy");
    expect(viewerKind("a/old.ppt")).toBe("legacy");
    expect(viewerKind("a/old.xls")).toBe("legacy");
  });

  it("offers only the download for anything else", () => {
    expect(viewerKind("a/archive.zip")).toBe("none");
    expect(viewerKind("a/noext")).toBe("none");
  });
});

describe("codeLanguage", () => {
  it("names the highlighter's language", () => {
    expect(codeLanguage("x.h")).toBe("c");
    expect(codeLanguage("x.hpp")).toBe("cpp");
    expect(codeLanguage("x.py")).toBe("python");
    expect(codeLanguage("x.txt")).toBeNull();
  });
});

describe("viewerHref", () => {
  it("encodes the path and adds a page only when given", () => {
    expect(viewerHref("OS & DS/Unit 1.pdf")).toBe("/view?path=OS+%26+DS%2FUnit+1.pdf");
    expect(viewerHref("a.pdf", 4)).toBe("/view?path=a.pdf&page=4");
    expect(viewerHref("a.pdf", null)).toBe("/view?path=a.pdf");
  });
});

describe("splitHighlighted", () => {
  it("re-opens a span a line break cuts through", () => {
    const html = 'int x; <span class="c">/* one\ntwo */</span>\nreturn;';
    expect(splitHighlighted(html)).toEqual([
      'int x; <span class="c">/* one</span>',
      '<span class="c">two */</span>',
      "return;",
    ]);
  });

  it("handles nested spans", () => {
    const html = '<span class="s">"a<span class="e">\\n\nb</span>"</span>';
    expect(splitHighlighted(html)).toEqual([
      '<span class="s">"a<span class="e">\\n</span></span>',
      '<span class="s"><span class="e">b</span>"</span>',
    ]);
  });
});

describe("parseDelimited", () => {
  it("reads quoted separators, newlines and doubled quotes", () => {
    const csv = 'Name,Note\r\n"Kunal, K","said ""hi""\nthen left"\nA,\n\n';
    expect(parseDelimited(csv)).toEqual([
      ["Name", "Note"],
      ["Kunal, K", 'said "hi"\nthen left'],
      ["A", ""],
    ]);
  });
  it("reads tabs for TSV", () => {
    expect(parseDelimited("a\tb\n1\t2", "\t")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("columnName", () => {
  it("counts like a spreadsheet", () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnName)).toEqual(["A", "B", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA"]);
  });
});

describe("trimSheet", () => {
  it("drops blank trailing rows and columns and pads short rows", () => {
    expect(trimSheet<string | number>([["a", null, ""], ["b", 2], [null, null, null], []])).toEqual([
      ["a", null],
      ["b", 2],
    ]);
    expect(trimSheet([[null], []])).toEqual([]);
  });
});

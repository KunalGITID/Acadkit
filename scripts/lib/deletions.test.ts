import { describe, expect, it } from "vitest";
import { dropFromPrep, freeName, resolveRequest, shaOfKey, sourceOf, trashName, webVersionOf } from "./deletions.mjs";

const ROOT = "/Users/me/Documents/SRM_Sem3";

describe("resolveRequest", () => {
  it("resolves a synced file inside the folder", () => {
    expect(resolveRequest(ROOT, "OS_21CSC202J/02_Notes/Unit 1.pdf")).toEqual({
      full: `${ROOT}/OS_21CSC202J/02_Notes/Unit 1.pdf`,
    });
  });
  it.each([
    ["../secret.txt"],
    ["OS/../../x"],
    ["/etc/passwd"],
    ["a//b.pdf"],
    ["./a.pdf"],
    ["a\\b.pdf"],
    [""],
  ])("refuses %j", (rel) => {
    expect(resolveRequest(ROOT, rel)).toHaveProperty("error");
  });
  it("refuses paths the sync never uploads", () => {
    expect(resolveRequest(ROOT, "_src/acadkit_prep.json").error).toMatch(/never uploads/);
    expect(resolveRequest(ROOT, "OS/.DS_Store").error).toMatch(/never uploads/);
    expect(resolveRequest(ROOT, "OS/~$lock.docx").error).toMatch(/never uploads/);
  });
  it("refuses non-strings", () => {
    expect(resolveRequest(ROOT, null as unknown as string)).toHaveProperty("error");
  });
});

describe("shaOfKey", () => {
  const sha = "a".repeat(64);
  it("reads the hash from a blob key", () => {
    expect(shaOfKey(`1234/blobs/${sha}.pdf`)).toBe(sha);
    expect(shaOfKey(`1234/blobs/${sha}`)).toBe(sha);
  });
  it("is null for anything else", () => {
    expect(shaOfKey("1234/manifest.json")).toBeNull();
    expect(shaOfKey(`1234/blobs/${sha.slice(1)}.pdf`)).toBeNull();
  });
});

describe("trashName", () => {
  it("keeps a free name and numbers a taken one", () => {
    expect(trashName("a.pdf", () => false)).toBe("a.pdf");
    const taken = new Set(["a.pdf", "a (AcadKit 2).pdf"]);
    expect(trashName("a.pdf", (n) => taken.has(n))).toBe("a (AcadKit 3).pdf");
    expect(trashName("Makefile", (n) => n === "Makefile")).toBe("Makefile (AcadKit 2)");
  });
});

describe("sourceOf", () => {
  it("maps a PDF to its _src markdown", () => {
    expect(sourceOf("OS/09_Guides/Ex3.pdf")).toBe("_src/OS/09_Guides/Ex3.md");
    expect(sourceOf("OS/code/p13.c")).toBeNull();
  });
});

describe("freeName", () => {
  it("numbers a taken name before its extension", () => {
    const taken = new Set(["image.jpg", "image (2).jpg"]);
    expect(freeName("image.jpg", (n) => taken.has(n))).toBe("image (3).jpg");
    expect(freeName("notes.pdf", () => false)).toBe("notes.pdf");
  });
});

describe("dropFromPrep", () => {
  const prep = {
    version: 1,
    tests: [
      { label: "FT-II", files: [{ path: "OS/a.pdf" }, { path: "OS/b.pdf" }] },
      { label: "T-EXT", files: [{ path: "OS/b.pdf" }] },
      { label: "CT-2" },
    ],
  };
  it("removes every link to a deleted file", () => {
    const { prep: out, removed } = dropFromPrep(prep, new Set(["OS/b.pdf"]));
    expect(removed).toBe(2);
    expect(out.tests[0].files).toEqual([{ path: "OS/a.pdf" }]);
    expect(out.tests[1].files).toEqual([]);
    expect(out.version).toBe(1);
  });
  it("hands back the same object when nothing pointed at it", () => {
    const { prep: out, removed } = dropFromPrep(prep, new Set(["OS/zzz.pdf"]));
    expect(removed).toBe(0);
    expect(out).toBe(prep);
  });
});

describe("webVersionOf", () => {
  it("maps a PDF to its web version and ignores other files", () => {
    expect(webVersionOf("Operating_Systems/06_Notes_from_WhatsApp.pdf")).toBe("_src/_html/Operating_Systems/06_Notes_from_WhatsApp.html");
    expect(webVersionOf("Operating_Systems/slides.pptx")).toBeNull();
  });
});

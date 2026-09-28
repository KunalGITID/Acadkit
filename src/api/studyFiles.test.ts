import { describe, expect, it } from "vitest";
import { safeUploadName } from "./studyFiles";

describe("safeUploadName", () => {
  it("keeps ordinary names", () => {
    expect(safeUploadName("Unit 3 notes.pdf")).toBe("Unit 3 notes.pdf");
  });
  it("never produces a path", () => {
    expect(safeUploadName("../../etc/passwd")).not.toMatch(/\//);
  });
  it("renames what the sync would skip", () => {
    expect(safeUploadName(".hidden.pdf")).toBe("upload-hidden.pdf");
    expect(safeUploadName("_draft.md")).toBe("upload-draft.md");
    expect(safeUploadName("~$lock.docx")).toBe("upload-lock.docx");
  });
  it("never returns an empty name", () => {
    expect(safeUploadName("   ")).toBe("upload");
  });
});

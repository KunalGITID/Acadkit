/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isAppleMobile, saveFile, typeFor } from "@/lib/saveFile";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

let clicked: Array<{ href: string; download: string }>;
beforeEach(() => {
  clicked = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push({ href: this.href, download: this.download });
  });
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

function device(ua: string, share?: (d: { files: File[] }) => Promise<void>, platform = "") {
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
  Object.defineProperty(navigator, "platform", { value: platform, configurable: true });
  Object.defineProperty(navigator, "maxTouchPoints", { value: platform === "MacIntel" && ua === MAC ? 5 : 0, configurable: true });
  Object.defineProperty(navigator, "canShare", { value: share ? () => true : undefined, configurable: true });
  Object.defineProperty(navigator, "share", { value: share, configurable: true });
}

describe("saveFile", () => {
  it("on an iPhone, opens the share sheet straight away, with the file and its real name", () => {
    const share = vi.fn<(data: { files: File[] }) => Promise<void>>(() => Promise.resolve());
    device(IPHONE, share);
    expect(saveFile(new Blob(["%PDF"]), "Unit 3 notes.pdf")).toBe("share");
    expect(share).toHaveBeenCalledTimes(1); // synchronously, inside the tap
    const file = share.mock.calls[0]![0].files[0]!;
    expect(file.name).toBe("Unit 3 notes.pdf");
    expect(file.type).toBe("application/pdf");
    expect(clicked).toEqual([]); // no link followed
  });

  it("closing the share sheet does nothing more; a refused share falls back to a download", async () => {
    device(IPHONE, () => Promise.reject(Object.assign(new Error("cancelled"), { name: "AbortError" })));
    saveFile(new Blob(["x"]), "a.pptx");
    await Promise.resolve();
    await Promise.resolve();
    expect(clicked).toEqual([]);

    device(IPHONE, () => Promise.reject(Object.assign(new Error("no"), { name: "NotAllowedError" })));
    saveFile(new Blob(["x"]), "a.pptx");
    await vi.waitFor(() => expect(clicked).toEqual([{ href: "blob:mock", download: "a.pptx" }]));
  });

  it("elsewhere, downloads the bytes under the file's real name (no share sheet on a desktop)", () => {
    const share = vi.fn<(data: { files: File[] }) => Promise<void>>(() => Promise.resolve());
    device(MAC, share);
    expect(saveFile(new Blob(["x"]), "FT-3 practice.docx")).toBe("download");
    expect(share).not.toHaveBeenCalled();
    expect(clicked).toEqual([{ href: "blob:mock", download: "FT-3 practice.docx" }]);
  });
});

describe("isAppleMobile", () => {
  it("knows an iPad by its touchscreen, since iPadOS says it's a Mac", () => {
    expect(isAppleMobile({ userAgent: IPHONE, platform: "iPhone", maxTouchPoints: 5 })).toBe(true);
    expect(isAppleMobile({ userAgent: MAC, platform: "MacIntel", maxTouchPoints: 5 })).toBe(true);
    expect(isAppleMobile({ userAgent: MAC, platform: "MacIntel", maxTouchPoints: 0 })).toBe(false);
  });
});

describe("typeFor", () => {
  it("names the type by extension, since stored blobs are named by hash", () => {
    expect(typeFor("deck.PPTX")).toBe("application/vnd.openxmlformats-officedocument.presentationml.presentation");
    expect(typeFor("thing.weird", "application/x-thing")).toBe("application/x-thing");
    expect(typeFor("thing")).toBe("application/octet-stream");
  });
});

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildRenditions } from "./renditions.mjs";

let cacheDir: string;
beforeEach(async () => {
  cacheDir = await mkdtemp(path.join(tmpdir(), "renditions-test-"));
});
afterEach(async () => {
  await rm(cacheDir, { recursive: true, force: true });
});

const doc = { path: "OS/old.doc", full: "/x/old.doc", key: "0404/blobs/aaa.doc", ext: "doc" };
const ppt = { path: "OS/old.ppt", full: "/x/old.ppt", key: "0404/blobs/bbb.ppt", ext: "ppt" };
const xls = { path: "OS/marks.xls", full: "/x/marks.xls", key: "0404/blobs/ddd.xls", ext: "xls" };
const pdf = { path: "OS/new.pdf", full: "/x/new.pdf", key: "0404/blobs/ccc.pdf", ext: "pdf" };

describe("buildRenditions", () => {
  it("converts .ppt to PDF and .xls to .xlsx with LibreOffice when it is there", async () => {
    const calls: string[][] = [];
    const run = async (cmd: string, args: string[]) => {
      calls.push([cmd, ...args]);
      if (args[0] === "--headless") {
        const [, , to, , outdir, input] = args;
        await writeFile(path.join(outdir, `${path.basename(input).replace(/\.[^.]+$/, "")}.${to}`), "out");
      }
      return { stdout: "", stderr: "" };
    };
    const out = await buildRenditions([ppt, xls], { run, cacheDir, log: () => {} });
    expect(out.get("OS/old.ppt")).toMatchObject({ ext: "pdf", full: path.join(cacheDir, "bbb.pdf") });
    expect(out.get("OS/marks.xls")).toMatchObject({ ext: "xlsx", full: path.join(cacheDir, "ddd.xlsx") });
    expect(calls.filter((c) => c[1] === "--headless").map((c) => c[3])).toEqual(["pdf", "xlsx"]);
  });


  it("converts .doc with textutil into the cache, keyed by the source hash", async () => {
    const calls: string[][] = [];
    const run = async (cmd: string, args: string[]) => {
      calls.push([cmd, ...args]);
      if (cmd === "textutil") await writeFile(args[3], "converted");
      else throw Object.assign(new Error("not found"), { code: "ENOENT" });
      return { stdout: "", stderr: "" };
    };
    const logs: string[] = [];
    const out = await buildRenditions([doc, ppt, pdf], { run, cacheDir, log: (m: string) => logs.push(m) });
    expect(calls[0]).toEqual(["textutil", "-convert", "docx", "-output", path.join(cacheDir, "aaa.docx"), "/x/old.doc"]);
    expect([...out.keys()]).toEqual(["OS/old.doc"]);
    expect(out.get("OS/old.doc")).toMatchObject({ ext: "docx", full: path.join(cacheDir, "aaa.docx") });
    expect(out.get("OS/old.doc")!.sha).toMatch(/^[0-9a-f]{64}$/);
    // No LibreOffice: the .ppt is left as a download, said once.
    expect(logs.some((l) => l.includes("LibreOffice"))).toBe(true);
  });

  it("converts nothing twice", async () => {
    await writeFile(path.join(cacheDir, "aaa.docx"), "cached");
    let ran = 0;
    const out = await buildRenditions([doc], {
      run: async () => {
        ran++;
        return { stdout: "", stderr: "" };
      },
      cacheDir,
    });
    expect(ran).toBe(0);
    expect(out.has("OS/old.doc")).toBe(true);
  });

  it("leaves a file without a preview when conversion fails", async () => {
    const out = await buildRenditions([doc], {
      run: async () => {
        throw new Error("bad file");
      },
      cacheDir,
      log: () => {},
    });
    expect(out.size).toBe(0);
  });
});

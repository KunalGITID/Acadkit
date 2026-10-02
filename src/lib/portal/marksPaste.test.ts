/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { COPY_HEADER, parseMarksText } from "@/lib/portal/marksPaste";
import { parsePastedPortal, parsePastedText } from "@/lib/portal/paste";

// Shapes copied from sp.srmist.edu.in's "Internal Mark Details" (October 2026).

const popup = (code: string, title: string, rows: Array<[string, string, string]>) => `
  <div class="modal fade show" id="confirmModal">
    <div class="modal-header"><h5 class="modal-title">${code} - ${title}</h5></div>
    <div class="modal-body"><table class="table">
      <thead><tr><th>Entered on</th><th>Component</th><th>Mark / Max. Mark</th></tr></thead>
      <tbody>${rows.map(([d, c, m]) => `<tr><td>${d}</td><td>${c}</td><td>${m}</td></tr>`).join("")}</tbody>
    </table></div>
  </div>`;

const FDS = popup("21CSS202T", "FUNDAMENTALS OF DATA SCIENCE", [
  ["31/Aug/2026", "FT-I", "2.00 / 5.00"],
  ["30/Sep/2026", "FT-II", "7.60 / 15.00"],
]);
const MAB = popup("21MAB201T", "TRANSFORMS AND BOUNDARY VALUE PROBLEMS", [
  ["29/Aug/2026", "FT-I", "5.00 / 5.00"],
  ["29/Sep/2026", "FT-II", "3.00 / 15.00"],
]);

const SUMMARY = `
  <div class="card"><div class="card-header">Internal Mark Details</div>
  <table class="table"><thead><tr><th>Code</th><th>Description</th><th>Mark / Max. Mark</th><th></th></tr></thead>
  <tbody>
    <tr><td>21CSC201J</td><td>DATA STRUCTURES AND ALGORITHMS</td><td>4.10 / 15.00</td>
      <td><button onclick="funViewComponentWiseMarks('1','21CSC201J','DSA',2)">View Details</button></td></tr>
    <tr><td>21CSS202T</td><td>FUNDAMENTALS OF DATA SCIENCE</td><td>9.60 / 20.00</td>
      <td><button onclick="funViewComponentWiseMarks('2','21CSS202T','FDS',2)">View Details</button></td></tr>
    <tr><td>21MAB201T</td><td>TRANSFORMS AND BOUNDARY VALUE PROBLEMS</td><td>8.00 / 20.00</td>
      <td><button onclick="funViewComponentWiseMarks('3','21MAB201T','TBVP',2)">View Details</button></td></tr>
  </tbody></table></div>`;

const brief = (rows: Array<{ subject_code: string; label: string; marks_obtained: number; max_marks: number }>) =>
  rows.map((r) => `${r.subject_code} ${r.label} ${r.marks_obtained}/${r.max_marks}`);

describe("pasting the marks popups", () => {
  it("reads one popup, its subject taken from the title", () => {
    const p = parsePastedPortal(FDS);
    expect(brief(p.marks)).toEqual(["21CSS202T FT-I 2/5", "21CSS202T FT-II 7.6/15"]);
    expect(p.marks.every((m) => m.component_type === "CT")).toBe(true);
    expect(p.diagnostic).toBeNull();
  });

  it("reads several popups pasted together, each under its own subject", () => {
    expect(brief(parsePastedPortal(FDS + MAB).marks)).toEqual([
      "21CSS202T FT-I 2/5",
      "21CSS202T FT-II 7.6/15",
      "21MAB201T FT-I 5/5",
      "21MAB201T FT-II 3/15",
    ]);
  });

  it("a popup copied without its title is kept, with the subject left to ask", () => {
    const tableOnly = FDS.replace(/<div class="modal-header">.*?<\/div>/s, "");
    const p = parsePastedPortal(tableOnly);
    expect(p.marks).toEqual([]);
    expect(brief(p.uncodedMarks)).toEqual([" FT-I 2/5", " FT-II 7.6/15"]);
    expect(p.diagnostic).toBeNull(); // not "found nothing"
  });

  it("the whole page with a popup open: the popup goes to its own subject, not the summary's last row", () => {
    const p = parsePastedPortal(SUMMARY + FDS);
    expect(brief(p.marks)).toEqual(["21CSS202T FT-I 2/5", "21CSS202T FT-II 7.6/15"]);
  });
});

describe("pasting the marks summary", () => {
  it("reads each subject's total instead of reporting an error", () => {
    const p = parsePastedPortal(SUMMARY);
    expect(p.markTotals).toEqual([
      { subject_code: "21CSC201J", obtained: 4.1, max: 15 },
      { subject_code: "21CSS202T", obtained: 9.6, max: 20 },
      { subject_code: "21MAB201T", obtained: 8, max: 20 },
    ]);
    expect(p.marks).toEqual([]); // a total is not a component
    expect(p.diagnostic).toBeNull();
  });
});

describe("pasting plain text (an iPhone clipboard)", () => {
  it("reads a popup, even with its cells broken across lines", () => {
    const text = "21CSS202T - FUNDAMENTALS OF DATA SCIENCE\nEntered on\tComponent\tMark / Max. Mark\n31/Aug/2026\nFT-I\n2.00 / 5.00\n30/Sep/2026\tFT-II\t7.60 / 15.00\nClose";
    expect(brief(parsePastedText(text).marks)).toEqual(["21CSS202T FT-I 2/5", "21CSS202T FT-II 7.6/15"]);
  });

  it("reads the summary's totals", () => {
    const text = "Internal Mark Details\nCode\tDescription\tMark / Max. Mark\n21CSS202T\tFUNDAMENTALS OF DATA SCIENCE\t9.60 / 20.00\tView Details\n21LEM201T\tPROFESSIONAL ETHICS\t11.00 / 20.00\tView Details";
    expect(parseMarksText(text).totals).toEqual([
      { subject_code: "21CSS202T", obtained: 9.6, max: 20 },
      { subject_code: "21LEM201T", obtained: 11, max: 20 },
    ]);
  });

  it("a popup's rows without its title are kept for asking", () => {
    const m = parseMarksText("31/Aug/2026 FT-I 2.00 / 5.00");
    expect(m.marks).toEqual([]);
    expect(brief(m.uncoded)).toEqual([" FT-I 2/5"]);
  });

  it("reads what the Copy all marks bookmarklet writes", () => {
    const text = [COPY_HEADER, "21CSS202T\tFT-I\t2\t5", "21CSS202T\tFT-II\t7.6\t15", "21LEM201T\tFML-I\t11\t20", "21CSC201J\tFJ-I\tAbs\t15"].join("\n");
    expect(brief(parsePastedText(text).marks)).toEqual([
      "21CSS202T FT-I 2/5",
      "21CSS202T FT-II 7.6/15",
      "21LEM201T FML-I 11/20",
      "21CSC201J FJ-I 0/15",
    ]);
  });

  it("finds nothing in text that isn't marks", () => {
    const p = parsePastedText("hello there, 3 / 4 friends");
    expect(p.marks.length + p.uncodedMarks.length + p.markTotals.length).toBe(0);
  });
});

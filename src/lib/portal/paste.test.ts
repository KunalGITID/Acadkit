/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { looksLikeHtml, parsePastedPortal } from "@/lib/portal/paste";

const ATTENDANCE = `<table class="table mb-0"><thead><tr>
  <th>Code</th><th>Description</th><th>Max. hours</th><th>Att. hours</th>
  <th>Absent hours</th><th>Total Percentage</th>
</tr></thead><tbody>
  <tr><td>21CSC202J</td><td>OS</td><td>45</td><td>39</td><td>6</td><td>86.67</td></tr>
  <tr><td>21CSC203J</td><td>DSA</td><td>40</td><td>38</td><td>2</td><td>95</td></tr>
</tbody></table>`;

describe("looksLikeHtml", () => {
  it("recognises markup", () => {
    expect(looksLikeHtml(ATTENDANCE)).toBe(true);
  });

  /** The failure this guards: iOS hands over a plain-text flavour when the copy wasn't rich, and the parser would then quietly find zero tables and report "nothing on this page" - blaming the portal for a clipboard problem. */
  it("rejects flattened text, which is the likely clipboard failure", () => {
    expect(looksLikeHtml("Code Description Max. hours\n21CSC202J OS 45")).toBe(false);
  });
});

describe("parsePastedPortal", () => {
  it("reads an attendance report out of pasted markup", () => {
    const out = parsePastedPortal(ATTENDANCE);
    expect(out.attendance).toEqual([
      { subject_code: "21CSC202J", conducted: 45, absent: 6, percentage: 86.67, title: "OS" },
      { subject_code: "21CSC203J", conducted: 40, absent: 2, percentage: 95, title: "DSA" },
    ]);
    expect(out.diagnostic).toBeNull();
  });

  /** Onboarding turns these rows into a new student's subjects, so the name, category and faculty have to come through too. */
  it("reads each course's title, category and faculty from the Academia layout", () => {
    const out = parsePastedPortal(`<table><thead><tr>
      <th>Course Code</th><th>Course Title</th><th>Category</th><th>Faculty Name</th>
      <th>Slot</th><th>Room No</th><th>Hours Conducted</th><th>Hours Absent</th><th>Attn %</th>
    </tr></thead><tbody>
      <tr><td>21CSC202J</td><td>Operating Systems</td><td>Theory</td><td>Dr. A (100001)</td>
        <td>A</td><td>TP301</td><td>40</td><td>4</td><td>90.00</td></tr>
      <tr><td>21CSC206P</td><td> Advanced Object Oriented Programming </td><td>Practical</td><td></td>
        <td>P1</td><td>TP302</td><td>20</td><td>0</td><td>100.00</td></tr>
    </tbody></table>`);
    expect(out.attendance).toEqual([
      {
        subject_code: "21CSC202J", conducted: 40, absent: 4, percentage: 90,
        title: "Operating Systems", category: "Theory", faculty: "Dr. A (100001)",
      },
      {
        subject_code: "21CSC206P", conducted: 20, absent: 0, percentage: 100,
        title: "Advanced Object Oriented Programming", category: "Practical", faculty: undefined,
      },
    ]);
  });

  it("survives the wrapper markup a real copy drags along", () => {
    const out = parsePastedPortal(
      `<meta charset="utf-8"><div class="wrap"><span>Attendance Details</span>${ATTENDANCE}</div>`
    );
    expect(out.attendance).toHaveLength(2);
  });

  it("reports what it saw when nothing parses, instead of just failing", () => {
    const out = parsePastedPortal(
      `<div class="rpt">
         <div class="row"><span>21CSC201J</span><span>45</span></div>
         <div class="row"><span>21CSC203J</span><span>40</span></div>
         <div class="row"><span>21MAB201T</span><span>50</span></div>
       </div>`
    );
    expect(out.attendance).toEqual([]);
    expect(out.diagnostic).toBeTruthy();
    const dump = JSON.parse(out.diagnostic!);
    expect(dump.grids.some((g: { rowCount: number }) => g.rowCount === 3)).toBe(true);
  });

  it("does not mistake a table with no code column for a report", () => {
    const out = parsePastedPortal(
      `<table><tr><th>Month</th><th>Percentage</th></tr><tr><td>Aug</td><td>88</td></tr></table>`
    );
    expect(out.attendance).toEqual([]);
    expect(out.tablesSeen).toBe(1);
  });

  it("is empty, not broken, on an empty paste", () => {
    const out = parsePastedPortal("");
    expect(out.attendance).toEqual([]);
    expect(out.marks).toEqual([]);
    expect(out.tablesSeen).toBe(0);
  });
});

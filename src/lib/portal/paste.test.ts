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

  /**
   * The failure this guards: iOS hands over a plain-text flavour when
   * the copy wasn't rich, and the parser would then quietly find zero
   * tables and report "nothing on this page" — blaming the portal for
   * a clipboard problem.
   */
  it("rejects flattened text, which is the likely clipboard failure", () => {
    expect(looksLikeHtml("Code Description Max. hours\n21CSC202J OS 45")).toBe(false);
  });
});

describe("parsePastedPortal", () => {
  it("reads an attendance report out of pasted markup", () => {
    const out = parsePastedPortal(ATTENDANCE);
    expect(out.attendance).toEqual([
      { subject_code: "21CSC202J", conducted: 45, absent: 6, percentage: 86.67 },
      { subject_code: "21CSC203J", conducted: 40, absent: 2, percentage: 95 },
    ]);
    expect(out.diagnostic).toBeNull();
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

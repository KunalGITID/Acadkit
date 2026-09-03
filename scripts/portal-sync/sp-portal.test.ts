/**
 * @vitest-environment happy-dom
 *
 * Real markup captured from sp.srmist.edu.in (the JSP student portal) on
 * 03/Sep/2026, semester 3. Unlike the synthetic fixtures in
 * portal-sync.test.ts these are verbatim `outerHTML` from the live pages,
 * so they pin the parser to a portal shape that actually exists.
 *
 * Three pages matter:
 *   Attendance Details  — one course-wise table + a month-wise summary
 *                         that must NOT be mistaken for it (no code column).
 *   Internal Mark Details — a summary table whose mark cell is a combined
 *                         "2.00 / 5.00" string; the per-component breakdown
 *                         lives behind a "View Details" button.
 *   The component modal — what that button loads.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

interface SyncApi {
  scrapeAttendance: (tables: HTMLTableElement[]) => Array<{
    subject_code: string;
    conducted: number;
    absent: number;
    percentage: number | null;
  }>;
  scrapeMarks: (tables: HTMLTableElement[]) => Array<Mark>;
  scrapeComponents: (tables: HTMLTableElement[], code: string) => Array<Mark>;
  splitPair: (text: string) => { obtained: number; max: number } | null;
  findDetailTable: (
    tables: HTMLTableElement[]
  ) => { table: HTMLTableElement; iCode: number } | null;
}

interface Mark {
  subject_code: string;
  label: string;
  max_marks: number;
  marks_obtained: number;
  component_type: string;
}

let api: SyncApi;

beforeAll(() => {
  const src = readFileSync(resolve(__dirname, "portal-sync.js"), "utf8")
    .replace("__SUPABASE_URL__", "https://example.supabase.co")
    .replace("__SUPABASE_ANON_KEY__", "test-key")
    .replace("__PIN__", "1234")
    .replace("__DIAG_ONLY__", "false");
  (window as unknown as Record<string, unknown>).__ACADKIT_SYNC_TEST__ = true;
  new Function(src)();
  api = (window as unknown as { __acadkitSync: SyncApi }).__acadkitSync;
});

/** Parse an HTML string and hand back every table in it. */
function tablesOf(html: string): HTMLTableElement[] {
  const host = document.createElement("div");
  host.innerHTML = html;
  return Array.from(host.querySelectorAll("table"));
}

const ATTENDANCE_HTML = `
<table class="table mb-0">
  <thead>
    <tr>
      <th width="10%" scope="col">Code</th>
      <th width="32%" scope="col">Description</th>
      <th width="8%" scope="col">Max. hours</th>
      <th width="8%" scope="col">Att. hours</th>
      <th width="8%" scope="col">Absent hours</th>
      <th width="8%" scope="col">Total Percentage</th>
    </tr>
  </thead>
  <tbody>
    <tr valign="top"><td>21CSC201J</td><td>DATA STRUCTURES AND ALGORITHMS</td><td>30</td><td>9</td><td>21</td><td>30.00</td></tr>
    <tr valign="top"><td>21CSC202J</td><td>OPERATING SYSTEMS</td><td>30</td><td>7</td><td>23</td><td>23.33</td></tr>
    <tr valign="top"><td>21CSC206P</td><td>ADVANCED OBJECT ORIENTED PROGRAMMING</td><td>18</td><td>11</td><td>7</td><td>61.11</td></tr>
    <tr valign="top"><td>21CSS202T</td><td>FUNDAMENTALS OF DATA SCIENCE</td><td>24</td><td>10</td><td>14</td><td>41.67</td></tr>
    <tr valign="top"><td>21LEM201T</td><td>PROFESSIONAL ETHICS</td><td>6</td><td>2</td><td>4</td><td>33.33</td></tr>
    <tr valign="top"><td>21LEM202T</td><td>UNIVERSAL HUMAN VALUES - II: UNDERSTANDING HARMONY AND ETHICAL HUMAN CONDUCT</td><td>2</td><td>0</td><td>2</td><td>0.00</td></tr>
    <tr valign="top"><td>21MAB201T</td><td>TRANSFORMS AND BOUNDARY VALUE PROBLEMS</td><td>24</td><td>8</td><td>16</td><td>33.33</td></tr>
  </tbody>
</table>`;

/** Sits directly below the course-wise table on the same page. */
const MONTHWISE_HTML = `
<table class="table mb-0">
  <thead><tr><th scope="col">Month / Year</th><th scope="col">Present</th><th scope="col">Absent</th></tr></thead>
  <tbody>
    <tr><td>Jul-2026</td><td>0</td><td>42</td></tr>
    <tr><td>Aug-2026</td><td>38</td><td>45</td></tr>
    <tr><td>Sep-2026</td><td>9</td><td>0</td></tr>
  </tbody>
</table>`;

const MARKS_SUMMARY_HTML = `
<table class="table mb-0">
  <thead>
    <tr>
      <th width="25%" scope="col">Code</th>
      <th width="50%" scope="col">Description</th>
      <th width="25%" scope="col">Mark / Max. Mark</th>
      <th></th>
    </tr>
  </thead>
  <tbody>
    <tr valign="top">
      <td>21CSS202T</td><td>FUNDAMENTALS OF DATA SCIENCE</td><td>2.00 / 5.00</td>
      <td><button class="btn btn-sm btn-custom lift" type="button" onclick="funViewComponentWiseMarks('41539', '21CSS202T', 'FUNDAMENTALS OF DATA SCIENCE',2)"><i class="fas fa-eye mr-1"></i> View Details</button></td>
    </tr>
    <tr valign="top">
      <td>21MAB201T</td><td>TRANSFORMS AND BOUNDARY VALUE PROBLEMS</td><td>5.00 / 5.00</td>
      <td><button class="btn btn-sm btn-custom lift" type="button" onclick="funViewComponentWiseMarks('39210', '21MAB201T', 'TRANSFORMS AND BOUNDARY VALUE PROBLEMS',2)"><i class="fas fa-eye mr-1"></i> View Details</button></td>
    </tr>
  </tbody>
</table>`;

/** Loaded into #confirmModal by the "View Details" button. */
const COMPONENT_MODAL_HTML = `
<table class="table mb-0 ">
  <thead><tr><th scope="col">Entered on</th><th scope="col">Component</th><th scope="col">Mark / Max. Mark</th></tr></thead>
  <tbody><tr valign="top"><td>31/Aug/2026</td><td>FT-I</td><td>2.00 / 5.00</td></tr></tbody>
</table>`;

describe("sp.srmist.edu.in — attendance", () => {
  it("reads the course-wise table via Max./Att./Absent hours headers", () => {
    const rows = api.scrapeAttendance(tablesOf(ATTENDANCE_HTML));
    expect(rows).toHaveLength(7);
    expect(rows[0]).toEqual({
      subject_code: "21CSC201J",
      conducted: 30,
      absent: 21,
      percentage: 30,
    });
    // "Absent hours" must not also be claimed as the conducted column.
    expect(rows[2]).toEqual({
      subject_code: "21CSC206P",
      conducted: 18,
      absent: 7,
      percentage: 61.11,
    });
  });

  it("ignores the month-wise summary, which has no code column", () => {
    expect(api.scrapeAttendance(tablesOf(MONTHWISE_HTML))).toEqual([]);
  });

  it("picks the course-wise table when both are on the page", () => {
    const rows = api.scrapeAttendance(
      tablesOf(ATTENDANCE_HTML + MONTHWISE_HTML)
    );
    expect(rows).toHaveLength(7);
    expect(rows.map((r) => r.subject_code)).toContain("21MAB201T");
  });
});

describe("sp.srmist.edu.in — marks", () => {
  it("reads components from the View Details modal", () => {
    const rows = api.scrapeComponents(
      tablesOf(COMPONENT_MODAL_HTML),
      "21CSS202T"
    );
    expect(rows).toEqual([
      {
        subject_code: "21CSS202T",
        label: "FT-I",
        max_marks: 5,
        marks_obtained: 2,
        component_type: "CT",
      },
    ]);
  });

  it("finds the summary table by its View Details buttons", () => {
    const hit = api.findDetailTable(tablesOf(MARKS_SUMMARY_HTML));
    expect(hit).not.toBeNull();
    expect(hit!.iCode).toBe(0);
  });

  it("does not mistake the attendance table for a detail table", () => {
    expect(api.findDetailTable(tablesOf(ATTENDANCE_HTML))).toBeNull();
  });

  it("parses a mark pair, treating Abs as zero", () => {
    expect(api.splitPair("2.00 / 5.00")).toEqual({ obtained: 2, max: 5 });
    expect(api.splitPair("Abs / 50")).toEqual({ obtained: 0, max: 50 });
    // A bare total with no denominator is not a component.
    expect(api.splitPair("2.00")).toBeNull();
  });

  it("does not invent components from the summary table alone", () => {
    // "2.00 / 5.00" is a total, not a labelled component. Reporting
    // nothing beats writing a mark AcadKit would show as a test result.
    expect(api.scrapeMarks(tablesOf(MARKS_SUMMARY_HTML))).toEqual([]);
  });

  it("never reads the attendance table as marks", () => {
    expect(api.scrapeMarks(tablesOf(ATTENDANCE_HTML))).toEqual([]);
  });
});

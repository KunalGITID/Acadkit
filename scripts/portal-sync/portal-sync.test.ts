/**
 * @vitest-environment happy-dom
 *
 * Fixtures approximating SRM Academia's report markup. They are a best
 * guess at the real DOM, so their job is narrow: prove the header-driven
 * matching works, prove the marks cell parses both nested and flat
 * layouts, and prove ambiguous markup yields nothing rather than a wrong
 * number. Replace them with real saved markup when it's available.
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
  scrapeMarks: (tables: HTMLTableElement[]) => Array<{
    subject_code: string;
    label: string;
    max_marks: number;
    marks_obtained: number;
    component_type: string;
  }>;
  tables: (docs: Document[]) => HTMLTableElement[];
  classify: (label: string) => string;
  diagnose: (
    found: { docs: Document[]; blocked: number },
    all: HTMLTableElement[]
  ) => string;
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
  api = (window as unknown as Record<string, unknown>).__acadkitSync as SyncApi;
});

function load(html: string): HTMLTableElement[] {
  document.body.innerHTML = html;
  return api.tables([document]);
}

const ATTENDANCE_HTML = `
<table>
  <tr><th>Course Code</th><th>Course Title</th><th>Category</th>
      <th>Hours Conducted</th><th>Hours Absent</th><th>Attn %</th></tr>
  <tr><td>21CSC201J</td><td>Data Structures</td><td>Theory</td>
      <td>45</td><td>6</td><td>86.67</td></tr>
  <tr><td>21CSC203P</td><td>Advanced Programming</td><td>Practical</td>
      <td>30</td><td>9</td><td>70</td></tr>
</table>`;

const MARKS_NESTED_HTML = `
<table>
  <tr><th>Course Code</th><th>Course Type</th><th>Test Performance</th></tr>
  <tr><td>21CSC201J</td><td>Theory</td><td>
    <table><tr><td>CT1/50.00</td><td>PT1/25.00</td></tr>
           <tr><td>41.00</td><td>Abs</td></tr></table>
  </td></tr>
  <tr><td>21CSC203P</td><td>Practical</td><td>
    <table><tr><td>Lab Assessment/40.00</td></tr>
           <tr><td>36.50</td></tr></table>
  </td></tr>
</table>`;

describe("attendance scraping", () => {
  it("reads conducted/absent/% by header text", () => {
    expect(api.scrapeAttendance(load(ATTENDANCE_HTML))).toEqual([
      { subject_code: "21CSC201J", conducted: 45, absent: 6, percentage: 86.67 },
      { subject_code: "21CSC203P", conducted: 30, absent: 9, percentage: 70 },
    ]);
  });

  it("survives reordered and renamed columns", () => {
    const rows = api.scrapeAttendance(
      load(`<table>
        <tr><th>Total Hours Absent</th><th>Subject Code</th><th>Max. Hours Conducted</th></tr>
        <tr><td>4</td><td>21MAB204T</td><td>40</td></tr>
      </table>`)
    );
    expect(rows).toEqual([
      { subject_code: "21MAB204T", conducted: 40, absent: 4, percentage: null },
    ]);
  });

  it("ignores tables without the required columns", () => {
    expect(
      api.scrapeAttendance(load(`<table><tr><th>Name</th><th>Value</th></tr>
        <tr><td>Registration</td><td>RA221100</td></tr></table>`))
    ).toEqual([]);
  });

  it("uppercases codes so they match AcadKit subjects", () => {
    const [row] = api.scrapeAttendance(
      load(`<table><tr><th>Course Code</th><th>Hours Conducted</th><th>Hours Absent</th></tr>
        <tr><td> 21csc201j </td><td>10</td><td>0</td></tr></table>`)
    );
    expect(row.subject_code).toBe("21CSC201J");
  });
});

describe("marks scraping", () => {
  it("parses the nested per-test tables, counting Abs as zero", () => {
    expect(api.scrapeMarks(load(MARKS_NESTED_HTML))).toEqual([
      { subject_code: "21CSC201J", label: "CT1", max_marks: 50, marks_obtained: 41, component_type: "CT" },
      { subject_code: "21CSC201J", label: "PT1", max_marks: 25, marks_obtained: 0, component_type: "CT" },
      { subject_code: "21CSC203P", label: "Lab Assessment", max_marks: 40, marks_obtained: 36.5, component_type: "Lab" },
    ]);
  });

  it("does not mistake the attendance table for marks", () => {
    expect(api.scrapeMarks(load(ATTENDANCE_HTML))).toEqual([]);
  });

  it("falls back to flat text when marks aren't in nested tables", () => {
    expect(
      api.scrapeMarks(load(`<table>
        <tr><th>Course Code</th><th>Test Performance</th></tr>
        <tr><td>21CSC201J</td><td>CT1/50.00 44.00 CT2/50.00 39.50</td></tr>
      </table>`))
    ).toEqual([
      { subject_code: "21CSC201J", label: "CT1", max_marks: 50, marks_obtained: 44, component_type: "CT" },
      { subject_code: "21CSC201J", label: "CT2", max_marks: 50, marks_obtained: 39.5, component_type: "CT" },
    ]);
  });

  it("reports nothing rather than guessing when max and obtained run together", () => {
    // "50.0044.00" cannot be split without inventing a decision.
    expect(
      api.scrapeMarks(load(`<table>
        <tr><th>Course Code</th><th>Test Performance</th></tr>
        <tr><td>21CSC201J</td><td>CT1/50.0044.00</td></tr>
      </table>`))
    ).toEqual([]);
  });

  it("finds both reports when they share one page", () => {
    const tables = load(ATTENDANCE_HTML + MARKS_NESTED_HTML);
    expect(api.scrapeAttendance(tables)).toHaveLength(2);
    expect(api.scrapeMarks(tables)).toHaveLength(3);
  });
});

describe("component classification", () => {
  it.each([
    ["CT1", "CT"],
    ["Cycle Test 2", "CT"],
    ["Lab Assessment 1", "Lab"],
    ["Assignment 3", "Assignment"],
    ["Model Exam", "Project"],
    ["Something Else", "CT"],
  ])("%s → %s", (label, expected) => {
    expect(api.classify(label)).toBe(expected);
  });
});

describe("attendance reported as classes attended", () => {
  it("derives absences from a present column", () => {
    expect(
      api.scrapeAttendance(
        load(`<table>
          <tr><th>S.No</th><th>Subject Code</th><th>Total Classes</th><th>Present</th><th>Percentage</th></tr>
          <tr><td>1</td><td>21CSC201J</td><td>45</td><td>39</td><td>86.67</td></tr>
        </table>`)
      )
    ).toEqual([
      { subject_code: "21CSC201J", conducted: 45, absent: 6, percentage: 86.67 },
    ]);
  });

  it("prefers an explicit absent column when both are present", () => {
    const [row] = api.scrapeAttendance(
      load(`<table>
        <tr><th>Course Code</th><th>Hours Conducted</th><th>Hours Present</th><th>Hours Absent</th></tr>
        <tr><td>21CSC201J</td><td>45</td><td>39</td><td>6</td></tr>
      </table>`)
    );
    expect(row).toEqual({ subject_code: "21CSC201J", conducted: 45, absent: 6, percentage: null });
  });

  it("drops rows where present exceeds conducted rather than storing a negative", () => {
    expect(
      api.scrapeAttendance(
        load(`<table>
          <tr><th>Course Code</th><th>Total Classes</th><th>Attended</th></tr>
          <tr><td>21CSC201J</td><td>10</td><td>12</td></tr>
        </table>`)
      )
    ).toEqual([]);
  });

  it("still refuses a table with no absent or present column", () => {
    expect(
      api.scrapeAttendance(
        load(`<table><tr><th>Course Code</th><th>Total Classes</th></tr>
          <tr><td>21CSC201J</td><td>45</td></tr></table>`)
      )
    ).toEqual([]);
  });
});

/**
 * The capture step has to be useful on a portal that doesn't use <table>
 * at all — otherwise a div-based report dumps `tables: []` and tells us
 * only that the parser failed, not what the markup actually is.
 */
describe("diagnostics", () => {
  const dump = (html: string) => {
    document.body.innerHTML = html;
    const found = { docs: [document], blocked: 0 };
    return JSON.parse(api.diagnose(found, api.tables(found.docs)));
  };

  it("describes a div-based report that the table scrapers can't see", () => {
    const out = dump(`<div class="rpt">
      <div class="row"><span>21CSC201J</span><span>45</span><span>6</span></div>
      <div class="row"><span>21CSC203J</span><span>40</span><span>2</span></div>
      <div class="row"><span>21MAB201T</span><span>50</span><span>9</span></div>
    </div>`);

    expect(out.tables).toEqual([]);
    const grid = out.grids.find((g: { rowCount: number }) => g.rowCount === 3);
    expect(grid).toBeTruthy();
    expect(grid.rowSignature).toBe("div.row");
    expect(grid.sample[0]).toEqual(["21CSC201J", "45", "6"]);
  });

  it("records the hash, since the portal routes on it", () => {
    location.hash = "#!/attendance";
    expect(dump("<div></div>").hash).toBe("#!/attendance");
    location.hash = "";
  });

  it("does not report a container whose repetition is really a table's", () => {
    const out = dump(`<div class="wrap">
      <table>
        <tr><th>Course Code</th><th>Hours Conducted</th><th>Hours Absent</th></tr>
        <tr><td>21CSC201J</td><td>45</td><td>6</td></tr>
      </table>
    </div>`);
    expect(out.tables).toHaveLength(1);
    expect(
      out.grids.some((g: { container: string }) => g.container.startsWith("div.wrap"))
    ).toBe(false);
  });
});

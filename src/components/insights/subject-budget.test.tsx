/**
 * @vitest-environment happy-dom
 *
 * A render smoke test for the card that carries the whole feature.
 *
 * The engine is covered in src/lib/plan.test.ts; what this adds is that
 * the numbers actually reach the screen — that the per-component
 * "needed" column is wired to the solve rather than to the old
 * earned-over-entered ratio, and that a result landing rewrites every
 * row beneath it. Rendered to static markup rather than mounted, which
 * is enough to read the numbers out and needs no DOM testing library.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SubjectBudgetCard } from "@/components/insights/subject-budget";
import { buildProjection } from "@/lib/projections";
import type { Mark, Subject } from "@/types";

const SUBJECT: Subject = {
  id: "s1",
  device_id: "1234",
  code: "21CSC201J",
  name: "Data Structures",
  credits: 4,
  type: "theory",
  faculty: null,
  color_hex: "#7c6af7",
  target_grade: "A",
  assessment: {
    internal: 60,
    complete: false,
    components: [
      { key: "as", label: "Assignment", type: "Assignment", max: 5 },
      { key: "c1", label: "CT-1", type: "CT", max: 15 },
      { key: "c2", label: "CT-2", type: "CT", max: 15 },
      { key: "lb", label: "Lab", type: "Lab", max: 10 },
      { key: "md", label: "Model", type: "CT", max: 15 },
    ],
  },
};

let seq = 0;
const mark = (label: string, obtained: number, max: number): Mark => ({
  id: `m${seq++}`,
  device_id: "1234",
  subject_id: "s1",
  component_type: "CT",
  label,
  marks_obtained: obtained,
  max_marks: max,
  is_external: false,
});

/** The card, as the Insights page assembles it. */
function renderFor(subject: Subject, marks: Mark[]): string {
  const report = buildProjection([subject], [], [], marks, []);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <SubjectBudgetCard p={report.gradeProjections[0]} index={0} />
    </QueryClientProvider>
  );
}

const render = (marks: Mark[]) => renderFor(SUBJECT, marks);

/**
 * Strip tags so assertions read against what a person would see. The
 * denominator sits in its own span for styling, so the space the strip
 * leaves behind is closed up: "12 /15" is rendered as "12/15".
 */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+\/\s*/g, "/")
    // React escapes apostrophes in static markup; assertions read better
    // against the copy as written.
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();

describe("SubjectBudgetCard", () => {
  it("shows the split and the target picker", () => {
    const t = text(render([]));
    expect(t).toContain("Data Structures");
    expect(t).toContain("60 internal · 40 end sem");
    expect(t).toContain("0 banked");
    expect(t).toContain("100 to play for");
  });

  it("spreads the target across every component before anything is graded", () => {
    const t = text(render([]));
    expect(t).toContain("71% of every mark this semester");
    // 71% of each component's own marks, rounded up to the next half:
    // 3.55 is displayed as 4 because 3.5 would not actually be enough.
    expect(t).toContain("Assignment 4/5");
    expect(t).toContain("CT-1 11/15");
    expect(t).toContain("Lab 7.5/10");
    expect(t).toContain("End semester 28.5/40");
  });

  it("re-spreads over what's left after a perfect assignment", () => {
    const t = text(render([mark("Assignment", 5, 5)]));
    expect(t).toContain("Assignment 5/5"); // banked, not a requirement
    expect(t).toContain("CT-1 10.5/15");
    expect(t).toContain("CT-2 10.5/15");
    expect(t).toContain("Lab 7/10");
    expect(t).toContain("Model 10.5/15");
    expect(t).toContain("End semester 28/40"); // 27.79, rounded up
  });

  it("overhauls every remaining row after a bad test", () => {
    const t = text(render([mark("Assignment", 5, 5), mark("CT-1", 2, 15)]));
    expect(t).toContain("CT-1 2/15");
    // 64 needed from the 80 left = 80% of everything.
    expect(t).toContain("80%");
    expect(t).toContain("CT-2 12/15");
    expect(t).toContain("Lab 8/10");
    expect(t).toContain("Model 12/15");
    expect(t).toContain("End semester 32/40");
    expect(t).toContain("You're taking 35% so far, so this is a step up.");
  });

  it("says a locked target is locked instead of asking for marks", () => {
    const t = text(
      renderFor({ ...SUBJECT, target_grade: "C" }, [
        mark("Assignment", 5, 5), mark("CT-1", 15, 15), mark("CT-2", 15, 15),
        mark("Lab", 10, 10), mark("Model", 15, 15),
      ])
    );
    expect(t).toContain("C is banked");
    expect(t).toContain("anything");
  });

  it("names the best still reachable when the target is gone", () => {
    const t = text(
      render([
        mark("Assignment", 0, 5), mark("CT-1", 0, 15), mark("CT-2", 0, 15), mark("Lab", 0, 10),
      ])
    );
    expect(t).toContain("Best still reachable is C");
  });

  it("labels the undeclared internal weight rather than hiding it", () => {
    const bare: Subject = { ...SUBJECT, assessment: { internal: 60, complete: false, components: [] } };
    const t = text(renderFor(bare, [mark("Quiz", 4, 5)]));
    expect(t).toContain("Internals not yet announced");
    expect(t).toContain("tbd");
  });
  it("prices each grade in end-sem marks once that is all that's left", () => {
    // The last-week question: internals settled, 40 in play. A share of
    // what's left is technically right and useless — these are marks.
    const t = text(
      render([
        mark("Assignment", 4, 5), mark("CT-1", 11, 15), mark("CT-2", 11, 15),
        mark("Lab", 8, 10), mark("Model", 11, 15),
      ])
    );
    expect(t).toContain("45 banked");
    expect(t).toContain("A+ 36/40");
    expect(t).toContain("A 26/40");
    expect(t).toContain("B+ 16/40");
    expect(t).toContain("C 5/40");
    expect(t).toContain("O —"); // 46 of 40 is gone, and says so
  });

  it("keeps showing a share while several components remain", () => {
    const t = text(render([mark("Assignment", 5, 5)]));
    expect(t).toContain("A 69%"); // 66 of 95
    expect(t).not.toContain("A 66/95");
  });
});

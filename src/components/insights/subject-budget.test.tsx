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
import { MemoryRouter } from "react-router-dom";
import { SubjectBudgetCard } from "@/components/insights/subject-budget";
import { buildProjection } from "@/lib/projections";
import type { AttendanceRecord, Deadline, Mark, Subject, TimetableSlot } from "@/types";

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

interface Extras {
  attendance?: AttendanceRecord[];
  timetable?: TimetableSlot[];
  deadlines?: Deadline[];
}

/** The card, as the Insights page assembles it. */
function renderFor(subject: Subject, marks: Mark[], extras: Extras = {}): string {
  const report = buildProjection(
    [subject],
    extras.attendance ?? [],
    extras.timetable ?? [],
    marks,
    [],
    "2026-09-15",
    { start: "2026-09-01", end: "2026-11-30" },
    8.5,
    extras.deadlines ?? []
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    // The card links to /marks when nothing is graded, so it needs a
    // router the same way it needs a query client.
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <SubjectBudgetCard p={report.gradeProjections[0]} index={0} />
      </QueryClientProvider>
    </MemoryRouter>
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
    // The end-sem row is an editable field, so its number lives in an
    // attribute rather than in text. Surface it before stripping tags,
    // or these assertions would stop checking the thing they exist for.
    .replace(/<input\b[^>]*>/g, (tag) => {
      const value = /\bvalue="([^"]*)"/.exec(tag)?.[1];
      const placeholder = /\bplaceholder="([^"]*)"/.exec(tag)?.[1];
      return ` ${value || placeholder || ""} `;
    })
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
    // Every internal is graded, so the end-sem is all that's pending —
    // and it is asked for nothing.
    expect(t).toContain("End semester 0/40");
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

  it("never prints a total that contradicts the grade next to it", () => {
    // 42.36 banked at a 70.6% pace: the exact value is a B+, but the
    // rounded one reads 71, which is where an A starts.
    const oneBigCT: Subject = {
      ...SUBJECT,
      assessment: {
        internal: 60,
        complete: true,
        components: [{ key: "c", label: "CT-1", type: "CT", max: 60 }],
      },
    };
    const t = text(renderFor(oneBigCT, [mark("CT-1", 42.36, 60)]));
    expect(t).toContain("At your pace 70/100 B+");
    expect(t).not.toContain("71/100 B+");
    // And what is banked is floored too, not rounded up to 42.5.
    expect(t).toContain("42 banked");
  });

  it("leads with attendance when the end-sem is at risk", () => {
    const absences: AttendanceRecord[] = [1, 2, 3, 4].map((i) => ({
      id: `a${i}`,
      device_id: "1234",
      subject_id: "s1",
      date: `2026-09-0${i}`,
      start_time: "08:00:00",
      end_time: "08:50:00",
      status: i === 1 ? "present" : "absent",
    }));
    const slots: TimetableSlot[] = [1, 2, 3, 4, 5].map((day_order) => ({
      id: `t${day_order}`,
      device_id: "1234",
      subject_id: "s1",
      day_order,
      start_time: "08:00:00",
      end_time: "08:50:00",
      room: null,
    }));

    const atRisk = text(renderFor(SUBJECT, [], { attendance: absences, timetable: slots }));
    expect(atRisk).toContain("Attendance is 25%");
    expect(atRisk).toContain("Attend the next 8 classes to clear 75%");

    // With no classes left to recover in, it stops being a warning.
    const barred = text(renderFor(SUBJECT, [], { attendance: absences }));
    expect(barred).toContain("cannot reach 75%");
    expect(barred).toContain("this plan assumes you can sit it");
  });

  it("says nothing about attendance when it is fine", () => {
    const present: AttendanceRecord[] = [{
      id: "a1", device_id: "1234", subject_id: "s1", date: "2026-09-01",
      start_time: "08:00:00", end_time: "08:50:00", status: "present",
    }];
    const t = text(renderFor(SUBJECT, [], { attendance: present }));
    expect(t).not.toContain("Attendance is");
  });

  it("dates the components and names what is next", () => {
    const deadlines: Deadline[] = [
      {
        id: "d1", device_id: "1234", subject_id: "s1", title: "CT-2",
        type: "exam", due_date: "2026-10-12T09:00:00.000Z",
        status: "pending", priority: "high", max_marks: 15,
      },
      {
        id: "d2", device_id: "1234", subject_id: "s1", title: "Model",
        type: "exam", due_date: "2026-11-03T09:00:00.000Z",
        status: "pending", priority: "high", max_marks: 15,
      },
    ];
    const t = text(renderFor(SUBJECT, [mark("Assignment", 5, 5)], { deadlines }));
    expect(t).toContain("Next up: CT-2 on 12 Oct");
    expect(t).toContain("CT-2 12 Oct");
    expect(t).toContain("Model 3 Nov");
  });

  it("shows how much your own results swing, once there are enough", () => {
    // 14/15 then 2/15 averages to the same pace as two 8/15s and says
    // something very different about how much to trust it.
    const swingy = text(
      render([mark("Assignment", 5, 5), mark("CT-1", 14, 15), mark("CT-2", 2, 15)])
    );
    expect(swingy).toMatch(/At your pace \d+\/100 \w\+? \d+–\d+/);

    // Two components is not a spread, it is two numbers disagreeing.
    const tooFew = text(render([mark("Assignment", 5, 5), mark("CT-1", 14, 15)]));
    expect(tooFew).not.toMatch(/At your pace \d+\/100 \w\+? \d+–\d+/);
  });

  it("adopts a deadline you logged with marks, without retyping it", () => {
    const quiz: Deadline = {
      id: "d9", device_id: "1234", subject_id: "s1", title: "Surprise quiz",
      type: "other", due_date: "2026-10-20T09:00:00.000Z",
      status: "pending", priority: "low", max_marks: 5,
    };
    const t = text(renderFor(SUBJECT, [], { deadlines: [quiz] }));
    expect(t).toContain("Surprise quiz");
    expect(t).toContain("20 Oct");
    expect(t).toContain("Next up: Surprise quiz on 20 Oct");
  });

  it("shows the end-sem as assumed rather than asked", () => {
    const report = buildProjection(
      [SUBJECT], [], [], [], [],
      "2026-09-15",
      { start: "2026-09-01", end: "2026-11-30" },
      8.5,
      [],
      85
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const t = text(
      renderToStaticMarkup(
        <MemoryRouter>
          <QueryClientProvider client={qc}>
            <SubjectBudgetCard p={report.gradeProjections[0]} index={0} />
          </QueryClientProvider>
        </MemoryRouter>
      )
    );
    expect(t).toContain("End semester assumed 34/40");
    expect(t).toContain("The internals below are carrying whatever the end-sem doesn't");
    // 71 − 34 = 37 across the 60 internal marks.
    expect(t).toContain("CT-1 9.5/15");
  });

  it("does not announce a test that already happened as what's next", () => {
    // Reported from a phone: "Next up: 21MAB201T Exam on 3 Sep" while it
    // was the 7th. The list was sorted by date and never filtered by it.
    const past: Deadline = {
      id: "dp", device_id: "1234", subject_id: "s1", title: "CT-1",
      type: "exam", due_date: "2026-09-03T09:00:00.000Z",
      status: "pending", priority: "high", max_marks: 15,
    };
    const future: Deadline = { ...past, id: "df", title: "CT-2", due_date: "2026-10-12T09:00:00.000Z" };

    const t = text(renderFor(SUBJECT, [], { deadlines: [past, future] }));
    expect(t).toContain("Next up: CT-2 on 12 Oct");
    expect(t).not.toContain("Next up: CT-1");
    // It stays in the budget, marked for what it is.
    expect(t).toContain("CT-1 3 Sept · marks not in"); // Intl renders September as "Sept"
  });

  it("lets you answer the end-sem instead of being asked", () => {
    const withTarget: Subject = {
      ...SUBJECT,
      assessment: { ...SUBJECT.assessment!, assumedExternalPct: 85 },
    };
    const t = text(renderFor(withTarget, []));
    expect(t).toContain("End semester assumed 34/40");
    // 71 − 34 = 37 across the 60 internal marks, not 71 across all 100.
    expect(t).toContain("CT-1 9.5/15");
  });

  it("does not tell you you're failing a subject that hasn't started", () => {
    // Every subject is in this state for the first weeks of a semester,
    // which is exactly when someone opens this page. There is no pace
    // yet, so the pace cell used to report the floor — and the floor of
    // an untouched course is an F.
    const t = text(render([]));
    expect(t).toContain("At your pace — no marks yet");
    expect(t).not.toContain("At your pace 0/100 F");
    expect(t).not.toContain("Banked 0/100 F");
    // The ceiling still means something on day one, and keeps its grade.
    expect(t).toContain("Ace what's left 100/100 O");
  });

  it("offers the thing it is waiting for", () => {
    expect(text(render([]))).toContain("Add a mark");
    // Once something is graded the card has an answer, not a request.
    expect(text(render([mark("Assignment", 5, 5)]))).not.toContain("Add a mark");
  });

  it("puts the grades back as soon as there is something to grade", () => {
    const t = text(render([mark("Assignment", 5, 5)]));
    expect(t).toContain("At your pace 100/100 O");
    expect(t).toContain("Banked 5/100 F");
  });
});

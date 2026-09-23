import { describe, expect, it } from "vitest";
import { deadlineOffers, planOffers, type Suggestion } from "@/lib/suggestions";
import type { Deadline, Subject } from "@/types";

const DSA = { id: "sub-dsa", code: "21CSC201J", name: "Data Structures & Algorithms" } as Subject;
const OS = { id: "sub-os", code: "21CSC202J", name: "Operating Systems" } as Subject;
const NOW = new Date("2026-09-23T12:00:00+05:30").getTime();

let n = 0;
const sug = (p: Partial<Suggestion["payload"]>, status: Suggestion["status"] = "pending"): Suggestion => ({
  id: `s${++n}`,
  device_id: "1234",
  key: `k${n}`,
  kind: "deadline",
  payload: { subject_code: "21CSC201J", type: "exam", due_date: "2026-10-14T09:30:00+05:30", ...p },
  source: "DSA_21CSC201J/06_Notes_from_WhatsApp.pdf",
  evidence: "FJ-2 on 14 Oct",
  status,
});
const dl = (p: Partial<Deadline>) =>
  ({ id: "d", device_id: "1234", status: "pending", priority: "medium", type: "exam", title: "x", subject_id: null, ...p }) as Deadline;

describe("deadlineOffers", () => {
  it("turns a suggestion into the deadline Add would write", () => {
    const [o] = deadlineOffers([sug({ label: "FJ-2", max_marks: 15 })], [], [DSA, OS], NOW);
    expect(o.subject?.id).toBe("sub-dsa");
    expect(o.deadline).toMatchObject({
      title: "FJ-2",
      subject_id: "sub-dsa",
      type: "exam",
      priority: "high",
      max_marks: 15,
      due_date: "2026-10-14T04:00:00.000Z",
    });
  });

  it("derives the title from the course code when no component is named", () => {
    const [o] = deadlineOffers([sug({ type: "lab" })], [], [DSA], NOW);
    expect(o.deadline.title).toBe("21CSC201J Lab");
  });

  it("hides one you already have on that day, whatever time you typed", () => {
    const have = dl({ subject_id: "sub-dsa", title: "FJ-2", due_date: "2026-10-14T03:00:00.000Z" });
    expect(deadlineOffers([sug({ label: "FJ-2" })], [have], [DSA], NOW)).toEqual([]);
  });

  it("still offers a different component on the same day", () => {
    const have = dl({ subject_id: "sub-dsa", title: "FJ-1", due_date: "2026-10-14T03:00:00.000Z" });
    expect(deadlineOffers([sug({ label: "FJ-2" })], [have], [DSA], NOW)).toHaveLength(1);
  });

  it("without a label, matches on type", () => {
    const lab = dl({ subject_id: "sub-dsa", type: "lab", due_date: "2026-10-14T03:00:00.000Z" });
    expect(deadlineOffers([sug({ type: "exam" })], [lab], [DSA], NOW)).toHaveLength(1);
    expect(deadlineOffers([sug({ type: "lab" })], [lab], [DSA], NOW)).toEqual([]);
  });

  it("drops decided, past and undatable suggestions", () => {
    const list = [
      sug({}, "dismissed"),
      sug({}, "accepted"),
      sug({ due_date: "2026-09-20T09:00:00+05:30" }),
      sug({ due_date: "next Friday" }),
    ];
    expect(deadlineOffers(list, [], [DSA], NOW)).toEqual([]);
  });

  it("keeps an unknown course code, unassigned, rather than losing the date", () => {
    const [o] = deadlineOffers([sug({ subject_code: "21XYZ999T" })], [], [DSA], NOW);
    expect(o.subject).toBeNull();
    expect(o.deadline.subject_id).toBeNull();
  });

  it("matches course codes regardless of case and spacing, soonest first", () => {
    const list = [sug({ subject_code: "21csc 202j", due_date: "2026-10-20T09:00:00+05:30" }), sug({})];
    expect(deadlineOffers(list, [], [DSA, OS], NOW).map((o) => o.subject?.id)).toEqual(["sub-dsa", "sub-os"]);
  });
});

describe("planOffers", () => {
  const plan = (components: { label: string; type: "CT" | "Lab" | "Assignment" | "Project"; max: number }[], internal = 60) =>
    ({ ...sug({}), kind: "plan", payload: { subject_code: "21CSC201J", internal, components } }) as unknown as Suggestion;
  const DSA_PLAN = [
    { label: "FJ-I", type: "CT" as const, max: 15 },
    { label: "LLJ-I", type: "Lab" as const, max: 7 },
    { label: "FJ-II", type: "CT" as const, max: 15 },
    { label: "FJ-III", type: "CT" as const, max: 15 },
    { label: "LLJ-II", type: "Project" as const, max: 8 },
  ];

  it("offers a full plan for a subject without one, marked complete", () => {
    const [o] = planOffers([plan(DSA_PLAN)], [DSA]);
    expect(o.fresh).toBe(true);
    expect(o.assessment).toMatchObject({ internal: 60, complete: true });
    expect(o.assessment.components.map((c) => c.label)).toEqual(["FJ-I", "LLJ-I", "FJ-II", "FJ-III", "LLJ-II"]);
  });

  it("is not offered again when the subject already has it, even written FJ-2 not FJ-II", () => {
    const have = {
      ...DSA,
      assessment: {
        internal: 60,
        complete: true,
        components: [
          { key: "a", label: "FJ-1", type: "CT", max: 15 },
          { key: "b", label: "LLJ-1", type: "Lab", max: 7 },
          { key: "c", label: "FJ-2", type: "CT", max: 15 },
          { key: "d", label: "FJ-3", type: "CT", max: 15 },
          { key: "e", label: "LLJ-2", type: "Project", max: 8 },
        ],
      },
    } as Subject;
    expect(planOffers([plan(DSA_PLAN)], [have])).toEqual([]);
  });

  it("keeps existing component keys and the end-sem expectation when it replaces a plan", () => {
    const have = {
      ...DSA,
      assessment: { internal: 60, complete: false, assumedExternalPct: 70, components: [{ key: "keep-me", label: "FJ-1", type: "CT", max: 10 }] },
    } as Subject;
    const [o] = planOffers([plan(DSA_PLAN)], [have]);
    expect(o.fresh).toBe(false);
    expect(o.assessment.components[0].key).toBe("keep-me");
    expect(o.assessment.assumedExternalPct).toBe(70);
  });

  it("skips unknown subjects and nonsense weights", () => {
    expect(planOffers([{ ...plan(DSA_PLAN), payload: { subject_code: "21XYZ", internal: 60, components: DSA_PLAN } } as Suggestion], [DSA])).toEqual([]);
    expect(planOffers([plan(DSA_PLAN, 0)], [DSA])).toEqual([]);
  });

  it("leaves plans out of the deadline offers", () => {
    expect(deadlineOffers([plan(DSA_PLAN)], [], [DSA], NOW)).toEqual([]);
  });
});

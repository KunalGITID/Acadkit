import { describe, expect, it } from "vitest";
import { deadlineOffers, type Suggestion } from "@/lib/suggestions";
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

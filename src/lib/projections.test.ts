import { describe, expect, it } from "vitest";
import { buildProjection, projectSubject } from "@/lib/projections";
import type { AttendanceRecord, Mark, Subject, TimetableSlot } from "@/types";

const subj = (over: Partial<Subject>): Subject => ({
  id: over.id ?? "s1",
  device_id: "p",
  code: over.code ?? "X",
  name: over.name ?? "X",
  credits: over.credits ?? 4,
  type: "theory",
  faculty: null,
  color_hex: "#000",
  ...over,
});

describe("projectSubject", () => {
  it("derives remaining classes, scenarios and actions from the calendar", () => {
    // 5 Day-Order-1 dates; subject has one DO1 slot
    const effMap: Record<string, number> = {
      "2026-07-21": 1,
      "2026-07-28": 1,
      "2026-08-04": 1,
      "2026-08-11": 1,
      "2026-08-18": 1,
    };
    const slot: TimetableSlot = {
      id: "slot1",
      device_id: "p",
      subject_id: "s1",
      day_order: 1,
      start_time: "08:00:00",
      end_time: "08:50:00",
      room: null,
    };
    const recs: AttendanceRecord[] = [
      { id: "1", device_id: "p", subject_id: "s1", date: "2026-07-21", start_time: "08:00:00", end_time: "08:50:00", status: "present" },
      { id: "2", device_id: "p", subject_id: "s1", date: "2026-07-28", start_time: "08:00:00", end_time: "08:50:00", status: "present" },
      { id: "3", device_id: "p", subject_id: "s1", date: "2026-08-04", start_time: "08:00:00", end_time: "08:50:00", status: "absent" },
    ];
    // from 08-05: remaining = 08-11, 08-18 (2 unmarked future)
    const p = projectSubject(subj({ id: "s1" }), recs, [slot], effMap, "2026-08-05");
    expect(p.held).toBe(3);
    expect(p.attended).toBe(2);
    expect(p.remaining).toBe(2);
    expect(p.finalTotal).toBe(5);
    expect(p.bestPct).toBeCloseTo(80, 5); // (2+2)/5
    expect(p.worstPct).toBeCloseTo(40, 5); // 2/5
    expect(p.skipBudget).toBe(0); // floor(2+2 - 0.75*5) = 0
    expect(p.reachable).toBe(true); // best 80 >= 75
    expect(p.mustAttendStreak).toBe(1); // currently 66.7% -> ceil((0.75*3-2)/0.25)=1
  });

  it("flags unreachable when even a perfect finish can't hit 75%", () => {
    const effMap = { "2026-08-11": 1 }; // only 1 future class
    const slot: TimetableSlot = {
      id: "s", device_id: "p", subject_id: "s1", day_order: 1,
      start_time: "08:00:00", end_time: "08:50:00", room: null,
    };
    // 1 present out of 9 held; +1 remaining -> best = 2/10 = 20%
    const recs: AttendanceRecord[] = Array.from({ length: 9 }, (_, i) => ({
      id: String(i), device_id: "p", subject_id: "s1",
      date: `2026-07-${String(i + 1).padStart(2, "0")}`,
      start_time: "07:00:00", end_time: "07:50:00",
      status: i === 0 ? "present" : "absent",
    }));
    const p = projectSubject(subj({ id: "s1" }), recs, [slot], effMap, "2026-08-01");
    expect(p.reachable).toBe(false);
    expect(p.riskLevel).toBe("critical");
  });
});

describe("buildProjection — grade targets", () => {
  it("backsolves end-sem marks needed per grade", () => {
    const subject = subj({ id: "s1", credits: 4 });
    const marks: Mark[] = [
      { id: "m", device_id: "p", subject_id: "s1", component_type: "CT", label: "CT-1", marks_obtained: 12, max_marks: 15, is_external: false },
    ];
    const r = buildProjection([subject], [], [], marks, []);
    const g = r.gradeProjections[0];
    expect(g.internalScaled).toBeCloseTo(48, 5); // 80% of 60
    expect(g.predictedGrade).toBe("A"); // predicted total 80
    expect(g.bestGrade).toBe("A+"); // 48 + 40 = 88
    expect(g.nextGrade?.grade).toBe("A+");
    expect(g.nextGrade?.externalNeeded).toBeCloseTo(33, 5); // 81 - 48
  });
});

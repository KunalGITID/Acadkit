import { describe, expect, it } from "vitest";
import {
  attendanceColor,
  computeOverallAttendance,
  computeSubjectAttendance,
} from "@/lib/attendance";
import type { AttendanceRecord, Subject } from "@/types";

const subj = (id: string): Subject => ({
  id,
  device_id: "p",
  code: id,
  name: id,
  credits: 4,
  type: "theory",
  faculty: null,
  color_hex: "#000",
});

const rec = (subject_id: string, status: AttendanceRecord["status"], i: number): AttendanceRecord => ({
  id: `${subject_id}-${i}`,
  device_id: "p",
  subject_id,
  date: `2026-08-${String(i + 1).padStart(2, "0")}`,
  start_time: "08:00",
  end_time: "08:50",
  status,
});

function many(subject_id: string, present: number, absent: number): AttendanceRecord[] {
  const out: AttendanceRecord[] = [];
  let i = 0;
  for (let p = 0; p < present; p++) out.push(rec(subject_id, "present", i++));
  for (let a = 0; a < absent; a++) out.push(rec(subject_id, "absent", i++));
  return out;
}

describe("attendanceColor", () => {
  it("uses the 75/65 thresholds", () => {
    expect(attendanceColor(80)).toBe("#4ade80");
    expect(attendanceColor(75)).toBe("#4ade80");
    expect(attendanceColor(70)).toBe("#facc15");
    expect(attendanceColor(64)).toBe("#fb7185");
    expect(attendanceColor(null)).toContain("hsl");
  });
});

describe("computeSubjectAttendance", () => {
  it("computes canBunk when comfortably above 75%", () => {
    const s = computeSubjectAttendance(subj("a"), many("a", 7, 1)); // 7/8 = 87.5%
    expect(s.attended).toBe(7);
    expect(s.total).toBe(8);
    expect(s.percentage).toBeCloseTo(87.5, 5);
    expect(s.canBunk).toBe(1); // floor(7/0.75 - 8) = 1
    expect(s.needToAttend).toBe(0);
  });

  it("computes needToAttend when below 75%", () => {
    const s = computeSubjectAttendance(subj("a"), many("a", 2, 4)); // 2/6 = 33%
    expect(s.canBunk).toBe(0);
    // ceil((0.75*6 - 2) / 0.25) = ceil(2.5/0.25) = 10
    expect(s.needToAttend).toBe(10);
  });

  it("ignores cancelled (holiday) classes", () => {
    const recs = [...many("a", 3, 0), rec("a", "holiday", 9)];
    const s = computeSubjectAttendance(subj("a"), recs);
    expect(s.total).toBe(3);
    expect(s.percentage).toBe(100);
  });

  it("handles no records", () => {
    const s = computeSubjectAttendance(subj("a"), []);
    expect(s.percentage).toBeNull();
    expect(s.canBunk).toBe(0);
    expect(s.needToAttend).toBe(0);
  });
});

describe("computeOverallAttendance", () => {
  it("aggregates and flags subjects below 75%", () => {
    const subjects = [subj("a"), subj("b")];
    const records = [...many("a", 8, 0), ...many("b", 2, 4)];
    const o = computeOverallAttendance(subjects, records);
    expect(o.attended).toBe(10);
    expect(o.total).toBe(14);
    expect(o.below75).toHaveLength(1);
    expect(o.below75[0].subject.id).toBe("b");
  });
});

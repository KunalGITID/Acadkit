import { describe, expect, it } from "vitest";
import {
  attendanceColor,
  computeOverallAttendance,
  computeSubjectAttendance,
} from "@/lib/attendance";
import type { AttendanceRecord, PortalSnapshot, Subject } from "@/types";

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

const snap = (
  subject_code: string,
  conducted: number,
  absent: number,
  as_of = "2026-08-20"
): PortalSnapshot => ({
  id: `snap-${subject_code}`,
  device_id: "p",
  subject_code,
  conducted,
  absent,
  percentage: conducted ? ((conducted - absent) / conducted) * 100 : null,
  as_of,
});

const on = (subject_id: string, status: AttendanceRecord["status"], date: string): AttendanceRecord => ({
  id: `${subject_id}-${date}-${status}`,
  device_id: "p",
  subject_id,
  date,
  start_time: "08:00",
  end_time: "08:50",
  status,
});

describe("portal snapshots", () => {
  it("uses the portal totals as the baseline", () => {
    const r = computeSubjectAttendance(subj("A"), [], snap("A", 40, 6));
    expect(r.attended).toBe(34);
    expect(r.total).toBe(40);
    expect(r.percentage).toBeCloseTo(85);
    expect(r.source).toBe("portal");
  });

  it("ignores manual records dated on or before the snapshot, so nothing double-counts", () => {
    const records = [
      on("A", "present", "2026-08-19"),
      on("A", "absent", "2026-08-20"), // the as-of date itself is already included
    ];
    const r = computeSubjectAttendance(subj("A"), records, snap("A", 40, 6));
    expect(r.attended).toBe(34);
    expect(r.total).toBe(40);
  });

  it("layers classes marked after the snapshot on top", () => {
    const records = [
      on("A", "present", "2026-08-21"),
      on("A", "present", "2026-08-22"),
      on("A", "absent", "2026-08-23"),
    ];
    const r = computeSubjectAttendance(subj("A"), records, snap("A", 40, 6));
    expect(r.attended).toBe(36); // 34 + 2 present
    expect(r.total).toBe(43); // 40 + 3 counted
  });

  it("still excludes cancelled classes from the layered total", () => {
    const records = [on("A", "holiday", "2026-08-21"), on("A", "present", "2026-08-22")];
    const r = computeSubjectAttendance(subj("A"), records, snap("A", 40, 6));
    expect(r.total).toBe(41);
    expect(r.attended).toBe(35);
  });

  it("falls back to manual counting when the snapshot has no classes yet", () => {
    const r = computeSubjectAttendance(subj("A"), many("A", 9, 1), snap("A", 0, 0));
    expect(r.source).toBe("manual");
    expect(r.total).toBe(10);
    expect(r.percentage).toBe(90);
  });

  it("keeps the portal's own percentage for cross-checking the parse", () => {
    const r = computeSubjectAttendance(subj("A"), [], snap("A", 40, 6));
    expect(r.portalPercentage).toBeCloseTo(85);
    expect(r.portalAsOf).toBe("2026-08-20");
  });

  it("projects canBunk off the portal baseline", () => {
    // 34/40 = 85%; can drop to 75% after 5 more skips (34/45 = 75.6%).
    expect(computeSubjectAttendance(subj("A"), [], snap("A", 40, 6)).canBunk).toBe(5);
  });

  it("matches snapshots to subjects by code, case-insensitively", () => {
    const s = { ...subj("x1"), code: " 21csc201j " };
    const overall = computeOverallAttendance([s], [], [snap("21CSC201J", 20, 4)]);
    expect(overall.subjects[0].source).toBe("portal");
    expect(overall.attended).toBe(16);
  });

  it("mixes portal-backed and manual-only subjects in the overall total", () => {
    const overall = computeOverallAttendance(
      [subj("A"), subj("B")],
      many("B", 8, 2),
      [snap("A", 20, 0)]
    );
    expect(overall.attended).toBe(28); // 20 portal + 8 manual
    expect(overall.total).toBe(30);
    expect(overall.portalAsOf).toBe("2026-08-20");
  });

  it("reports no portal date when nothing was synced", () => {
    expect(computeOverallAttendance([subj("A")], many("A", 5, 5)).portalAsOf).toBeNull();
  });

  it("uses the oldest snapshot date as the overall as-of", () => {
    const overall = computeOverallAttendance(
      [subj("A"), subj("B")],
      [],
      [snap("A", 10, 0, "2026-08-25"), snap("B", 10, 0, "2026-08-18")]
    );
    expect(overall.portalAsOf).toBe("2026-08-18");
  });
});

import { describe, expect, it } from "vitest";
import { reconcile } from "@/lib/reconcile";
import { computeSubjectAttendance } from "@/lib/attendance";
import type { AttendanceRecord, PortalSnapshot, Subject } from "@/types";

const subject: Subject = {
  id: "A",
  device_id: "p",
  code: "21CSC202J",
  name: "OS",
  credits: 4,
  type: "theory",
  faculty: null,
  color_hex: "#000",
};

const snap = (over: Partial<PortalSnapshot> = {}): PortalSnapshot => ({
  id: "s",
  device_id: "p",
  subject_code: "21CSC202J",
  conducted: 20,
  absent: 4,
  percentage: 80,
  as_of: "2026-08-31",
  ...over,
});

const rec = (
  date: string,
  status: AttendanceRecord["status"],
  start_time = "08:00"
): AttendanceRecord => ({
  id: `${date}-${start_time}`,
  device_id: "p",
  subject_id: "A",
  date,
  start_time,
  end_time: "08:50",
  status,
});

describe("reconcile", () => {
  it("has nothing to explain without a portal baseline", () => {
    expect(reconcile(subject, [rec("2026-09-01", "present")], undefined)).toBeNull();
  });

  it("reports the portal's own figures untouched", () => {
    const r = reconcile(subject, [], snap())!;
    expect(r.portalAttended).toBe(16);
    expect(r.portalConducted).toBe(20);
    expect(r.portalPercentage).toBe(80);
    expect(r.percentage).toBeCloseTo(80);
    expect(r.delta).toBeCloseTo(0);
  });

  it("counts only what was recorded after the snapshot", () => {
    const r = reconcile(
      subject,
      [rec("2026-08-30", "absent"), rec("2026-09-01", "present")],
      snap()
    )!;
    expect(r.sinceCounted).toBe(1);
    expect(r.records).toHaveLength(1);
    expect(r.attended).toBe(17);
    expect(r.conducted).toBe(21);
  });

  it("keeps cancelled classes out of both totals but still tells you about them", () => {
    const r = reconcile(
      subject,
      [rec("2026-09-01", "present"), rec("2026-09-02", "holiday")],
      snap()
    )!;
    expect(r.sinceCounted).toBe(1);
    expect(r.sinceCancelled).toBe(1);
    expect(r.conducted).toBe(21);
  });

  it("treats On Duty as attended, the way the portal does", () => {
    const r = reconcile(subject, [rec("2026-09-01", "od")], snap())!;
    expect(r.sinceAttended).toBe(1);
    expect(r.attended).toBe(17);
  });

  it("shows which direction the recorded classes moved it", () => {
    const dropped = reconcile(subject, [rec("2026-09-01", "absent")], snap())!;
    expect(dropped.delta).toBeLessThan(0);
    const lifted = reconcile(subject, [rec("2026-09-01", "present")], snap())!;
    expect(lifted.delta).toBeGreaterThan(0);
  });

  /**
   * The number this explains has to be the number on screen, or the
   * explanation is its own second opinion.
   */
  it("agrees with computeSubjectAttendance", () => {
    const records = [rec("2026-09-01", "present"), rec("2026-09-02", "absent"), rec("2026-09-03", "od")];
    const r = reconcile(subject, records, snap())!;
    const shown = computeSubjectAttendance(subject, records, snap());
    expect(r.attended).toBe(shown.attended);
    expect(r.conducted).toBe(shown.total);
    expect(r.percentage).toBeCloseTo(shown.percentage!);
  });

  it("lists the classes newest first", () => {
    const r = reconcile(
      subject,
      [rec("2026-09-01", "present"), rec("2026-09-05", "absent")],
      snap()
    )!;
    expect(r.records.map((x) => x.date)).toEqual(["2026-09-05", "2026-09-01"]);
  });
});

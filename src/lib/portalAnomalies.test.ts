import { describe, expect, it } from "vitest";
import { portalAnomalies } from "@/lib/portalAnomalies";
import type { PortalSnapshotHistory, Subject, TimetableSlot } from "@/types";

const OS: Subject = {
  id: "os",
  device_id: "0404",
  code: "21CSC202J",
  name: "Operating Systems",
  credits: 4,
  type: "theory",
  faculty: null,
  color_hex: "#f97316",
};

let n = 0;
function sync(conducted: number, absent: number, asOf: string, percentage: number | null = null): PortalSnapshotHistory {
  n++;
  return {
    id: `h${n}`,
    device_id: "0404",
    subject_code: "21CSC202J",
    conducted,
    absent,
    percentage,
    as_of: asOf,
    synced_at: `${asOf}T12:00:${String(n % 60).padStart(2, "0")}Z`,
    source: "bookmarklet",
  };
}

// OS meets once on Day Order 1; weekdays of two weeks, rotating 1–5.
const TIMETABLE: TimetableSlot[] = [
  { id: "t", device_id: "0404", subject_id: "os", day_order: 1, start_time: "08:00:00", end_time: "08:50:00", room: null },
];
const EFF_MAP: Record<string, number> = {};
["01", "02", "03", "04", "07", "08", "09", "10", "11", "14"].forEach((d, i) => {
  EFF_MAP[`2026-09-${d}`] = (i % 5) + 1;
});

const check = (history: PortalSnapshotHistory[]) =>
  portalAnomalies({ history, subjects: [OS], timetable: TIMETABLE, effMap: EFF_MAP });

describe("portalAnomalies", () => {
  it("is quiet when a sync looks like a normal week", () => {
    expect(check([sync(20, 3, "2026-09-01"), sync(22, 3, "2026-09-14", 86.36)])).toEqual([]);
  });

  it("flags classes held going down", () => {
    const a = check([sync(22, 3, "2026-09-01"), sync(20, 3, "2026-09-14")]);
    expect(a.map((x) => x.kind)).toContain("conducted-down");
    expect(a[0].severity).toBe("warn");
    expect(a[0].subject?.id).toBe("os");
  });

  it("flags more absences than classes held", () => {
    const a = check([sync(20, 3, "2026-09-01"), sync(21, 6, "2026-09-14")]);
    const hit = a.find((x) => x.kind === "impossible");
    expect(hit?.message).toBe("3 absences more, but only 1 class more held — that can't happen.");
  });

  it("mentions absences going down, as information rather than an error", () => {
    const a = check([sync(20, 5, "2026-09-01"), sync(22, 3, "2026-09-14")]);
    expect(a).toEqual([expect.objectContaining({ kind: "absent-down", severity: "info" })]);
  });

  it("checks the portal's percentage against its own counts", () => {
    const a = check([sync(40, 10, "2026-09-14", 65)]);
    expect(a.map((x) => x.kind)).toEqual(["percentage-mismatch"]); // 30/40 is 75%, not 65
    expect(check([sync(40, 10, "2026-09-14", 75)])).toEqual([]);
  });

  it("notices more classes than the timetable scheduled", () => {
    // Between 09-01 and 09-14 OS is scheduled twice (the two Day Order 1s after the 1st).
    const a = check([sync(20, 3, "2026-09-01"), sync(26, 3, "2026-09-14")]);
    expect(a.find((x) => x.kind === "more-than-scheduled")?.message).toContain("only had 1");
  });

  it("spots an absence spike only against enough of your own history", () => {
    const steady = [
      sync(10, 1, "2026-08-01"),
      sync(18, 2, "2026-08-08"),
      sync(26, 3, "2026-08-15"),
      sync(34, 4, "2026-08-22"),
      sync(42, 5, "2026-08-29"),
    ];
    const spike = [...steady, sync(48, 10, "2026-09-05")];
    const flagged = check(spike).find((x) => x.kind === "absence-spike");
    expect(flagged?.message).toBe("You missed 5 of the last 6 classes; you usually miss about 1 in 8.");
    // Three earlier syncs aren't enough to call anything unusual.
    expect(check([...steady.slice(2), sync(48, 10, "2026-09-05")]).some((x) => x.kind === "absence-spike")).toBe(false);
  });

  it("judges only the latest sync", () => {
    const a = check([sync(22, 3, "2026-09-01"), sync(20, 3, "2026-09-07"), sync(22, 3, "2026-09-14")]);
    expect(a.some((x) => x.kind === "conducted-down")).toBe(false);
  });
});

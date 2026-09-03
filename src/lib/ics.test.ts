import { describe, expect, it } from "vitest";
import { buildIcs, countEvents } from "@/lib/ics";
import type { Subject, TimetableSlot } from "@/types";

const SUBJECTS: Subject[] = [
  {
    id: "dsa",
    device_id: "1234",
    code: "21CSC201J",
    name: "Data Structures & Algorithms",
    credits: 4,
    type: "theory",
    faculty: null,
    color_hex: "#7c6af7",
  },
  {
    id: "os",
    device_id: "1234",
    code: "21CSC202J",
    // Deliberately awkward: a comma and a semicolon must be escaped.
    name: "Operating Systems, Advanced; Part II",
    credits: 4,
    type: "theory",
    faculty: null,
    color_hex: "#f97316",
  },
];

const TIMETABLE: TimetableSlot[] = [
  {
    id: "s1",
    device_id: "1234",
    subject_id: "dsa",
    day_order: 1,
    start_time: "09:00:00",
    end_time: "09:50:00",
    room: "TP-1101",
  },
  {
    id: "s2",
    device_id: "1234",
    subject_id: "os",
    day_order: 2,
    start_time: "11:00:00",
    end_time: "11:50:00",
    room: null,
  },
];

const EFF_MAP = { "2026-09-01": 1, "2026-09-02": 2, "2026-09-03": 1 };

const ics = buildIcs({ subjects: SUBJECTS, timetable: TIMETABLE, effMap: EFF_MAP });

describe("buildIcs", () => {
  it("wraps events in a valid calendar envelope", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("VERSION:2.0");
  });

  it("emits one event per class occurrence, not one per slot", () => {
    // Day order 1 falls twice, day order 2 once.
    expect(countEvents(ics)).toBe(3);
  });

  it("uses CRLF line endings throughout", () => {
    const bare = ics.split("\r\n").filter((l) => l.includes("BEGIN:VEVENT"));
    expect(bare).toHaveLength(3);
    expect(ics.split("\n").every((l) => l === "" || l.endsWith("\r"))).toBe(true);
  });

  it("writes local times with a timezone", () => {
    expect(ics).toContain("DTSTART;TZID=Asia/Kolkata:20260901T090000");
    expect(ics).toContain("DTEND;TZID=Asia/Kolkata:20260901T095000");
  });

  it("escapes commas and semicolons in the summary", () => {
    expect(ics).toContain("Operating Systems\\, Advanced\\; Part II");
  });

  it("omits LOCATION when there's no room", () => {
    const osEvent = ics.slice(ics.indexOf("UID:os-"));
    expect(osEvent.slice(0, osEvent.indexOf("END:VEVENT"))).not.toContain("LOCATION");
  });

  it("includes the room when there is one", () => {
    expect(ics).toContain("LOCATION:TP-1101");
  });

  it("gives the same class the same UID across exports", () => {
    const again = buildIcs({ subjects: SUBJECTS, timetable: TIMETABLE, effMap: EFF_MAP });
    expect(again).toBe(ics);
    expect(ics).toContain("UID:dsa-2026-09-01-090000@acadkit");
  });

  it("honours `from` so past classes can be left out", () => {
    const future = buildIcs({
      subjects: SUBJECTS,
      timetable: TIMETABLE,
      effMap: EFF_MAP,
      from: "2026-09-02",
    });
    expect(countEvents(future)).toBe(2);
    expect(future).not.toContain("20260901T090000");
  });

  it("skips slots whose subject no longer exists", () => {
    const orphaned = buildIcs({
      subjects: [SUBJECTS[0]],
      timetable: TIMETABLE,
      effMap: EFF_MAP,
    });
    expect(countEvents(orphaned)).toBe(2); // the two dsa occurrences
  });

  it("produces an empty but valid calendar with no timetable", () => {
    const empty = buildIcs({ subjects: SUBJECTS, timetable: [], effMap: EFF_MAP });
    expect(countEvents(empty)).toBe(0);
    expect(empty).toContain("END:VCALENDAR");
  });

  it("folds lines longer than 75 octets", () => {
    const longName: Subject = { ...SUBJECTS[0], name: "X".repeat(200) };
    const folded = buildIcs({
      subjects: [longName],
      timetable: [TIMETABLE[0]],
      effMap: { "2026-09-01": 1 },
    });
    for (const line of folded.split("\r\n")) {
      expect(line.length).toBeLessThanOrEqual(75);
    }
  });
});

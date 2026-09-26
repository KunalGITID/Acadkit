import { describe, expect, it } from "vitest";
import {
  evenSplit,
  formatMinutes,
  studyDays,
  studyPromptDate,
  studyStreak,
  studyTotals,
} from "@/lib/studyLog";
import type { StudyLogEntry } from "@/types";

const row = (date: string, subject_id: string | null, minutes: number): StudyLogEntry => ({
  id: `${date}-${subject_id}`,
  device_id: "1234",
  date,
  subject_id,
  minutes,
});
const at = (iso: string, hour: number) => new Date(`${iso}T${String(hour).padStart(2, "0")}:00:00`);

describe("studyPromptDate", () => {
  it("asks about today in the evening, until it's answered", () => {
    expect(studyPromptDate([], at("2026-09-26", 19))).toEqual({ date: "2026-09-26", which: "today" });
    expect(studyPromptDate([row("2026-09-26", null, 0)], at("2026-09-26", 19))).toBeNull();
  });

  it("asks about yesterday earlier in the day, if it was missed", () => {
    expect(studyPromptDate([], at("2026-09-26", 9))).toEqual({ date: "2026-09-25", which: "yesterday" });
    expect(studyPromptDate([row("2026-09-25", "os", 60)], at("2026-09-26", 9))).toBeNull();
  });

  it("respects Later", () => {
    expect(studyPromptDate([], at("2026-09-26", 20), new Set(["2026-09-26"]))).toBeNull();
  });
});

describe("evenSplit", () => {
  it("splits 2h across two subjects as an hour each", () => {
    expect(evenSplit(120, 2)).toEqual([60, 60]);
  });

  it("keeps quarter hours and always adds back up", () => {
    const split = evenSplit(100, 3);
    expect(split.reduce((a, b) => a + b, 0)).toBe(100);
    expect(split.slice(1).every((m) => m % 15 === 0)).toBe(true);
  });
});

describe("summaries", () => {
  const log = [
    row("2026-09-26", "os", 60),
    row("2026-09-26", "aoop", 60),
    row("2026-09-25", null, 0),
    row("2026-09-24", "os", 90),
  ];

  it("groups by day, newest first, a rest day kept at zero", () => {
    const days = studyDays(log);
    expect(days.map((d) => [d.date, d.total])).toEqual([
      ["2026-09-26", 120],
      ["2026-09-25", 0],
      ["2026-09-24", 90],
    ]);
    expect(days[1].bySubject).toEqual([]);
  });

  it("totals per subject", () => {
    expect(studyTotals(log)).toEqual([
      { subject_id: "os", minutes: 150 },
      { subject_id: "aoop", minutes: 60 },
    ]);
  });

  it("counts a streak of study days; a logged rest day breaks it", () => {
    expect(studyStreak(log, at("2026-09-26", 21))).toBe(1);
    expect(studyStreak([row("2026-09-25", "os", 30), row("2026-09-24", "os", 30)], at("2026-09-26", 9))).toBe(2);
  });

  it("formats minutes", () => {
    expect([formatMinutes(45), formatMinutes(120), formatMinutes(90)]).toEqual(["45m", "2h", "1h 30m"]);
  });
});

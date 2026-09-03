import type { Subject, TimetableSlot } from "@/types";

/**
 * Timetable → iCalendar.
 *
 * A day-order rotation can't be expressed as a weekly RRULE — Day 1 is
 * whatever working day comes next, so it drifts across holidays. Every
 * class therefore gets its own VEVENT on its own date, which is verbose
 * but exactly right, and lets declared holidays simply not appear.
 *
 * The file is a snapshot: importing it again after the timetable changes
 * would duplicate events, so UIDs are derived from the class itself
 * (subject + date + time). A calendar that honours UID will update in
 * place rather than double up.
 */

const TZID = "Asia/Kolkata";

/** Escape per RFC 5545: backslash, semicolon, comma, newline. */
function esc(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** RFC 5545 caps lines at 75 octets; continuations start with a space. */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    parts.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest) parts.push(" " + rest);
  return parts.join("\r\n");
}

/** "2026-09-03" + "09:00:00" → "20260903T090000" (floating, with TZID). */
function stamp(date: string, time: string): string {
  return `${date.replace(/-/g, "")}T${time.replace(/:/g, "").slice(0, 6)}`;
}

/**
 * A stable, filename-safe UID. Same class, same UID, across exports —
 * so re-importing updates rather than duplicates.
 */
function uid(subjectId: string, date: string, start: string): string {
  return `${subjectId}-${date}-${start.replace(/:/g, "")}@acadkit`.replace(
    /[^A-Za-z0-9@.-]/g,
    ""
  );
}

export interface IcsOptions {
  subjects: Subject[];
  timetable: TimetableSlot[];
  /** Effective date → day order, declared holidays already removed. */
  effMap: Record<string, number>;
  /** Only emit classes on/after this date; defaults to the whole map. */
  from?: string;
}

export function buildIcs({ subjects, timetable, effMap, from }: IcsOptions): string {
  const byId = new Map(subjects.map((s) => [s.id, s]));
  const slotsByDayOrder = new Map<number, TimetableSlot[]>();
  for (const slot of timetable) {
    const list = slotsByDayOrder.get(slot.day_order) ?? [];
    list.push(slot);
    slotsByDayOrder.set(slot.day_order, list);
  }

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AcadKit//Timetable//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:AcadKit Timetable",
    `X-WR-TIMEZONE:${TZID}`,
  ];

  const dates = Object.keys(effMap)
    .filter((d) => !from || d >= from)
    .sort();

  for (const date of dates) {
    const slots = [...(slotsByDayOrder.get(effMap[date]) ?? [])].sort((a, b) =>
      a.start_time.localeCompare(b.start_time)
    );
    for (const slot of slots) {
      const subject = byId.get(slot.subject_id);
      if (!subject) continue;
      lines.push(
        "BEGIN:VEVENT",
        `UID:${uid(slot.subject_id, date, slot.start_time)}`,
        `DTSTART;TZID=${TZID}:${stamp(date, slot.start_time)}`,
        `DTEND;TZID=${TZID}:${stamp(date, slot.end_time)}`,
        fold(`SUMMARY:${esc(subject.name)}`),
        fold(`DESCRIPTION:${esc(`${subject.code} · Day Order ${effMap[date]}`)}`),
        ...(slot.room ? [fold(`LOCATION:${esc(slot.room)}`)] : []),
        "END:VEVENT"
      );
    }
  }

  lines.push("END:VCALENDAR");
  // RFC 5545 wants CRLF and a trailing break.
  return lines.join("\r\n") + "\r\n";
}

/** Number of VEVENTs in a calendar — used to report what was exported. */
export function countEvents(ics: string): number {
  return (ics.match(/BEGIN:VEVENT/g) ?? []).length;
}

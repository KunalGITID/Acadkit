import {
  diagnose,
  scrapeAttendance,
  scrapeMarks,
  tablesIn,
  type PortalAttendanceRow,
  type PortalMarkRow,
} from "@/lib/portal/parse";
import {
  scrapeTimetable,
  type ParsedTimetable,
  type TimetableScrapeOptions,
} from "@/lib/portal/timetable";

/** Reading the portal from a phone. */

export interface PastedPortal {
  attendance: PortalAttendanceRow[];
  marks: PortalMarkRow[];
  /** The week, when what was pasted was the timetable page. */
  timetable: ParsedTimetable;
  /** Tables found in the pasted markup, whether or not any parsed. */
  tablesSeen: number;
  /**
   * A dump of what was actually there, set only when nothing parsed.
   * "Found nothing" is a dead end; naming the containers that *were*
   * present is how the parser gets taught a page it doesn't know.
   */
  diagnostic: string | null;
}

/** True when the clipboard gave us markup rather than flattened text. */
export function looksLikeHtml(input: string): boolean {
  return /<\s*(table|tr|td|div|span|body|html)\b/i.test(input);
}

export function parsePastedPortal(
  html: string,
  /** Your subjects and hours - without codes, a grid can't be read. */
  timetableOptions: TimetableScrapeOptions = { codes: [] }
): PastedPortal {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const tables = tablesIn([doc]);

  const attendance = scrapeAttendance(tables);
  const marks = scrapeMarks(tables);
  const timetable = scrapeTimetable(tables, timetableOptions);

  const found = attendance.length > 0 || marks.length > 0 || timetable.slots.length > 0;
  return {
    attendance,
    marks,
    timetable,
    tablesSeen: tables.length,
    diagnostic: found
      ? null
      : diagnose([doc], tables, {
          url: "pasted",
          hash: "",
          title: doc.title || "",
          documents: 1,
          blockedFrames: 0,
        }),
  };
}

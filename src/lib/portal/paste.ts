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

/**
 * Reading the portal from a phone.
 *
 * The bookmarklet only runs on a desktop browser, which is not the
 * device anyone carries, so the thing that keeps attendance honest was
 * unreachable exactly when it mattered. This takes the other route:
 * open the portal in Safari, select all, copy, paste here. A rich copy
 * puts `text/html` on the clipboard, which is markup the existing
 * parser already understands — no second parser, no OCR, no new
 * credentials, and the portal password is still never involved.
 *
 * What it can and can't reach is worth being straight about. The
 * attendance report is one table and pastes cleanly. Academia's marks
 * report is also one table and works. sp.srmist.edu.in hides its
 * per-component marks behind a modal per subject, so a paste of the
 * summary page yields no marks at all — that is a real limit, and the
 * result says so rather than reporting success with an empty list.
 *
 * The timetable page goes through here too, which is why this takes
 * your subject codes: the grid is matched against subjects you already
 * have, so a paste can schedule classes but never invent a course.
 */

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
  /** Your subjects and hours — without codes, a grid can't be read. */
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

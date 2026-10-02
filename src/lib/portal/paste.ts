import {
  diagnose,
  scrapeAttendance,
  scrapeMarks,
  tablesIn,
  type PortalAttendanceRow,
  type PortalMarkRow,
} from "@/lib/portal/parse";
import {
  parseMarksText,
  scrapeMarkTotals,
  scrapePopups,
  type PortalMarkTotal,
} from "@/lib/portal/marksPaste";
import {
  scrapeTimetable,
  type ParsedTimetable,
  type TimetableScrapeOptions,
} from "@/lib/portal/timetable";

/** Reading the portal from a phone. */

export interface PastedPortal {
  attendance: PortalAttendanceRow[];
  marks: PortalMarkRow[];
  /** Marks from a "View Details" popup pasted without its title: which subject is asked. */
  uncodedMarks: PortalMarkRow[];
  /** Per-subject totals, when the marks summary page was pasted. */
  markTotals: PortalMarkTotal[];
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
  const popups = scrapePopups(doc, tables);
  const marks = [...scrapeMarks(tables), ...popups.marks];
  const markTotals = scrapeMarkTotals(tables);
  const timetable = scrapeTimetable(tables, timetableOptions);

  const found =
    attendance.length > 0 || marks.length > 0 || popups.uncoded.length > 0 ||
    markTotals.length > 0 || timetable.slots.length > 0;
  return {
    attendance,
    marks,
    uncodedMarks: popups.uncoded,
    markTotals,
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

/**
 * A plain-text paste: what an iPhone's clipboard usually holds, and what
 * the "Copy all marks" bookmarklet writes. Only marks can be read this way.
 */
export function parsePastedText(text: string): PastedPortal {
  const m = parseMarksText(text);
  return {
    attendance: [],
    marks: m.marks,
    uncodedMarks: m.uncoded,
    markTotals: m.totals,
    timetable: { slots: [], dayOrders: [], assumedTimes: false, unknownCodes: [] },
    tablesSeen: 0,
    diagnostic: null,
  };
}

import { cellsOf, headersOf, low, norm, rowsOf } from "@/lib/portal/parse";
import type { SubjectType } from "@/types";

/** The timetable grid, read off a pasted portal page. */

export interface Period {
  start: string; // "HH:MM"
  end: string;
}

export interface ParsedSlot {
  subject_code: string;
  day_order: number;
  start_time: string;
  end_time: string;
  slot_type: SubjectType;
  room: string | null;
}

export interface ParsedTimetable {
  slots: ParsedSlot[];
  /** Day orders the grid actually covered. */
  dayOrders: number[];
  /** True when the standard hours stood in for times the grid omitted. */
  assumedTimes: boolean;
  /** Course codes that appeared in the grid but aren't subjects you have. */
  unknownCodes: string[];
}

/** Fifty-minute hours from 8:00, back to back. */
export const STANDARD_PERIODS: Period[] = Array.from({ length: 9 }, (_, i) => {
  const from = 8 * 60 + i * 50;
  const to = from + 50;
  const hhmm = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return { start: hhmm(from), end: hhmm(to) };
});

/** "08:00 - 08:50", "8:00–8:50", "08:00 to 08:50" → a period. */
function timeRange(text: string): Period | null {
  const m = norm(text).match(/(\d{1,2}):(\d{2})\s*(?:-|–|—|to)\s*(\d{1,2}):(\d{2})/i);
  if (!m) return null;
  const pad = (h: string, mm: string) => `${h.padStart(2, "0")}:${mm}`;
  return { start: pad(m[1], m[2]), end: pad(m[3], m[4]) };
}

/** A header cell that names a period without timing it: "Hour 3", "P3", "3". */
function periodOrdinal(text: string): number | null {
  const m = low(text).match(/^(?:hour|period|hr|p)?\s*(\d{1,2})$/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 12 ? n : null;
}

/** "Day 3", "Day Order 3", "DO3", or a bare "3". */
function dayOrderOf(text: string): number | null {
  const t = low(text);
  const m = t.match(/^(?:day\s*(?:order)?\s*|do\s*)?(\d)$/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 5 ? n : null;
}

/** The subject a cell names, if it is one of yours. */
function codeIn(text: string, codes: string[]): string | null {
  const flat = norm(text).toUpperCase();
  for (const code of codes) {
    const re = new RegExp(`(?:^|[^A-Z0-9])${code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^A-Z0-9]|$)`);
    if (re.test(flat)) return code;
  }
  return null;
}

/** Bracketed text is a room on these grids: "21CSC202J (TP301)". */
function roomIn(text: string): string | null {
  const m = norm(text).match(/\(([^)]{1,24})\)/);
  if (!m) return null;
  const room = norm(m[1]);
  // A bracketed "(Lab)" is a kind of class, not a place.
  return room && !/^(lab|theory|practical)$/i.test(room) ? room : null;
}

const RE_LAB = /\blab\b|practical|\bprac\b/i;

/** Which columns of a table are periods, and when they run. */
function periodColumns(
  table: Element,
  fallback: Period[]
): { columns: Array<{ index: number; period: Period }>; assumed: boolean } | null {
  const hs = headersOf(table);
  const timed: Array<{ index: number; period: Period }> = [];
  const ordinals: Array<{ index: number; ordinal: number }> = [];

  hs.forEach((h, i) => {
    const range = timeRange(h);
    if (range) {
      timed.push({ index: i, period: range });
      return;
    }
    const ord = periodOrdinal(h);
    if (ord !== null) ordinals.push({ index: i, ordinal: ord });
  });

  if (timed.length >= 3) return { columns: timed, assumed: false };
  if (ordinals.length < 3) return null;

  // Numbered but untimed: the nth period is the nth thing we know about.
  const columns = ordinals
    .map(({ index, ordinal }) => ({ index, period: fallback[ordinal - 1] }))
    .filter((c): c is { index: number; period: Period } => c.period !== undefined);
  return columns.length >= 3 ? { columns, assumed: true } : null;
}

export interface TimetableScrapeOptions {
  /** Your subject codes. A cell naming none of these is not a class. */
  codes: string[];
  /**
   * Period times to fall back on when the grid doesn't print them -
   * normally the distinct periods already in your timetable, which are
   * the real ones for your campus and hour pattern.
   */
  periods?: Period[];
}

export function scrapeTimetable(
  all: Element[],
  { codes, periods }: TimetableScrapeOptions
): ParsedTimetable {
  const known = [...codes].map((c) => c.trim().toUpperCase()).filter(Boolean);
  // Longest first so a code containing another can't be shadowed.
  known.sort((a, b) => b.length - a.length);
  const fallback = periods?.length ? periods : STANDARD_PERIODS;

  const empty: ParsedTimetable = {
    slots: [],
    dayOrders: [],
    assumedTimes: false,
    unknownCodes: [],
  };
  if (!known.length) return empty;

  for (const table of all) {
    const grid = periodColumns(table, fallback);
    if (!grid) continue;

    const slots: ParsedSlot[] = [];
    const days = new Set<number>();
    const unknown = new Set<string>();
    const firstPeriodCol = Math.min(...grid.columns.map((c) => c.index));

    for (const row of rowsOf(table)) {
      const cells = cellsOf(row);
      if (!cells.length) continue;

      // The day order lives in a cell to the left of the grid - which
      // column varies, so the leftmost one that reads as a day wins.
      let dayOrder: number | null = null;
      for (let i = 0; i < Math.max(firstPeriodCol, 1) && i < cells.length; i++) {
        dayOrder = dayOrderOf(cells[i].textContent ?? "");
        if (dayOrder !== null) break;
      }
      if (dayOrder === null) continue;

      for (const { index, period } of grid.columns) {
        const cell = cells[index];
        if (!cell) continue;
        const text = norm(cell.textContent);
        if (!text) continue;

        const code = codeIn(text, known);
        if (!code) {
          // Something is scheduled here and we can't say what. Only
          // worth reporting if it looks like a code rather than prose.
          const maybe = text.toUpperCase().match(/\b\d{2}[A-Z]{2,4}\d{3}[A-Z]?\b/);
          if (maybe) unknown.add(maybe[0]);
          continue;
        }

        days.add(dayOrder);
        slots.push({
          subject_code: code,
          day_order: dayOrder,
          start_time: period.start,
          end_time: period.end,
          slot_type: RE_LAB.test(text) ? "lab" : "theory",
          room: roomIn(text),
        });
      }
    }

    if (slots.length) {
      return {
        slots: dedupe(slots),
        dayOrders: [...days].sort((a, b) => a - b),
        assumedTimes: grid.assumed,
        unknownCodes: [...unknown],
      };
    }
  }

  return empty;
}

/**
 * One class per (day order, start time). A grid that spans a lab across
 * merged cells can repeat itself, and a duplicate slot would be counted
 * twice by everything downstream - attendance projections included.
 */
function dedupe(slots: ParsedSlot[]): ParsedSlot[] {
  const seen = new Map<string, ParsedSlot>();
  for (const s of slots) {
    const key = `${s.day_order}|${s.start_time}`;
    if (!seen.has(key)) seen.set(key, s);
  }
  return [...seen.values()].sort(
    (a, b) => a.day_order - b.day_order || a.start_time.localeCompare(b.start_time)
  );
}

/** The distinct periods a timetable already uses, earliest first. */
export function periodsFromSlots(
  slots: Array<{ start_time: string; end_time: string }>
): Period[] {
  const seen = new Map<string, Period>();
  for (const s of slots) {
    const start = s.start_time.slice(0, 5);
    if (!seen.has(start)) seen.set(start, { start, end: s.end_time.slice(0, 5) });
  }
  return [...seen.values()].sort((a, b) => a.start.localeCompare(b.start));
}

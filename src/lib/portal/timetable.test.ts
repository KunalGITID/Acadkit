/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import {
  periodsFromSlots,
  scrapeTimetable,
  STANDARD_PERIODS,
  type ParsedSlot,
} from "@/lib/portal/timetable";

const CODES = ["21CSC201J", "21CSC202J", "21MAB201T", "21CSS202T"];

function tables(html: string): Element[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return [...doc.querySelectorAll("table")];
}

/** A grid that prints its own hours, which is the good case. */
const TIMED = `<table>
  <thead><tr>
    <th>Day</th><th>08:00 - 08:50</th><th>08:50 - 09:40</th><th>09:40 - 10:30</th><th>10:30 - 11:20</th>
  </tr></thead>
  <tbody>
    <tr><td>Day 1</td><td>21CSC201J</td><td>21MAB201T</td><td></td><td>21CSS202T (TP301)</td></tr>
    <tr><td>Day 2</td><td>21CSC202J Lab</td><td>21CSC202J Lab</td><td>21MAB201T</td><td>-</td></tr>
  </tbody>
</table>`;

describe("scrapeTimetable", () => {
  it("reads a day-order grid that prints its hours", () => {
    const out = scrapeTimetable(tables(TIMED), { codes: CODES });
    expect(out.assumedTimes).toBe(false);
    expect(out.dayOrders).toEqual([1, 2]);
    expect(out.slots).toHaveLength(6);
    expect(out.slots[0]).toEqual<ParsedSlot>({
      subject_code: "21CSC201J",
      day_order: 1,
      start_time: "08:00",
      end_time: "08:50",
      slot_type: "theory",
      room: null,
    });
  });

  it("keeps a lab as a lab, and both of its periods", () => {
    const out = scrapeTimetable(tables(TIMED), { codes: CODES });
    const labs = out.slots.filter((s) => s.slot_type === "lab");
    expect(labs.map((s) => s.start_time)).toEqual(["08:00", "08:50"]);
    expect(labs.every((s) => s.day_order === 2)).toBe(true);
  });

  it("takes a room out of the brackets, but not the word Lab", () => {
    const out = scrapeTimetable(tables(TIMED), { codes: CODES });
    expect(out.slots.find((s) => s.subject_code === "21CSS202T")?.room).toBe("TP301");
    const bracketLab = scrapeTimetable(
      tables(TIMED.replace("21CSC202J Lab", "21CSC202J (Lab)")),
      { codes: CODES }
    );
    expect(bracketLab.slots.find((s) => s.day_order === 2)?.room).toBeNull();
  });

  /**
   * The rule that makes an import safe to run: your subject list is the
   * authority, so a stray code in a legend or a footer can never become
   * a class, and nothing invents a subject you don't have.
   */
  it("only schedules subjects you already have, and names the ones you don't", () => {
    const out = scrapeTimetable(tables(TIMED), { codes: ["21CSC201J"] });
    expect(out.slots.every((s) => s.subject_code === "21CSC201J")).toBe(true);
    expect(out.unknownCodes).toContain("21MAB201T");
    expect(out.unknownCodes).toContain("21CSC202J");
  });

  it("finds nothing at all when you have no subjects to match against", () => {
    expect(scrapeTimetable(tables(TIMED), { codes: [] }).slots).toEqual([]);
  });

  it("falls back to your own periods when the grid only numbers its hours", () => {
    const numbered = `<table>
      <thead><tr><th>Day Order</th><th>Hour 1</th><th>Hour 2</th><th>Hour 3</th></tr></thead>
      <tbody><tr><td>3</td><td>21CSC201J</td><td>21CSC201J</td><td>21MAB201T</td></tr></tbody>
    </table>`;
    const mine = [
      { start_time: "09:00:00", end_time: "09:50:00" },
      { start_time: "10:00:00", end_time: "10:50:00" },
      { start_time: "11:00:00", end_time: "11:50:00" },
    ];
    const out = scrapeTimetable(tables(numbered), {
      codes: CODES,
      periods: periodsFromSlots(mine),
    });
    expect(out.assumedTimes).toBe(true);
    expect(out.slots.map((s) => s.start_time)).toEqual(["09:00", "10:00", "11:00"]);
    expect(out.slots.every((s) => s.day_order === 3)).toBe(true);
  });

  it("uses the standard hours only as a last resort, and says it did", () => {
    const numbered = `<table>
      <thead><tr><th>Day</th><th>1</th><th>2</th><th>3</th></tr></thead>
      <tbody><tr><td>Day 4</td><td>21CSC201J</td><td></td><td>21MAB201T</td></tr></tbody>
    </table>`;
    const out = scrapeTimetable(tables(numbered), { codes: CODES });
    expect(out.assumedTimes).toBe(true);
    expect(out.slots[0].start_time).toBe(STANDARD_PERIODS[0].start);
    expect(out.slots[1].start_time).toBe(STANDARD_PERIODS[2].start);
  });

  it("ignores a table that isn't a grid", () => {
    const report = `<table><thead><tr><th>Code</th><th>Conducted</th><th>Absent</th></tr></thead>
      <tbody><tr><td>21CSC201J</td><td>45</td><td>6</td></tr></tbody></table>`;
    expect(scrapeTimetable(tables(report), { codes: CODES }).slots).toEqual([]);
  });

  it("ignores rows that name no day order", () => {
    const withJunk = TIMED.replace("<td>Day 1</td>", "<td>Total</td>");
    const out = scrapeTimetable(tables(withJunk), { codes: CODES });
    expect(out.dayOrders).toEqual([2]);
  });

  /**
   * A merged lab spanning two columns can repeat its code; counting it
   * twice would inflate every attendance projection built on the slot.
   */
  it("keeps one class per period however often the grid repeats it", () => {
    const repeated = `<table>
      <thead><tr><th>Day</th><th>08:00 - 08:50</th><th>08:00 - 08:50</th><th>08:50 - 09:40</th></tr></thead>
      <tbody><tr><td>Day 1</td><td>21CSC201J</td><td>21CSC201J</td><td>21MAB201T</td></tr></tbody>
    </table>`;
    const out = scrapeTimetable(tables(repeated), { codes: CODES });
    expect(out.slots).toHaveLength(2);
  });

  it("is empty, not broken, on markup with no tables", () => {
    const out = scrapeTimetable(tables("<div>nothing here</div>"), { codes: CODES });
    expect(out).toEqual({ slots: [], dayOrders: [], assumedTimes: false, unknownCodes: [] });
  });
});

describe("periodsFromSlots", () => {
  it("collapses a week of classes to the distinct hours behind them", () => {
    expect(
      periodsFromSlots([
        { start_time: "10:00:00", end_time: "10:50:00" },
        { start_time: "08:00:00", end_time: "08:50:00" },
        { start_time: "10:00:00", end_time: "10:50:00" },
      ])
    ).toEqual([
      { start: "08:00", end: "08:50" },
      { start: "10:00", end: "10:50" },
    ]);
  });
});

import { timeToMinutes, toISODate, addDays } from "@/lib/dates";
import type { PrepWindow } from "@/lib/prep";

/**
 * A study plan: which free hours to spend on which upcoming test.
 *
 * The app already knows the free periods between your classes
 * (src/lib/prep.ts), what each test is worth, and roughly how well you
 * do in each subject (src/lib/odds.ts). This spends that time where it
 * buys the most.
 *
 * **The model, stated so it can be argued with.** Studying h hours for a
 * test closes part of the gap between what you'd score anyway and full
 * marks, with diminishing returns:
 *
 *     gain(h) = stake · (1 − ability) · (1 − e^(−h/τ)),  τ = max(1, stake/5) hours
 *
 * so a 15-mark test needs about 3 hours to close two thirds of your gap
 * and a bigger one proportionally longer. Gains are weighted by credits,
 * since a 4-credit subject moves the SGPA more than a 2-credit one.
 *
 * **The allocation.** Half-hour blocks go, one at a time, to the test
 * whose next half hour is worth most — the right rule when returns
 * diminish. Each test takes the latest free block before it's due,
 * which leaves the earlier blocks for the tests that come first.
 *
 * Only real time is used: gaps between classes, plus whatever evening
 * time you allow on the plan's card. Nothing here invents a free
 * afternoon.
 */

export interface PlanTest {
  /** The deadline's id. */
  id: string;
  subjectId: string;
  label: string;
  /** Due, as the ISO timestamp stored on the deadline. */
  due: string;
  /** Marks at stake, in /100 terms of the subject. */
  stake: number;
  /** Share of a component you'd expect to take anyway, 0–1. */
  ability: number;
  credits: number;
}

export interface StudySession {
  testId: string;
  date: string;
  start: string; // "HH:MM"
  end: string;
  minutes: number;
  evening: boolean;
}

export interface StudyPlan {
  /** Chronological. */
  sessions: StudySession[];
  perTest: Array<{ test: PlanTest; minutes: number; gain: number }>;
  totalMinutes: number;
}

export interface StudyPlanInput {
  tests: PlanTest[];
  /** Free periods between classes up to the last test, from prepWindows. */
  windows: PrepWindow[];
  /** Minutes of each evening the plan may use (0 = gaps between classes only). */
  eveningMinutes: number;
  /** Planning starts here: "YYYY-MM-DD" and minutes past midnight. */
  today: string;
  nowMinutes: number;
}

const BLOCK = 30;
/** A leftover shorter than this isn't worth a session. */
const MIN_BLOCK = 20;
/** Evenings start here. */
export const EVENING_START = "18:30";
const EVENING_END = timeToMinutes("23:00");
/** Below this many expected marks, another half hour isn't worth planning. */
const MIN_GAIN = 0.05;

interface Block {
  date: string;
  start: number; // minutes past midnight
  end: number;
  evening: boolean;
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Expected marks gained from `hours` of study for one test. */
export function gain(test: Pick<PlanTest, "stake" | "ability">, hours: number): number {
  const tau = Math.max(1, test.stake / 5);
  return test.stake * Math.max(0, 1 - test.ability) * (1 - Math.exp(-hours / tau));
}

function split(date: string, start: number, end: number, evening: boolean): Block[] {
  const out: Block[] = [];
  for (let t = start; t < end; t += BLOCK) {
    const e = Math.min(t + BLOCK, end);
    if (e - t >= MIN_BLOCK) out.push({ date, start: t, end: e, evening });
  }
  return out;
}

/** When a block ends, as epoch ms in local time. */
function endsAt(b: Block): number {
  const [y, m, d] = b.date.split("-").map(Number);
  return new Date(y, m - 1, d, Math.floor(b.end / 60), b.end % 60).getTime();
}

export function buildStudyPlan({ tests, windows, eveningMinutes, today, nowMinutes }: StudyPlanInput): StudyPlan {
  const live = tests.filter((t) => t.stake > 0 && new Date(t.due).getTime() > Date.parse(`${today}T00:00:00`));
  if (live.length === 0) return { sessions: [], perTest: [], totalMinutes: 0 };

  const lastDue = new Date(Math.max(...live.map((t) => new Date(t.due).getTime())));
  const lastDay = toISODate(lastDue);

  const blocks: Block[] = [];
  for (const w of windows) {
    const start = timeToMinutes(w.start);
    if (w.date === today && start < nowMinutes) continue;
    blocks.push(...split(w.date, start, timeToMinutes(w.end), false));
  }
  if (eveningMinutes > 0) {
    const from = timeToMinutes(EVENING_START);
    const to = Math.min(from + eveningMinutes, EVENING_END);
    for (let d = today; d <= lastDay; d = addDays(d, 1)) {
      if (d === today && from < nowMinutes) continue;
      blocks.push(...split(d, from, to, true));
    }
  }
  blocks.sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);

  const ends = blocks.map(endsAt);
  const taken: Array<string | null> = blocks.map(() => null);
  const hours = new Map(live.map((t) => [t.id, 0]));
  const weight = (t: PlanTest) => Math.max(t.credits, 0.5);

  for (;;) {
    let best: { t: PlanTest; i: number; value: number } | null = null;
    for (const t of live) {
      const due = new Date(t.due).getTime();
      // The latest free block that finishes before this test.
      let i = -1;
      for (let j = blocks.length - 1; j >= 0; j--) {
        if (taken[j] === null && ends[j] <= due) {
          i = j;
          break;
        }
      }
      if (i < 0) continue;
      const h = hours.get(t.id)!;
      const len = (blocks[i].end - blocks[i].start) / 60;
      const value = weight(t) * (gain(t, h + len) - gain(t, h));
      if (!best || value > best.value) best = { t, i, value };
    }
    if (!best || best.value < MIN_GAIN) break;
    taken[best.i] = best.t.id;
    hours.set(best.t.id, hours.get(best.t.id)! + (blocks[best.i].end - blocks[best.i].start) / 60);
  }

  // Back-to-back blocks for one test on one day read as one session.
  const sessions: StudySession[] = [];
  blocks.forEach((b, i) => {
    const id = taken[i];
    if (!id) return;
    const last = sessions[sessions.length - 1];
    if (last && last.testId === id && last.date === b.date && timeToMinutes(last.end) === b.start && last.evening === b.evening) {
      last.end = hhmm(b.end);
      last.minutes += b.end - b.start;
    } else {
      sessions.push({ testId: id, date: b.date, start: hhmm(b.start), end: hhmm(b.end), minutes: b.end - b.start, evening: b.evening });
    }
  });

  const perTest = live
    .map((t) => ({ test: t, minutes: Math.round(hours.get(t.id)! * 60), gain: gain(t, hours.get(t.id)!) }))
    .filter((x) => x.minutes > 0)
    .sort((a, b) => a.test.due.localeCompare(b.test.due));

  return { sessions, perTest, totalMinutes: perTest.reduce((a, x) => a + x.minutes, 0) };
}

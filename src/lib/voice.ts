import type { ThemeName } from "@/store/app";

/**
 * The Brutalist theme changes how the app talks, not just how it looks.
 *
 * Every user-facing sentence that has an opinion — a greeting, an empty
 * state, a verdict on your attendance — has two versions. `plain` is the
 * app's normal register. `brutal` is blunt, lowercase and unimpressed.
 *
 * Two rules for the brutal copy, so it stays fun rather than nasty:
 *  - It roasts the *numbers*, never the person. "these numbers are
 *    cooked", not "you are a failure".
 *  - It never lies to be funny. If attendance is unrecoverable it still
 *    says so; it just doesn't dress it up.
 */

export type Tone = "plain" | "brutal";

export function toneFor(theme: ThemeName): Tone {
  return theme === "brutalist" ? "brutal" : "plain";
}

type Copy<A extends unknown[] = []> = Record<Tone, (...args: A) => string>;

const pick = <A extends unknown[]>(c: Copy<A>) => c;

export const VOICE = {
  /** `hour` is 0–23; `name` may be empty. */
  greeting: pick<[hour: number, name: string]>({
    plain: (hour, name) => {
      const part =
        hour < 5
          ? "Burning the midnight oil"
          : hour < 12
            ? "Good morning"
            : hour < 17
              ? "Good afternoon"
              : "Good evening";
      return name ? `${part}, ${name}` : part;
    },
    brutal: (hour, name) => {
      const who = name ? `, ${name}` : "";
      if (hour < 6) return `still up${who}?`;
      if (hour < 12) return `you're awake${who}`;
      if (hour < 17) return `sup${who}`;
      return `long day${who}?`;
    },
  }),

  /** The live class card's heading, while a class is running. */
  inClassNow: pick({
    plain: () => "In class now",
    brutal: () => "currently trapped",
  }),

  /** Heading while waiting for the next class of the day. */
  upNext: pick({
    plain: () => "Up next",
    brutal: () => "next sentence",
  }),

  /** Heading once every class has finished. */
  dayDone: pick({
    plain: () => "Day done",
    brutal: () => "released",
  }),

  /** Said under the heading when the last class has ended. */
  dayDoneBody: pick({
    plain: () => "No more classes today.",
    brutal: () => "no more classes. you survived.",
  }),

  /** `left` is a preformatted duration like "22 min". */
  minutesLeft: pick<[left: string]>({
    plain: (left) => `${left} left`,
    brutal: (left) => `${left} of your life left`,
  }),

  /** `until` is a preformatted duration like "1h 20m". */
  startsIn: pick<[until: string]>({
    plain: (until) => `starts in ${until}`,
    brutal: (until) => `${until} of freedom`,
  }),

  /** Heading on the skip wallet. */
  walletTitle: pick({
    plain: () => "Skip budget",
    brutal: () => "bunk wallet",
  }),

  /** Shown alone when the balance is zero — there is no number to lead with. */
  walletBroke: pick({
    plain: () => "No classes to spare",
    brutal: () => "broke. attend everything.",
  }),

  /**
   * The unit beside the balance, with no number in it. The count is
   * rendered separately so it can animate, so a sentence carrying its own
   * copy of the number would print it twice.
   */
  walletUnit: pick<[n: number]>({
    plain: (n) => `class${n === 1 ? "" : "es"} to spare`,
    brutal: (n) => `free skip${n === 1 ? "" : "s"} in the bank`,
  }),

  /** `n` is the number of classes already missed. */
  walletSpent: pick<[n: number]>({
    plain: (n) => `${n} already missed`,
    brutal: (n) => `${n} already burned`,
  }),

  /** Heading over the subjects that are below 75%. */
  walletDebt: pick({
    plain: () => "Overdrawn",
    brutal: () => "in debt",
  }),

  /** `n` is classes needed to climb back to 75%. */
  walletOwed: pick<[n: number]>({
    plain: (n) => `${n} straight to recover`,
    brutal: (n) => `${n} in a row. no misses.`,
  }),

  /** Shown when nothing has been marked yet. */
  walletEmpty: pick({
    plain: () => "Mark some classes to see what you can spare.",
    brutal: () => "no data. no budget. mark something.",
  }),

  /** Label above the exam countdown. */
  examLabel: pick({
    plain: () => "Next exam",
    brutal: () => "incoming",
  }),

  /** Said when the exam is today. */
  examToday: pick({
    plain: () => "It's today. Good luck.",
    brutal: () => "it's today. no notes left to make.",
  }),

  /** The exam has no mark total, so no target can be computed. */
  examNoMaxMarks: pick({
    plain: () => "Add the marks it's out of to get a target.",
    brutal: () => "no max marks, no target. add them.",
  }),

  /**
   * The exam has a mark total, but the subject has nothing recorded yet.
   * A different problem from the one above, and saying "add max marks"
   * here sends you to fix something that isn't broken.
   */
  examNoPace: pick({
    plain: () => "No marks in this subject yet — nothing to aim from.",
    brutal: () => "no marks yet. nothing to aim at.",
  }),

  /** Prompt inviting you to plan skips on the heatmap. */
  forecastHint: pick({
    plain: () => "Tap a day ahead to see the cost of skipping it.",
    brutal: () => "tap a future day. see what it costs you.",
  }),

  /** `n` days, `c` classes selected. */
  forecastSelected: pick<[n: number, c: number]>({
    plain: (n, c) => `Skipping ${n} day${n === 1 ? "" : "s"} · ${c} class${c === 1 ? "" : "es"}`,
    brutal: (n, c) => `${n} day${n === 1 ? "" : "s"} off · ${c} class${c === 1 ? "" : "es"} binned`,
  }),

  /** Shown when the plan lands under the minimum. */
  forecastBelow: pick({
    plain: () => "That drops you below 75%.",
    brutal: () => "that puts you under. don't.",
  }),

  // ---- wrapped ----

  wrappedTitle: pick({
    plain: () => "Semester Wrapped",
    brutal: () => "the receipts",
  }),

  wrappedIntro: pick({
    plain: () => "Here's your semester so far.",
    brutal: () => "everything you did. and didn't.",
  }),

  /** `h` hours sat in a classroom. */
  wrappedHours: pick<[h: number]>({
    plain: () => "hours in a classroom",
    brutal: (h) => (h >= 100 ? "hours you're not getting back" : "hours of your life, gone"),
  }),

  wrappedAttended: pick({
    plain: () => "classes attended",
    brutal: () => "times you showed up",
  }),

  wrappedMissed: pick({
    plain: () => "classes missed",
    brutal: () => "times you didn't",
  }),

  wrappedBest: pick({
    plain: () => "Your best subject",
    brutal: () => "the one you actually turn up for",
  }),

  wrappedWorst: pick({
    plain: () => "Your worst",
    brutal: () => "the one you avoid",
  }),

  /** `n` consecutive marked days with no absence. */
  wrappedStreak: pick<[n: number]>({
    plain: () => "day clean streak",
    brutal: (n) => (n >= 10 ? "days straight. who are you?" : "days straight, then you cracked"),
  }),

  /** `d` day order, `n` classes missed on it. */
  wrappedWorstDay: pick<[d: number, n: number]>({
    plain: (d) => `Day ${d} is your weak spot`,
    brutal: (d) => `day ${d} never stood a chance`,
  }),

  wrappedNoAbsence: pick({
    plain: () => "You haven't missed a single class.",
    brutal: () => "zero absences. suspicious, but respect.",
  }),

  wrappedEmpty: pick({
    plain: () => "Mark some classes and come back — there's nothing to wrap yet.",
    brutal: () => "no data. nothing to roast. mark something.",
  }),

  wrappedBestResult: pick({
    plain: () => "Your best result",
    brutal: () => "your one good day",
  }),

  wrappedTotalMarks: pick({
    plain: () => "marks banked so far",
    brutal: () => "marks scraped together",
  }),

  wrappedShare: pick({
    plain: () => "Share",
    brutal: () => "post the receipts",
  }),

  /** Label above the "when you're back" line on a holiday. */
  holidayBack: pick({
    plain: () => "Back",
    brutal: () => "back inside",
  }),

  /** `n` classes waiting on the next working day. */
  holidayThen: pick<[n: number]>({
    plain: (n) => `${n} class${n === 1 ? "" : "es"}`,
    brutal: (n) => `${n} class${n === 1 ? "" : "es"} waiting`,
  }),

  /** Heading on the dashboard's survival summary. */
  survivalTitle: pick({
    plain: () => "Days you can skip",
    brutal: () => "days you can vanish",
  }),

  /** `n` free days remain in the whole plan. */
  survivalFree: pick<[n: number]>({
    plain: (n) => `${n} free day${n === 1 ? "" : "s"} left this semester`,
    brutal: (n) =>
      n === 0 ? "none. every class counts now." : `${n} day${n === 1 ? "" : "s"} of freedom left`,
  }),

  /** From this date on, every miss costs a subject. */
  survivalCrunch: pick<[when: string]>({
    plain: (when) => `From ${when}, missing costs you a subject`,
    brutal: (when) => `after ${when} every miss costs you a subject`,
  }),

  /** Nothing is required — the plan has no crunch date. */
  survivalClear: pick({
    plain: () => "Nothing is compulsory from here.",
    brutal: () => "nothing's compulsory. enjoy it while it lasts.",
  }),

  noClassesToday: pick({
    plain: () => "No classes today — enjoy the break.",
    brutal: () => "no classes. go touch grass.",
  }),

  nothingMarked: pick({
    plain: () => "Nothing marked yet — start with today's classes.",
    brutal: () => "zero data. can't judge you yet.",
  }),

  /** Every subject is at or above the minimum. */
  attendanceHealthy: pick({
    plain: () => "All subjects are at or above 75%. Keep it up.",
    brutal: () => "somehow, everything's fine.",
  }),

  /** `n` subjects are below the minimum. */
  attendanceBelow: pick<[n: number]>({
    plain: (n) => `${n} subject${n > 1 ? "s" : ""} below 75%`,
    brutal: (n) => `${n} subject${n > 1 ? "s are" : " is"} cooked`,
  }),

  deadlinesEmptyTitle: pick({
    plain: () => "Nothing due",
    brutal: () => "nothing due. suspicious.",
  }),

  deadlinesEmptyBody: pick({
    plain: () => "Add assignments and exams so they can't sneak up on you.",
    brutal: () => "either you're on top of it or you forgot to add anything.",
  }),

  // ---- attendance ----

  noClassesMarked: pick({
    plain: () => "No classes marked yet",
    brutal: () => "no record. convenient.",
  }),

  heatmapEmptyTitle: pick({
    plain: () => "Your semester map starts here",
    brutal: () => "an empty grid. tragic.",
  }),

  heatmapEmptyBody: pick({
    plain: () => "Every day you mark paints this grid green, amber or red.",
    brutal: () => "mark a day and find out which colour you are.",
  }),

  /** `n` future classes can still be missed. */
  skipBudget: pick<[n: number]>({
    plain: (n) => `class${n === 1 ? "" : "es"} you can skip`,
    brutal: (n) => (n === 0 ? "you can skip nothing" : `free skip${n === 1 ? "" : "s"} left`),
  }),

  // ---- risk labels ----

  riskSafe: pick({ plain: () => "On track", brutal: () => "fine" }),
  riskWatch: pick({ plain: () => "Watch", brutal: () => "shaky" }),
  riskCritical: pick({ plain: () => "Critical", brutal: () => "cooked" }),

  // ---- marks ----

  noInternals: pick({
    plain: () => "No internals yet",
    brutal: () => "no marks. no opinion.",
  }),

  // ---- empty states that ask for setup ----

  timetableEmptyBody: pick({
    plain: () => "Add the classes that run on this day order — attendance marking needs them.",
    brutal: () => "nothing here. add your classes or stay in the dark.",
  }),

  insightsNeedTimetable: pick({
    plain: () => "Build your timetable first",
    brutal: () => "no timetable, no predictions.",
  }),

  insightsNeedMarks: pick({
    plain: () => "Add marks to project grades",
    brutal: () => "give me marks and i'll tell you the damage.",
  }),

  // ---- page titles ----
  // The brutal register renames the app's own furniture. Each title has
  // a matching subtitle below; keep them paired.

  titleAttendance: pick({ plain: () => "Attendance", brutal: () => "attendance scam" }),
  titleMarks: pick({ plain: () => "Marks", brutal: () => "prepare to cry" }),
  titleTimetable: pick({ plain: () => "Timetable", brutal: () => "prison schedule" }),
  titleInsights: pick({ plain: () => "Insights", brutal: () => "the damage report" }),
  titleCalendar: pick({ plain: () => "Calendar", brutal: () => "countdown to freedom" }),
  titleAbsences: pick({ plain: () => "Absent log", brutal: () => "hall of shame" }),
  titleHistory: pick({ plain: () => "Semester history", brutal: () => "past crimes" }),
  titleSettings: pick({ plain: () => "Settings", brutal: () => "damage control" }),

  subAttendance: pick({
    plain: () => "",
    brutal: () => "a statistical summary of your life choices",
  }),
  subTimetable: pick({
    plain: () => "",
    brutal: () => "when & where you will be miserable",
  }),
  subMarks: pick({ plain: () => "", brutal: () => "numbers that decide your summer" }),
  subInsights: pick({ plain: () => "", brutal: () => "the maths you keep avoiding" }),

  /** Sits under the attendance ring. `held` is classes conducted. */
  hoursWasted: pick<[attended: number, held: number]>({
    plain: (attended, held) => `${attended} of ${held} attended`,
    brutal: (attended, held) => `${attended} / ${held} hrs wasted`,
  }),

  /**
   * The per-subject verdict, with the bunk budget spelled out — the one
   * number anybody actually wants. `budget` is future classes you can
   * still miss and finish at or above the minimum.
   */
  diagnosis: pick<[budget: number, safe: boolean, needed: number]>({
    plain: (budget, safe, needed) =>
      safe
        ? `${budget} class${budget === 1 ? "" : "es"} you can skip`
        : `${needed} needed to reach 75%`,
    brutal: (budget, safe, needed) => {
      // Below the line, the number that matters is how many in a row it
      // takes to climb back — "cooked" on every subject says nothing.
      if (!safe) {
        if (needed <= 0) return "cooked";
        if (needed === 1) return "one class from safe";
        // No "doomed" here, however large the number gets. This view
        // knows how many classes you need but not how many remain, so
        // it cannot tell brutal apart from impossible — and claiming
        // impossible when it isn't would be the one lie this voice
        // doesn't get to tell. The survival plan does know, and says so.
        return `${needed} straight to survive`;
      }
      if (budget === 0) return "barely safe (0 bunks left)";
      if (budget >= 5) return `nerd (${budget} free bunks)`;
      return `${budget} free bunk${budget === 1 ? "" : "s"}`;
    },
  }),

  /** Shown when a subject can no longer reach the minimum at all. */
  unreachable: pick({
    plain: () => "75% is no longer reachable",
    brutal: () => "mathematically doomed",
  }),

  /** Footer, and the only place the app admits what it is. */
  footer: pick({
    plain: () =>
      "AcadKit 2.0 — built for SRM KTR's day-order life. Internals /60, externals /40, 75% or bust.",
    brutal: () => "scribbled in the back bench by someone who hates this app",
  }),

  // ---- first contact ----
  // The sign-in screen is where a new user meets the app, so it is the
  // worst possible place to break character.

  signInTagline: pick({
    plain: () => "Sign in to sync your semester",
    brutal: () => "sign in and face the numbers",
  }),
  signUpTagline: pick({
    plain: () => "Create your account",
    brutal: () => "new here? bold of you",
  }),
  signInAction: pick({ plain: () => "Sign in", brutal: () => "let me in" }),
  signUpAction: pick({ plain: () => "Create account", brutal: () => "start the suffering" }),
  signInSwap: pick({
    plain: () => "New here? Create an account",
    brutal: () => "no account? make one",
  }),
  signUpSwap: pick({
    plain: () => "I already have an account",
    brutal: () => "i've been here before",
  }),
  staysSignedIn: pick({
    plain: () => "This device stays signed in — you only do this once.",
    brutal: () => "you only do this once. small mercies.",
  }),

  onboardingBlurb: pick({
    plain: () =>
      "Attendance, marks, SGPA and your day-order timetable — on every device you sign in to.",
    brutal: () =>
      "attendance, marks and the day order, on every device you sign in to. no escape.",
  }),
  onboardingAction: pick({
    plain: () => "Set up my semester",
    brutal: () => "let's see the damage",
  }),
  onboardingNote: pick({
    plain: () => "Seeds your SRM subjects so there's something to edit rather than a blank app.",
    brutal: () => "seeds your srm subjects. edit them, they're probably wrong.",
  }),
  onboardingDone: pick({
    plain: () => "You're set up — your subjects are ready to edit.",
    brutal: () => "done. now go ruin it.",
  }),

  // ---- absences ----

  absentLogBlurb: pick({
    plain: () => "Every period you miss will show up here.",
    brutal: () => "every period you skipped, itemised.",
  }),
  absentEmptyTitle: pick({ plain: () => "Clean sheet", brutal: () => "suspiciously clean" }),
  absentEmptyBody: pick({
    plain: () => "No absents on record. Keep it that way!",
    brutal: () => "no absences on record. either you're good or you're not marking.",
  }),

  // ---- survival schedule ----

  tabSurvival: pick({ plain: () => "Plan", brutal: () => "survival" }),

  planIntro: pick<[free: number, total: number]>({
    plain: (free, total) =>
      `${free} of the next ${total} class days can be missed without dropping a subject.`,
    brutal: (free, total) =>
      free === 0
        ? `zero free days out of ${total}. every single one counts now.`
        : `${free} days off left out of ${total}. spend them wisely.`,
  }),

  planDeadline: pick<[date: string]>({
    plain: (date) => `From ${date}, every class matters.`,
    brutal: (date) => `after ${date} you attend everything. no exceptions.`,
  }),

  planNoDeadline: pick({
    plain: () => "Nothing is mandatory yet.",
    brutal: () => "nothing mandatory yet. enjoy it.",
  }),

  planLost: pick<[n: number]>({
    plain: (n) => `${n} subject${n === 1 ? "" : "s"} can no longer reach 75%.`,
    brutal: (n) =>
      `${n} subject${n === 1 ? " is" : "s are"} already gone — attending won't save ${n === 1 ? "it" : "them"}.`,
  }),

  dayFree: pick({ plain: () => "Free", brutal: () => "skip it" }),
  dayRequired: pick<[n: number]>({
    plain: (n) => `${n} required`,
    brutal: (n) => `${n} mandatory`,
  }),

  titleWidget: pick({ plain: () => "Due soon", brutal: () => "what's coming for you" }),

  // ---- sync health ----

  syncStale: pick<[days: number]>({
    plain: (days) => `Portal data is ${days} days old — open the portal and run the sync.`,
    brutal: (days) => `${days} days since the portal talked. these numbers are fiction now.`,
  }),
  syncNever: pick({
    plain: () => "Never synced from the portal — these are only classes you marked by hand.",
    brutal: () => "never synced. you're grading your own homework.",
  }),

  // ---- calendar ----

  holidayDeclared: pick({
    plain: () => "Holiday declared — remaining day orders shift forward",
    brutal: () => "holiday declared. the rota shuffles along.",
  }),
  holidayRemoved: pick({
    plain: () => "Holiday removed — day orders restored",
    brutal: () => "holiday revoked. back to work.",
  }),
  holidayPromptTitle: pick({
    plain: () => "Name this holiday",
    brutal: () => "what are we calling this one?",
  }),

  // ---- history ----

  historyEmptyTitle: pick({
    plain: () => "No past semesters yet",
    brutal: () => "no history. spotless record, technically.",
  }),
  historyEmptyBody: pick({
    plain: () =>
      "When a semester ends, archive it here — its SGPA and per-subject brief are saved, and your CGPA builds up automatically.",
    brutal: () =>
      "archive a semester when it ends and its sgpa is preserved forever, whether you want that or not.",
  }),
  semesterArchived: pick({
    plain: () => "Semester archived",
    brutal: () => "filed away. it happened.",
  }),
  semesterCleared: pick({
    plain: () => "Cleared — ready for the new semester",
    brutal: () => "wiped. fresh start, same you.",
  }),
} as const;

/** Resolve one line for a tone. */
export function say<A extends unknown[]>(copy: Copy<A>, tone: Tone, ...args: A): string {
  return copy[tone](...args);
}

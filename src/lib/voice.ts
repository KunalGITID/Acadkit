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
        if (needed > 40) return "mathematically doomed";
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
} as const;

/** Resolve one line for a tone. */
export function say<A extends unknown[]>(copy: Copy<A>, tone: Tone, ...args: A): string {
  return copy[tone](...args);
}

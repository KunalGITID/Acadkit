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
} as const;

/** Resolve one line for a tone. */
export function say<A extends unknown[]>(copy: Copy<A>, tone: Tone, ...args: A): string {
  return copy[tone](...args);
}

import type { CourseUnits } from "@/lib/units";

/** Electives, described from their syllabi (units.json) so they can be compared: a theme read off the title and unit titles, and how much of the syllabus is maths (statistics, linear algebra, probability...) - worth knowing when maths has been your hardest area. */

export type Theme = "ml" | "data" | "systems" | "applied";

export const THEMES: Record<Theme, string> = {
  ml: "ML & AI",
  data: "Data & analytics",
  systems: "Systems, cloud & IoT",
  applied: "Applied domains",
};

const THEME_WORDS: [Theme, RegExp][] = [
  ["applied", /marketing|financ|healthcare|risk|social network|business intelligence/i],
  ["ml", /learning|neural|intelligen|generative|speech|image|vision|nlp|natural language|robot|fuzzy|bio-inspired/i],
  ["systems", /cloud|internet of things|\biot\b|architecture|storage|orchestration|streaming|web|mobile|virtual reality|augmented/i],
  ["data", /data|analytic|mining|warehous|visuali|big data|multivariate|python/i],
];

const MATHS =
  /probabilit|statistic|regression|linear algebra|matri(x|ces)|calculus|bayes|distribution|hypothesis|variance|covariance|eigen|optimi[sz]|gradient|fourier|stochastic|markov|correlation|principal component|factor analysis|discriminant|anova|chi.?square|\bt[- ]test|\bz[- ]test|sampling|estimat|time series|arima|monte carlo|value at risk|entropy|likelihood|logistic|derivative|integral|vector space|differential/gi;

export function themeOf(title: string, unitTitles: string[]): Theme {
  const text = `${title} ${unitTitles.join(" ")}`;
  for (const [t, re] of THEME_WORDS) if (re.test(title)) return t;
  for (const [t, re] of THEME_WORDS) if (re.test(text)) return t;
  return "data";
}

/** Topics that are maths, out of all topics: 0–1. */
export function mathsShare(course: CourseUnits): number {
  const topics = course.units.flatMap((u) => u.topics);
  if (topics.length === 0) return 0;
  return topics.filter((t) => new RegExp(MATHS.source, "i").test(t)).length / topics.length;
}

/** A syllabus where at least 1 topic in 8 is maths. */
export const MATHS_HEAVY = 0.125;

export interface ElectiveInfo {
  code: string;
  title: string;
  kind: "E" | "O";
  theme: Theme;
  maths: number;
  prerequisites: string | null;
  units: string[];
  hasSyllabus: boolean;
}

export function describeElectives(
  lists: { E: [string, string][]; O: [string, string][] },
  courses: Record<string, CourseUnits> | undefined
): ElectiveInfo[] {
  const out: ElectiveInfo[] = [];
  for (const kind of ["E", "O"] as const) {
    for (const [code, title] of lists[kind]) {
      const c = courses?.[code];
      const units = c?.units.map((u) => u.title) ?? [];
      const pre = c?.prerequisites && !/^nil$/i.test(c.prerequisites.trim()) ? c.prerequisites : null;
      out.push({
        code,
        title,
        kind,
        theme: themeOf(title, units),
        maths: c ? mathsShare(c) : 0,
        prerequisites: pre,
        units,
        hasSyllabus: !!c && c.units.length > 0,
      });
    }
  }
  return out;
}

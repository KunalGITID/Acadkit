import type { AskedQuestion, MinedTopic } from "@/lib/examPrep";

/**
 * Past-paper practice: the subject's mined topics, most-asked first, and
 * the real questions each was asked as. Reading and answering them is the
 * drill - nothing is scored or scheduled.
 */

/** Topics in the chosen units (all when none is chosen), most-asked first. */
export function practiceTopics(topics: MinedTopic[], unit: number | null): MinedTopic[] {
  return topics
    .filter((t) => unit == null || t.unit === unit)
    .sort((a, b) => b.papers - a.papers || (b.latest ?? 0) - (a.latest ?? 0));
}

/** The units that have topics, in order: the filter chips. */
export function practiceUnits(topics: MinedTopic[]): number[] {
  return [...new Set(topics.flatMap((t) => (t.unit != null ? [t.unit] : [])))].sort((a, b) => a - b);
}

/** Every real question a topic was asked as; an older sync only has its example. */
export function questionsOf(t: MinedTopic): AskedQuestion[] {
  if (t.asked?.length) return t.asked;
  return [{ text: t.question ?? t.example, path: null, year: t.latest, group: "" }];
}

/** A random question, weighted by how many papers asked its topic: the topics that keep coming back come up more often. */
export function randomQuestion(
  topics: MinedTopic[],
  rand: () => number = Math.random,
  avoid?: string
): { topic: MinedTopic; question: AskedQuestion } | null {
  const pool = topics.flatMap((topic) => questionsOf(topic).map((question) => ({ topic, question })));
  const choices = pool.length > 1 && avoid ? pool.filter((c) => c.question.text !== avoid) : pool;
  const total = choices.reduce((n, c) => n + c.topic.papers, 0);
  if (!total) return null;
  let r = rand() * total;
  for (const c of choices) {
    r -= c.topic.papers;
    if (r < 0) return c;
  }
  return choices[choices.length - 1];
}

/** "End_Sem" → "End sem", "FJ-II" stays. For a question's paper label. */
export function paperLabel(q: AskedQuestion): string {
  const group = q.group === "End_Sem" ? "End sem" : q.group.replace(/_/g, " ");
  return [group, q.year].filter(Boolean).join(" · ");
}

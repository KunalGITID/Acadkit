import type { DeadlineSuggestion } from "@/lib/suggestions";

/**
 * Learning which found deadlines you actually want.
 *
 * Every Add or Dismiss on "Found in your files" is a labelled example of
 * what you care about. This fits a small logistic regression to those
 * decisions — words in the quoted line, the type, where it was found,
 * how far ahead it was — and uses it to sort new suggestions and fold
 * away the ones you'd probably dismiss.
 *
 * It stays switched off until it has earned a say:
 *  - enough decisions of *both* kinds (all-Add teaches nothing), and
 *  - cross-validated accuracy clearly better than always guessing the
 *    more common answer. A model that can't beat that is noise with a
 *    confident face, and it is not shown.
 *
 * Only your decisions count. The sync script's clean-up of suggestions
 * the scan dropped is marked 'withdrawn' (migration 029), and a
 * 'dismissed' row from before that — with no decided_at — can't be told
 * apart from it, so it is left out.
 */

export interface LabelledSuggestion {
  suggestion: DeadlineSuggestion;
  accepted: boolean;
}

export interface SuggestionModel {
  weights: Map<string, number>;
  bias: number;
  /** Decisions it learned from. */
  examples: number;
  /** Cross-validated accuracy, 0–1. */
  accuracy: number;
  /** Accuracy of always guessing the more common answer. */
  baseline: number;
}

export interface SuggestionScore {
  /** Chance you'd add it, 0–1. */
  p: number;
  /** The features that pushed hardest, in words. */
  reasons: string[];
}

/** Below this many decisions of each kind there is nothing to learn. */
export const MIN_EACH = 5;
const L2 = 1;
const ITERATIONS = 400;

const STOPWORDS = new Set(
  "the a an and or of to in on for at by is are be will with from this that it as not no on".split(" ")
);

/** Plain words from a line of text; numbers collapse to one token. */
function words(text: string | null | undefined): string[] {
  return (text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w))
    .map((w) => (/^\d+$/.test(w) ? "#num" : w));
}

const DAY = 86_400_000;

/** The features one suggestion carries, as a set of names. */
export function suggestionFeatures(s: DeadlineSuggestion): Set<string> {
  const p = s.payload;
  const f = new Set<string>();
  for (const w of words(s.evidence)) f.add(`w:${w}`);
  for (const w of words(p.label)) f.add(`w:${w}`);
  f.add(`type:${p.type}`);
  f.add(p.subject_code ? "subject:yes" : "subject:no");
  f.add(p.label ? "label:yes" : "label:no");
  if (p.max_marks) f.add("marks:yes");
  if (p.moved_from) f.add("moved:yes");
  // Where it was found: "DSA_21CSC201J/05_WhatsApp/x.pdf" → "whatsapp".
  const parts = (s.source ?? "").split("/");
  const folder = parts.length > 1 ? parts[parts.length - 2] : "";
  const kind = folder.replace(/^\d+_/, "").toLowerCase().replace(/[^a-z]+/g, "");
  if (kind) f.add(`src:${kind}`);
  if (s.created_at) {
    const lead = (new Date(p.due_date).getTime() - new Date(s.created_at).getTime()) / DAY;
    f.add(lead < 3 ? "lead:<3d" : lead < 7 ? "lead:<1w" : lead < 14 ? "lead:<2w" : "lead:2w+");
  }
  return f;
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

interface Row {
  x: string[];
  y: number;
}

/** Class-balanced, L2-regularised logistic regression by gradient descent. */
function fit(rows: Row[]): { weights: Map<string, number>; bias: number } {
  const pos = rows.filter((r) => r.y === 1).length;
  const neg = rows.length - pos;
  const wPos = rows.length / (2 * Math.max(pos, 1));
  const wNeg = rows.length / (2 * Math.max(neg, 1));
  const weights = new Map<string, number>();
  let bias = 0;
  const rate = 0.5;
  for (let it = 0; it < ITERATIONS; it++) {
    const grad = new Map<string, number>();
    let gBias = 0;
    for (const r of rows) {
      let z = bias;
      for (const k of r.x) z += weights.get(k) ?? 0;
      const err = (sigmoid(z) - r.y) * (r.y === 1 ? wPos : wNeg);
      gBias += err;
      for (const k of r.x) grad.set(k, (grad.get(k) ?? 0) + err);
    }
    bias -= (rate * gBias) / rows.length;
    for (const [k, g] of grad) {
      const w = weights.get(k) ?? 0;
      weights.set(k, w - (rate * (g + L2 * w)) / rows.length);
    }
  }
  return { weights, bias };
}

function predict(model: { weights: Map<string, number>; bias: number }, x: Iterable<string>): number {
  let z = model.bias;
  for (const k of x) z += model.weights.get(k) ?? 0;
  return sigmoid(z);
}

/**
 * Fit a model to your decisions, or return null when it hasn't earned a
 * say (too few decisions of either kind, or no better than guessing).
 */
export function trainSuggestionModel(examples: LabelledSuggestion[]): SuggestionModel | null {
  const pos = examples.filter((e) => e.accepted).length;
  const neg = examples.length - pos;
  if (pos < MIN_EACH || neg < MIN_EACH) return null;

  // Features seen in only one decision can't generalise; they only memorise.
  const feats = examples.map((e) => [...suggestionFeatures(e.suggestion)]);
  const df = new Map<string, number>();
  for (const f of feats) for (const k of f) df.set(k, (df.get(k) ?? 0) + 1);
  const rows: Row[] = feats.map((f, i) => ({
    x: f.filter((k) => (df.get(k) ?? 0) >= 2),
    y: examples[i].accepted ? 1 : 0,
  }));

  // k-fold cross-validation, folds dealt round-robin so both classes land in each.
  const k = Math.min(10, rows.length);
  let correct = 0;
  for (let fold = 0; fold < k; fold++) {
    const train = rows.filter((_, i) => i % k !== fold);
    const test = rows.filter((_, i) => i % k === fold);
    const m = fit(train);
    for (const r of test) {
      const p = predict(m, r.x);
      // A prediction at 50% is a coin flip, and scores like one. Rounding
      // in the class weights otherwise tips ties with each fold's mix of
      // labels — enough to make pure noise look accurate.
      if (Math.abs(p - 0.5) < 1e-3) correct += 0.5;
      else if ((p > 0.5 ? 1 : 0) === r.y) correct++;
    }
  }
  const accuracy = correct / rows.length;
  const baseline = Math.max(pos, neg) / rows.length;
  if (accuracy < baseline + 0.05) return null;

  const { weights, bias } = fit(rows);
  return { weights, bias, examples: rows.length, accuracy, baseline };
}

const LEAD: Record<string, string> = {
  "<3d": "due within 3 days",
  "<1w": "due within a week",
  "<2w": "due within 2 weeks",
  "2w+": "due 2+ weeks out",
};

/** "w:ft" → "“ft”", "src:whatsapp" → "found in whatsapp". */
function describe(feature: string): string {
  const [kind, value] = feature.split(":");
  switch (kind) {
    case "w":
      return value === "#num" ? "a number in the note" : `“${value}”`;
    case "type":
      return `${value}s`;
    case "src":
      return `found in ${value}`;
    case "subject":
      return value === "yes" ? "a named subject" : "no subject named";
    case "label":
      return value === "yes" ? "a named component" : "no component named";
    case "marks":
      return "carries marks";
    case "moved":
      return "a moved date";
    case "lead":
      return LEAD[value] ?? feature;
    default:
      return feature;
  }
}

export function scoreSuggestion(model: SuggestionModel, s: DeadlineSuggestion): SuggestionScore {
  const x = [...suggestionFeatures(s)].filter((k) => model.weights.has(k));
  const p = predict(model, x);
  // The two features pushing hardest in the direction of the call.
  const sign = p >= 0.5 ? 1 : -1;
  const reasons = x
    .map((k) => ({ k, w: (model.weights.get(k) ?? 0) * sign }))
    .filter((c) => c.w > 0.05)
    .sort((a, b) => b.w - a.w)
    .slice(0, 2)
    .map((c) => describe(c.k));
  return { p, reasons };
}

/** Your decided deadline suggestions, as training examples. */
export function labelledFrom(rows: DeadlineSuggestion[]): LabelledSuggestion[] {
  const out: LabelledSuggestion[] = [];
  for (const s of rows) {
    if (s.status === "accepted") out.push({ suggestion: s, accepted: true });
    // A dismissal only counts when it is known to be yours.
    else if (s.status === "dismissed" && s.decided_at) out.push({ suggestion: s, accepted: false });
  }
  return out;
}

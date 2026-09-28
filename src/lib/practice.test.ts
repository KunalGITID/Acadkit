import { describe, expect, it } from "vitest";
import type { MinedTopic } from "@/lib/examPrep";
import { paperLabel, practiceTopics, practiceUnits, questionsOf, randomQuestion } from "@/lib/practice";

const topic = (label: string, papers: number, unit?: number, asked?: MinedTopic["asked"]): MinedTopic => ({
  label,
  example: `${label} example`,
  papers,
  questions: papers,
  latest: 2025,
  groups: {},
  ...(unit != null ? { unit } : {}),
  ...(asked ? { asked } : {}),
});

describe("practice", () => {
  const stack = topic("Stack", 6, 3, [
    { text: "Push and pop", path: "DSA/07_PYQs/End_Sem/Nov_2024.pdf", year: 2024, group: "End_Sem" },
    { text: "Infix to postfix", path: null, year: 2023, group: "FJ-II" },
  ]);
  const trees = topic("AVL", 2, 4);

  it("orders by papers and filters by unit", () => {
    expect(practiceTopics([trees, stack], null).map((t) => t.label)).toEqual(["Stack", "AVL"]);
    expect(practiceTopics([trees, stack], 4).map((t) => t.label)).toEqual(["AVL"]);
    expect(practiceUnits([trees, stack, topic("x", 2)])).toEqual([3, 4]);
  });

  it("falls back to the example when a sync kept no questions", () => {
    expect(questionsOf(trees)).toEqual([{ text: "AVL example", path: null, year: 2025, group: "" }]);
    expect(questionsOf(stack)).toHaveLength(2);
  });

  it("weights the random pick by how many papers asked the topic", () => {
    // Pool: Stack×2 (weight 6 each), AVL×1 (weight 2); total 14.
    expect(randomQuestion([stack, trees], () => 0)?.question.text).toBe("Push and pop");
    expect(randomQuestion([stack, trees], () => 0.99)?.topic.label).toBe("AVL");
    expect(randomQuestion([], () => 0.5)).toBeNull();
  });

  it("does not repeat the question on screen when there is another", () => {
    expect(randomQuestion([stack], () => 0, "Push and pop")?.question.text).toBe("Infix to postfix");
    expect(randomQuestion([trees], () => 0, "AVL example")?.question.text).toBe("AVL example");
  });

  it("labels the paper", () => {
    expect(paperLabel({ text: "", path: null, year: 2024, group: "End_Sem" })).toBe("End sem · 2024");
    expect(paperLabel({ text: "", path: null, year: null, group: "FJ-II" })).toBe("FJ-II");
  });
});

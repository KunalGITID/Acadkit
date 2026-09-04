import { describe, expect, it } from "vitest";
import { say, toneFor, VOICE } from "@/lib/voice";

describe("toneFor", () => {
  it("only the brutalist theme changes the voice", () => {
    expect(toneFor("brutalist")).toBe("brutal");
    expect(toneFor("oled")).toBe("plain");
  });
});

describe("greeting", () => {
  it("uses the name when there is one", () => {
    expect(say(VOICE.greeting, "plain", 9, "Kunal")).toBe("Good morning, Kunal");
    expect(say(VOICE.greeting, "brutal", 14, "Kunal")).toBe("sup, Kunal");
  });

  it("reads cleanly with no name", () => {
    expect(say(VOICE.greeting, "plain", 9, "")).toBe("Good morning");
    expect(say(VOICE.greeting, "brutal", 14, "")).toBe("sup");
  });

  it("covers the whole clock in both tones", () => {
    for (let hour = 0; hour < 24; hour++) {
      for (const tone of ["plain", "brutal"] as const) {
        const line = say(VOICE.greeting, tone, hour, "Kunal");
        expect(line.trim()).not.toBe("");
        expect(line).not.toContain("undefined");
      }
    }
  });
});

describe("attendanceBelow", () => {
  it("agrees with itself on plurals", () => {
    expect(say(VOICE.attendanceBelow, "plain", 1)).toBe("1 subject below 75%");
    expect(say(VOICE.attendanceBelow, "plain", 3)).toBe("3 subjects below 75%");
    expect(say(VOICE.attendanceBelow, "brutal", 1)).toBe("1 subject is cooked");
    expect(say(VOICE.attendanceBelow, "brutal", 3)).toBe("3 subjects are cooked");
  });
});

describe("every line", () => {
  it("exists in both tones and is never blank", () => {
    for (const [key, copy] of Object.entries(VOICE)) {
      for (const tone of ["plain", "brutal"] as const) {
        // 1 and "Kunal" are harmless for the lines that take no args.
        const line = (copy[tone] as (...a: unknown[]) => string)(1, "Kunal");
        expect(line, `${key}.${tone}`).toBeTruthy();
        expect(line, `${key}.${tone}`).not.toContain("undefined");
      }
    }
  });

  it("keeps the brutal register lowercase", () => {
    // The greeting is excluded: it interpolates a name, which keeps its caps.
    for (const [key, copy] of Object.entries(VOICE)) {
      if (key === "greeting") continue;
      const line = (copy.brutal as (...a: unknown[]) => string)(2);
      expect(line, key).toBe(line.toLowerCase());
    }
  });
});

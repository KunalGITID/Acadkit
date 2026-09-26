import { describe, expect, it } from "vitest";
import {
  labelledFrom,
  MIN_EACH,
  scoreSuggestion,
  suggestionFeatures,
  trainSuggestionModel,
  type LabelledSuggestion,
} from "@/lib/suggestionModel";
import type { DeadlineSuggestion } from "@/lib/suggestions";

let n = 0;
function suggestion(
  over: Partial<DeadlineSuggestion["payload"]> & { evidence?: string; source?: string } = {}
): DeadlineSuggestion {
  n++;
  const { evidence, source, ...payload } = over;
  return {
    id: `s${n}`,
    device_id: "0404",
    key: `k${n}`,
    kind: "deadline",
    status: "pending",
    source: source ?? "DSA_21CSC201J/06_Notes/notes.pdf",
    evidence: evidence ?? "FJ-2 on 14 Oct, units 2 and 3",
    created_at: "2026-09-01T10:00:00+05:30",
    payload: {
      subject_code: "21CSC201J",
      type: "exam",
      label: "FJ-2",
      due_date: "2026-09-10T09:30:00+05:30",
      max_marks: 15,
      ...payload,
    },
  };
}

// You add tests from the notes folder and dismiss WhatsApp chatter about events.
function history(): LabelledSuggestion[] {
  const out: LabelledSuggestion[] = [];
  for (let i = 0; i < 8; i++) {
    out.push({ suggestion: suggestion({ evidence: `FT test on unit ${i}` }), accepted: true });
    out.push({
      suggestion: suggestion({
        type: "other",
        label: null,
        max_marks: null,
        evidence: `club event registration closes, fest ${i}`,
        source: "DSA_21CSC201J/05_WhatsApp/chat.pdf",
      }),
      accepted: false,
    });
  }
  return out;
}

describe("suggestionFeatures", () => {
  it("reads words, type, source folder and lead time", () => {
    const f = suggestionFeatures(
      suggestion({ evidence: "Lab record due Friday", source: "OS_21CSC202J/05_WhatsApp/x.pdf", type: "lab" })
    );
    expect(f.has("w:lab")).toBe(true);
    expect(f.has("w:record")).toBe(true);
    expect(f.has("type:lab")).toBe(true);
    expect(f.has("src:whatsapp")).toBe(true);
    expect(f.has("lead:<2w")).toBe(true); // 1 Sep → 10 Sep
  });
});

describe("trainSuggestionModel", () => {
  it("stays off with decisions of only one kind — all-Add teaches nothing", () => {
    const allAdded = history().filter((e) => e.accepted);
    expect(trainSuggestionModel(allAdded)).toBeNull();
  });

  it(`stays off below ${MIN_EACH} of each kind`, () => {
    const few = history().slice(0, 2 * (MIN_EACH - 1));
    expect(trainSuggestionModel(few)).toBeNull();
  });

  it("learns a real pattern, and says how well it does on decisions it didn't see", () => {
    const model = trainSuggestionModel(history());
    expect(model).not.toBeNull();
    expect(model!.accuracy).toBeGreaterThan(model!.baseline);
    const test = scoreSuggestion(model!, suggestion({ evidence: "FT test on unit 4" }));
    const chatter = scoreSuggestion(
      model!,
      suggestion({
        type: "other",
        label: null,
        max_marks: null,
        evidence: "fest registration closes",
        source: "OS_21CSC202J/05_WhatsApp/chat.pdf",
      })
    );
    expect(test.p).toBeGreaterThan(0.7);
    expect(chatter.p).toBeLessThan(0.3);
    expect(chatter.reasons.length).toBeGreaterThan(0);
  });

  it("stays off when the decisions have no pattern to find", () => {
    // Identical suggestions, decided both ways at random: nothing beats guessing.
    const noise: LabelledSuggestion[] = Array.from({ length: 16 }, (_, i) => ({
      suggestion: suggestion({ evidence: "same text every time" }),
      accepted: i % 2 === 0,
    }));
    expect(trainSuggestionModel(noise)).toBeNull();
  });
});

describe("labelledFrom", () => {
  it("counts only decisions known to be yours", () => {
    const accepted = { ...suggestion(), status: "accepted" as const };
    const mine = { ...suggestion(), status: "dismissed" as const, decided_at: "2026-09-20T10:00:00Z" };
    const legacy = { ...suggestion(), status: "dismissed" as const, decided_at: null };
    const withdrawn = { ...suggestion(), status: "withdrawn" as const };
    const labelled = labelledFrom([accepted, mine, legacy, withdrawn]);
    expect(labelled.map((l) => l.accepted)).toEqual([true, false]);
  });
});

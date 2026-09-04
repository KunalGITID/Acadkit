import { describe, expect, it } from "vitest";
import { buildWallet, pipsFor, PIP_CAP } from "@/lib/bunkWallet";
import type { SubjectAttendance } from "@/lib/attendance";
import type { Subject } from "@/types";

const row = (
  name: string,
  attended: number,
  total: number,
  canBunk: number,
  needToAttend = 0
): SubjectAttendance =>
  ({
    subject: { id: name, name } as Subject,
    attended,
    total,
    percentage: total ? (attended / total) * 100 : null,
    canBunk,
    needToAttend,
    source: "manual",
  }) as SubjectAttendance;

describe("buildWallet", () => {
  it("is empty when nothing has been marked", () => {
    const w = buildWallet([row("OS", 0, 0, 0)]);
    expect(w.empty).toBe(true);
    expect(w.left).toBe(0);
    expect(w.credit).toHaveLength(0);
  });

  it("totals the balance across subjects in credit", () => {
    const w = buildWallet([row("OS", 20, 24, 2), row("DSA", 40, 44, 9)]);
    expect(w.left).toBe(11);
    expect(w.empty).toBe(false);
  });

  it("counts what has already been spent", () => {
    // 4 missed in OS, 4 in DSA.
    const w = buildWallet([row("OS", 20, 24, 2), row("DSA", 40, 44, 9)]);
    expect(w.spent).toBe(8);
  });

  it("separates subjects in debt from subjects with a balance", () => {
    const w = buildWallet([
      row("OS", 20, 24, 2),
      row("Maths", 30, 46, 0, 34),
      row("DSA", 40, 44, 9),
    ]);
    expect(w.credit.map((r) => r.subject.subject.name)).toEqual(["DSA", "OS"]);
    expect(w.debt.map((r) => r.subject.subject.name)).toEqual(["Maths"]);
  });

  it("leaves a subject in debt out of the spendable total", () => {
    // Its canBunk is 0 anyway, but the total must not be reachable via
    // the debt list either — you cannot skip your way out of 65%.
    const w = buildWallet([row("Maths", 30, 46, 0, 34), row("DSA", 40, 44, 9)]);
    expect(w.left).toBe(9);
  });

  it("ranks debt by how deep it is, not alphabetically", () => {
    const w = buildWallet([row("A", 10, 20, 0, 10), row("B", 5, 20, 0, 40)]);
    expect(w.debt.map((r) => r.subject.subject.name)).toEqual(["B", "A"]);
  });
});

describe("pipsFor", () => {
  it("draws one pip per skip while the count is readable", () => {
    expect(pipsFor(3)).toEqual({ pips: 3, overflow: 0 });
  });

  it("caps the row and moves the rest into a number", () => {
    // Thirty dots is a texture, not a count.
    expect(pipsFor(30)).toEqual({ pips: PIP_CAP, overflow: 30 - PIP_CAP });
  });

  it("draws nothing at zero", () => {
    expect(pipsFor(0)).toEqual({ pips: 0, overflow: 0 });
  });
});

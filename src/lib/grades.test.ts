import { describe, expect, it } from "vitest";
import { gradeForTotal } from "@/lib/grades";


describe("gradeForTotal", () => {
  it("maps totals to grades + points", () => {
    expect(gradeForTotal(95)).toEqual({ grade: "O", points: 10 });
    expect(gradeForTotal(85)).toEqual({ grade: "A+", points: 9 });
    expect(gradeForTotal(75)).toEqual({ grade: "A", points: 8 });
    expect(gradeForTotal(65)).toEqual({ grade: "B+", points: 7 });
    expect(gradeForTotal(58)).toEqual({ grade: "B", points: 6 });
    expect(gradeForTotal(52)).toEqual({ grade: "C", points: 5 });
    expect(gradeForTotal(40)).toEqual({ grade: "F", points: 0 });
  });

  it("uses inclusive lower bounds", () => {
    expect(gradeForTotal(91).grade).toBe("O");
    expect(gradeForTotal(90).grade).toBe("A+");
    expect(gradeForTotal(50).grade).toBe("C");
    expect(gradeForTotal(49).grade).toBe("F");
  });
});

describe("boundary tolerance", () => {
  it("does not mark a student down for a float ulp", () => {
    // Budget arithmetic — scaled weights, clamped shares, summed halves
    // — lands an exact 81 on 80.99999999999967 often enough to matter.
    expect(gradeForTotal(80.99999999999967).grade).toBe("A+");
    expect(gradeForTotal(70.9999999999999).grade).toBe("A");
    expect(gradeForTotal(90.99999999999999).grade).toBe("O");
  });

  it("still holds the line on a real shortfall", () => {
    // A tenth of a mark below is below. Only float noise is forgiven.
    expect(gradeForTotal(80.9).grade).toBe("A");
    expect(gradeForTotal(70.99).grade).toBe("B+");
    expect(gradeForTotal(49.999).grade).toBe("F");
  });
});

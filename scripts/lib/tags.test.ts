import { describe, expect, it } from "vitest";
import { kindOf, subjectIndex, tagFile, unitOf } from "./tags.mjs";

const TOP = ["00_General_Admin", "AOOP_21CSC206P", "CodIn_Java", "DSA_21CSC201J", "DSA_Lab", "OS_21CSC202J", "ProfEth"];
const subjects = subjectIndex(TOP);

describe("subjectIndex", () => {
  it("reads codes and lends one to a sibling sharing its prefix", () => {
    expect(subjects.get("OS_21CSC202J")).toBe("21CSC202J");
    expect(subjects.get("DSA_Lab")).toBe("21CSC201J");
    expect(subjects.has("CodIn_Java")).toBe(false);
    expect(subjects.has("ProfEth")).toBe(false);
  });

  it("finds the code of a folder named by the course title alone", () => {
    const titles = new Map([["21CSC202J", "Operating Systems"], ["21CSC201J", "Data Structures and Algorithms"]]);
    const s = subjectIndex(["Operating_Systems", "Data_Structures_and_Algorithms", "Data_Structures_and_Algorithms_Lab", "Syllabi"], titles);
    expect(s.get("Operating_Systems")).toBe("21CSC202J");
    expect(s.get("Data_Structures_and_Algorithms_Lab")).toBe("21CSC201J");
    expect(s.has("Syllabi")).toBe(false);
  });
});

describe("unitOf", () => {
  it.each([
    ["02_Notes/Unit_3/x.pdf", 3],
    ["21CSC202J Operating Systems-Unit-III.pptx", 3],
    ["Unit-II_21CSC202J_OperatingSystem.pdf", 2],
    ["OS_Unit_1.pdf", 1],
    ["Unit1_OS.pptx", 1],
    ["unit 5 notes.pdf", 5],
    ["Unit2_Code_Examples/Main.java", 2],
  ])("%s → %s", (p, n) => expect(unitOf(p)).toBe(n));
  it("ignores words that merely contain 'unit'", () => {
    expect(unitOf("community_notes.pdf")).toBeNull();
    expect(unitOf("Units_overview.pdf")).toBeNull();
    expect(unitOf("x.pdf")).toBeNull();
  });
});

describe("kindOf", () => {
  it.each([
    ["OS_21CSC202J/02_Notes/Unit_1/OS_Unit_1.pdf", "notes"],
    ["OS_21CSC202J/04_Lab_Manual/Ex05.pdf", "lab"],
    ["OS_21CSC202J/07_PYQs/End_Sem/May_2023.pdf", "pyq"],
    ["DSA_21CSC201J/07_PYQs/Important_Topics/list.pdf", "pyq"],
    ["OS_21CSC202J/01_Syllabus_Plan_Handout/OS_Course_Plan.pdf", "syllabus"],
    ["OS_21CSC202J/09_Exercise_Guides/Ex3.pdf", "guide"],
    ["OS_21CSC202J/08_LLJ1_Lab_Test_Prep/code/p13.c", "guide"],
    ["OS_21CSC202J/05_WhatsApp/Unit1_Peer_Presentations/x.pptx", "whatsapp"],
    ["OS_21CSC202J/06_Notes_from_WhatsApp.pdf", "whatsapp"],
    ["DSA_Lab/02_Lab_Programs_C_(Ex1-6)/stack.c", "lab"],
    ["FDS_21CSS202T/03_Assignments_Tutorials/A1.pdf", "assignment"],
    ["PYQ_Index.pdf", "pyq"],
    ["00_OVERVIEW.pdf", "other"],
  ])("%s → %s", (p, k) => expect(kindOf(p)).toBe(k));
});

describe("tagFile", () => {
  it("combines the three", () => {
    expect(tagFile("OS_21CSC202J/02_Notes/Unit_3/slides.pptx", subjects)).toEqual({ subject_code: "21CSC202J", unit: 3, kind: "notes" });
    expect(tagFile("DSA_Lab/05_WhatsApp/x.pdf", subjects)).toEqual({ subject_code: "21CSC201J", unit: null, kind: "whatsapp" });
  });
  it("gives top-level files no subject, even with a code-looking name", () => {
    expect(tagFile("Deadlines_till_20_Nov_2026.pdf", subjects).subject_code).toBeNull();
  });
  it("reads the subject from a course code in the file name outside subject folders", () => {
    expect(tagFile("Syllabi/Sem_4/21MAB301T_Probability_and_Statistics_Syllabus.pdf", subjects)).toMatchObject({
      subject_code: "21MAB301T",
      kind: "syllabus",
    });
  });
});

describe("files outside a subject's folder", async () => {
  const { tagFile, subjectIndex } = await import("./tags.mjs");
  it("reads the kind off a top folder that is nobody's", () => {
    const subjects = subjectIndex(["OS_21CSC202J", "Syllabi"]);
    expect(tagFile("Syllabi/21CSE429T_Data_Science_for_IoT.pdf", subjects)).toMatchObject({
      kind: "syllabus",
      subject_code: "21CSE429T",
    });
    // A subject's own folder still says nothing about its files' kind.
    expect(tagFile("DSA_Lab/Ex1.pdf", subjectIndex(["DSA_21CSC201J", "DSA_Lab"])).kind).not.toBe("syllabus");
  });
});

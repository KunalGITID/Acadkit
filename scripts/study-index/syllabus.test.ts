import { describe, expect, it } from "vitest";
import { cleanTopics, isJunkTopic, parseSyllabusText, unitTopics } from "./syllabus.mjs";
import { withPdfUnits } from "./units.mjs";

// Verbatim text as the sync extracts it from the syllabus PDFs (21CSC206P,
// 21CSC201J, 21CSC202J, 21MAB201T, 21CSS202T), line breaks and all.
const AOOP = `Course
Code 21CSC206P Course
Name ADVANCED OBJECT ORIENTED PROGRAMMING Course
Category C PROFESSIONAL CORE L T P C
Unit-4 - Java Library 9 Hour
String Handling – String Constructors, String Length, Special String Operations -Character Extraction, String Comparison, Searching Strings, Modifying Strings, using valueOf(), Comparison of StringBuffer and
String.Collections framework - Collections overview, Collections Interfaces- Collection Interface, List Interface.
Tutorial:
1. Programs using Collection Interface and ArrayList Class
Unit-5 - Swings Fundamentals 9 Hour
Swing Key Features, Model View Controller (MVC), Swing Controls, Components and Containers, Swing Packages, Event Handling in Swings, Swing Layout Managers, Exploring Swings –JFrame, JLabel, The
Swing Buttons, and JTextField. Java Data Base Connectivity (JDBC) - JDBC overview, Creating and Executing Queries – create table, delete, insert, select.
Tutorial:
1. Form Design with Swing
2. Program with Java Data Base Connectivity (JDBC)
Learning
Resources
1. 2. 3. Herbert Schildt, Java: The Complete Reference, 8/e, Tata McGraw Hill, 2011.
Rajib Mall, Fundamentals of Software Engineering, 4th edition, PHI, 2014.
Paul Deitel, Harvey Deitel, Java How to Program, Early Objects 11th Edition, Pearson, 2018.
Learning Assessment
Continuous Learning Assessment (CLA)
B.Tech / M.Tech (Integrated) Programmes-Regulations 2021-Volume-11-CSE-(Updated – 2025) Syllabi-Control Copy`;

describe("parseSyllabusText", () => {
  const units = parseSyllabusText(AOOP, "21CSC206P");

  it("reads each chapter's title and hours", () => {
    expect(units.map((u) => [u.n, u.title, u.hours])).toEqual([
      [4, "Java Library", 9],
      [5, "Swings Fundamentals", 9],
    ]);
  });

  it("stops a chapter at its tutorial list and the Learning Resources", () => {
    const all = units.flatMap((u) => u.topics).join(" | ");
    for (const junk of ["Herbert Schildt", "8/e", "McGraw", "2011", "Pearson", "Form Design", "Learning", "Tutorial"])
      expect(all).not.toContain(junk);
    expect(units[1].topics).toEqual([
      "Swing Key Features",
      "Model View Controller (MVC)",
      "Swing Controls",
      "Components and Containers",
      "Swing Packages",
      "Event Handling in Swings",
      "Swing Layout Managers",
      "Exploring Swings – JFrame, JLabel, The Swing Buttons and JTextField",
      "Java Data Base Connectivity (JDBC) – JDBC overview",
      "Creating and Executing Queries – create table, delete, insert, select",
    ]);
  });

  it("splits at a full stop with no space after it", () => {
    expect(units[0].topics).toContain("Comparison of StringBuffer and String");
    expect(units[0].topics).toContain("Collections framework – Collections overview");
    expect(units[0].topics).toContain("Collections Interfaces – Collection Interface, List Interface");
  });

  it("keeps only the named course when a PDF holds two", () => {
    const two = `${AOOP}\nCourse\nCode 21CSE999T Course\nName OTHER\nUnit-1 - Something Else 9 Hour\nOther topic, Another topic`;
    expect(parseSyllabusText(two, "21CSC206P").map((u) => u.n)).toEqual([4, 5]);
    expect(parseSyllabusText(two, "21CSE999T")[0].topics).toEqual(["Other topic", "Another topic"]);
  });

  it("finds nothing in a file that is not that course's syllabus", () => {
    expect(parseSyllabusText("Notes on stacks. Push and pop.", "21CSC201J")).toEqual([]);
  });
});

describe("unitTopics", () => {
  it("keeps a heading with its parts, and splits a list of real topics", () => {
    expect(
      unitTopics(
        "Operations on Stack ADT – Create, Push, Pop, Top; Implementation of Stack ADT – Array and Linked; Applications - Infix to Postfix Conversion, Postfix Evaluation, Balancing symbols, Function Calls, Tower of Hanoi"
      )
    ).toEqual([
      "Operations on Stack ADT – Create, Push, Pop, Top",
      "Implementation of Stack ADT – Array and Linked",
      "Infix to Postfix Conversion",
      "Postfix Evaluation",
      "Balancing symbols",
      "Function Calls",
      "Tower of Hanoi",
    ]);
    expect(unitTopics("Types – Singly, Doubly, Circular; Minimum spanning tree – Prims Algorithm, Kruskal’s Algorithm")).toEqual([
      "Types – Singly, Doubly, Circular",
      "Minimum spanning tree – Prims Algorithm, Kruskal’s Algorithm",
    ]);
  });

  it("keeps a short heading on topics that need it", () => {
    expect(unitTopics("Basic Concepts, Scheduling Criteria. Deadlocks: System Model, Deadlock Characterization, Deadlock Avoidance")).toEqual([
      "Basic Concepts",
      "Scheduling Criteria",
      "Deadlocks: System Model",
      "Deadlock Characterization",
      "Deadlock Avoidance",
    ]);
  });

  it("reads a maths chain of dashes as separate topics", () => {
    expect(
      unitTopics(
        "Fourier transform pair – Properties -Fourier sine and cosine transforms – Properties– Transforms of simple functions - Convolution theorem (without proof) – Parseval’s identity"
      )
    ).toEqual([
      "Fourier transform pair – Properties",
      "Fourier sine and cosine transforms – Properties",
      "Transforms of simple functions",
      "Convolution theorem (without proof)",
      "Parseval’s identity",
    ]);
    expect(unitTopics("Z - transforms – Properties of Z transforms – Inverse Z transforms")).toEqual([
      "Z-transforms",
      "Properties of Z transforms",
      "Inverse Z transforms",
    ]);
  });

  it("keeps compounds whole and splits hyphens that separate", () => {
    expect(unitTopics("Thread Scheduling, Multiple-Processor Scheduling, Real-Time CPU Scheduling")).toEqual([
      "Thread Scheduling",
      "Multiple-Processor Scheduling",
      "Real-Time CPU Scheduling",
    ]);
    expect(unitTopics("Facets of data, The data science process-Introduction to Python Libraries: Numpy, creating array, attributes")).toEqual([
      "Facets of data",
      "The data science process",
      "Introduction to Python Libraries – Numpy, creating array, attributes",
    ]);
    expect(unitTopics("Introduction-Scope-IF Statements-Loops -While Loops-For Loop-Recursion")).toEqual([
      "Introduction",
      "Scope",
      "IF Statements",
      "Loops",
      "While Loops",
      "For Loop",
      "Recursion",
    ]);
  });

  it("treats a topic written as an instruction as a topic, not a heading", () => {
    expect(
      unitTopics(
        "HTTP webserver concepts - Use HTTP request and response objects, Create Views, Use URLConf - URL Mapping, Introduction to Django Template System, Implement Regular Expression and its Basic Functions - findall(),search(),split(),sub(),Use Classes, Objects, and Attributes"
      )
    ).toEqual([
      "HTTP webserver concepts",
      "Use HTTP request and response objects",
      "Create Views",
      "Use URLConf – URL Mapping",
      "Introduction to Django Template System",
      "Implement Regular Expression and its Basic Functions – findall(), search(), split(), sub()",
      "Use Classes, Objects and Attributes",
    ]);
  });

  it("removes a page footer that falls inside a chapter", () => {
    expect(
      unitTopics("Swapping, Paging\nB.Tech / M.Tech (Integrated) Programmes-Regulations 2021-Volume-11-CSE-(Updated 2025) Syllabi-Control Copy\nThrashing")
    ).toEqual(["Swapping", "Paging", "Thrashing"]);
  });
});

describe("cleanTopics", () => {
  it("cuts a chapter list where the book references begin", () => {
    // acadkit_syllabi.json's AOOP unit 5, as the app showed it.
    expect(
      cleanTopics([
        "Creating and Executing Queries",
        "Program with Java Data Base Connectivity (JDBC) Learning Resources 1",
        "Herbert Schildt",
        "Java: The Complete Reference",
        "8/e",
        "Tata McGraw Hill",
        "2011",
        "Rajib Mall",
      ])
    ).toEqual(["Creating and Executing Queries"]);
  });

  it("drops years, editions and tutorial items, keeps real topics", () => {
    expect(cleanTopics(["Heaps", "2014", "T1: Using Numpy implement slicing", "Garbage Collection", "heaps", "Herbert Schildt", "Java: The Complete Reference", "8/e"])).toEqual([
      "Heaps",
      "Garbage Collection",
    ]);
    expect(isJunkTopic("8/e")).toBe(true);
    expect(isJunkTopic("Lexical Issues")).toBe(false);
  });
});

describe("withPdfUnits", () => {
  const course = {
    code: "21CSC206P",
    title: "Advanced Object Oriented Programming",
    file: "AOOP_21CSC206P/01_Syllabus_Plan_Handout/21CSC206P_Syllabus.pdf",
    units: [
      { n: 4, title: "Java Library", topics: ["String Handling"] },
      { n: 5, title: "Swings Fundamentals", topics: ["JFrame", "Herbert Schildt", "8/e", "2011"] },
    ],
  };
  const pdf = { path: course.file, ext: "pdf", kind: "syllabus", key: "0404/blobs/abc.pdf", full: "/x.pdf" };

  it("replaces a course's chapters with its syllabus PDF's", async () => {
    const out = await withPdfUnits({ [course.code]: course }, [pdf], { read: async () => ({ pages: [AOOP] }), log: () => {} });
    expect(out[course.code].units[1].topics).toContain("Swing Layout Managers");
    expect(out[course.code].units[1].topics).not.toContain("Herbert Schildt");
    expect(out[course.code].title).toBe(course.title);
  });

  it("cleans the JSON's topics when there is no PDF to read", async () => {
    const out = await withPdfUnits({ [course.code]: course }, [], { log: () => {} });
    expect(out[course.code].units[1].topics).toEqual(["JFrame"]);
  });

  it("skips a lesson plan filed beside the syllabus", async () => {
    const plan = { ...pdf, path: "AOOP_21CSC206P/01_Syllabus_Plan_Handout/Lesson_Plan.pdf", key: "0404/blobs/plan.pdf", full: "/plan.pdf" };
    const syl = { ...pdf, path: "AOOP_21CSC206P/01_Syllabus_Plan_Handout/21CSC206P.pdf", key: "0404/blobs/syl.pdf", full: "/syl.pdf" };
    const read = async (full: string) => ({
      pages: [full === "/plan.pdf" ? "Lesson plan 21CSC206P\nUnit-4 - Java Library 9 Hour\nWeek 1" : AOOP],
    });
    const out = await withPdfUnits({ [course.code]: { ...course, file: null } }, [plan, syl], { read, log: () => {} });
    expect(out[course.code].units[1].topics).toContain("Swing Layout Managers");
  });

  it("does not trust a PDF that yields fewer chapters than the JSON has", async () => {
    const out = await withPdfUnits({ [course.code]: course }, [pdf], {
      read: async () => ({ pages: ["Unit-4 - Java Library 9 Hour\nString Handling"] }),
      log: () => {},
    });
    expect(out[course.code].units.map((u) => u.n)).toEqual([4, 5]);
    expect(out[course.code].units[1].topics).toEqual(["JFrame"]);
  });
});

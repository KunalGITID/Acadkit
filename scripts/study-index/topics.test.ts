import { describe, expect, it } from "vitest";
import {
  clusterVectors,
  groupBySyllabus,
  labelClusters,
  matchSyllabus,
  paperId,
  paperYear,
  pastPapers,
  splitAnswer,
  splitQuestions,
  syllabusIndex,
} from "./topics.mjs";

// Syllabus lines as the university prints them (21CSC201J, 21CSC202J), cut
// on commas and semicolons the way acadkit_syllabi.json holds them.
const cut = (n: number, unitTitle: string, line: string) =>
  line.split(/[,;]\s*/).map((topic) => ({ n, unitTitle, topic }));
const DSA = syllabusIndex(
  [
    ...cut(1, "Introduction", "Data Structure – Definition, Types, ADT, Operations; Mathematical notations - Big O, Omega and Theta, Complexity – Time, Space, Trade off"),
    ...cut(2, "List Structure", "Operations on List ADT – Create, Insert, Search, Delete, Display elements; Implementation of List ADT– Array, Cursor based and Linked; Types – Singly, Doubly, Circular; Applications - Sparse Matrix, Polynomial Arithmetic, Joseph Problem"),
    ...cut(3, "Stack and Queue", "Operations on Stack ADT – Create, Push, Pop, Top; Implementation of Stack ADT – Array and Linked; Applications - Infix to Postfix Conversion, Postfix Evaluation, Balancing symbols, Function Calls, Tower of Hanoi"),
    ...cut(4, "Trees and Hashing", "Introduction to Trees, Tree traversals, Binary Search Trees, AVL trees, B Trees, Heaps"),
  ],
  { title: "Data Structures and Algorithms" }
);
const OS = syllabusIndex(
  [
    ...cut(3, "CPU Scheduling", "Basic Concepts, Scheduling Criteria, Scheduling Algorithms"),
    { n: 3, unitTitle: "CPU Scheduling", topic: "Deadlocks: System Model" },
    { n: 3, unitTitle: "CPU Scheduling", topic: "Deadlock Avoidance" },
    ...cut(4, "Memory Management", "Paging, Structure of the Page Table, Page Replacement, Thrashing"),
  ],
  { title: "Operating Systems" }
);
const topicOf = (q: string, idx = DSA) => {
  const m = matchSyllabus(q, idx);
  return m && (m.name ? `${m.group} — ${m.name}` : m.group);
};

describe("matchSyllabus", () => {
  it("files one-word items under their heading, never on their own", () => {
    expect(topicOf("Suppose a stack of size 4: PUSH(10), PUSH(20), POP(). What is on top?")).toBe("Operations on Stack ADT — Push");
    expect(topicOf("A singly linked list contains 10 → 20 → 30. What does the code print?")).toBe("Types of List Structure — Singly");
    expect(topicOf("What is the time complexity of binary search on n sorted items?")).toBe("Complexity — Time");
  });
  it("needs the heading's subject, not just the item's word", () => {
    // "delete" in a stack question is not the list operation.
    expect(topicOf("The operation displays the topmost value but will not delete it from the stack")).not.toMatch(/List ADT/);
    // "called" is not "Function Calls".
    expect(topicOf("In binary tree traversal, visiting root, then left, then right is called")).not.toBe("Function Calls");
  });
  it("keeps a real one-word topic as its own", () => {
    expect(topicOf("Insert 70 into the max heap and heapify; show the heaps after each step")).toBe("Heaps");
  });
  it("does not let the course's own name decide", () => {
    expect(topicOf("Which is the most appropriate data structure for reversing a word?")).toBeNull();
  });
  it("keeps a heading where the item needs it, drops it where it repeats", () => {
    expect(topicOf('In the deadlock system model, what is meant by "mutual exclusion"?', OS)).toBe("Deadlocks: System Model");
    expect(topicOf("Consider a system with three processes and two printers", OS)).toBeNull();
    expect(topicOf("Using the banker's algorithm for deadlock avoidance, is the state safe?", OS)).toBe("Deadlock Avoidance");
    expect(topicOf("Which page replacement algorithm suffers from Belady's anomaly?", OS)).toBe("Page Replacement");
  });
});

describe("groupBySyllabus", () => {
  it("counts questions under their topic and names the items asked", () => {
    const groups = groupBySyllabus(
      ["Write the algorithm for PUSH on a stack", "Explain POP on a stack with overflow check", "Convert the infix expression a+b*c to postfix", "What colour is the sky"],
      [],
      DSA
    );
    expect(groups.map((g) => [g.label, g.n, g.members])).toEqual([
      ["Operations on Stack ADT — Push, Pop", 3, [0, 1]],
      ["Infix to Postfix Conversion", 3, [2]],
    ]);
  });
});

describe("which files are papers", () => {
  const file = (p: string) => ({ path: p, ext: p.split(".").pop()!.toLowerCase(), key: `x/blobs/${p.length}.pdf`, full: `/tmp/${p}` });

  it("finds papers under 07_PYQs/<test>/ in coded subject folders", () => {
    const subjects = pastPapers([
      file("OS_21CSC202J/07_PYQs/End_Sem/May_2023.pdf"),
      file("OS_21CSC202J/07_PYQs/End_Sem/Nov_2024.pdf"),
      file("OS_21CSC202J/02_Notes/Unit1.pdf"), // not a paper
      file("DSA_Lab/07_PYQs/x.pdf"), // no course code
      file("DSA_21CSC201J/07_PYQs/Important_Topics/list.pdf"), // not a paper
      file("DSA_21CSC201J/07_PYQs/FJ-III/2024_FJ-III_SetC_photo_20241106-WA0034.jpg"),
      file("DSA_21CSC201J/07_PYQs/FJ-III/2024_FJ-III_SetC_photo_20241106-WA0035.jpg"),
    ]);
    const os = subjects.find((s) => s.subjectCode === "21CSC202J")!;
    expect(os.papers.map((p) => [p.group, p.year])).toEqual([["End_Sem", 2023], ["End_Sem", 2024]]);
    const dsa = subjects.find((s) => s.subjectCode === "21CSC201J")!;
    // Two photos, one paper.
    expect(dsa.papers).toHaveLength(1);
    expect(dsa.papers[0].files).toHaveLength(2);
  });

  it("reads a paper's identity and year off its path", () => {
    expect(paperId("A/07_PYQs/FJ-II/2024_CT2_SetD.pdf")).toBe("A/07_PYQs/FJ-II/2024_CT2_SetD");
    expect(paperYear("A/07_PYQs/End_Sem/May_2025.pdf")).toBe(2025);
    expect(paperYear("A/07_PYQs/End_Sem/More.pdf")).toBeNull();
  });
});

describe("splitQuestions", () => {
  it("splits at question numbers and at (OR), dropping marks columns", () => {
    const page = [
      "SRM INSTITUTE OF SCIENCE AND TECHNOLOGY",
      "SRM Nagar, Kattankulathur – 603203, Chengalpattu District",
      "B.Tech. DEGREE EXAMINATION, MAY 2023",
      "21CSC202J – OPERATING SYSTEMS",
      "Reg. No.",
      "PART - B",
      "30. a. Describe a solution to the dining philosopher problem so that no race",
      "condition arises.",
      "12",
      "(OR)",
      "b. Consider the following snapshot and answer using bankers algorithm",
      "3 4",
      "31. a. Explain the first fit, best fit and worst fit allocation algorithms",
      "Page 4 of 4",
    ].join("\n");
    expect(splitQuestions(page)).toEqual([
      "Describe a solution to the dining philosopher problem so that no race condition arises.",
      "Consider the following snapshot and answer using bankers algorithm",
      "Explain the first fit, best fit and worst fit allocation algorithms",
    ]);
  });

  it("ignores fragments too short to be a question", () => {
    expect(splitQuestions("1. (a)\n2. Yes")).toEqual([]);
  });

  it("keeps an MCQ's stem and drops its options", () => {
    expect(splitQuestions("1. Device controller informs CPU that it has finished its operation by causing (A) Interrupt (B) Message (C) Information (D) Command")).toEqual([
      "Device controller informs CPU that it has finished its operation by causing",
    ]);
    expect(splitQuestions("2. What is the primary goal of protection in a computer system? A) To maximize performance B) To prevent access")).toEqual([
      "What is the primary goal of protection in a computer system?",
    ]);
  });

  it("splits (a)/(b) parts, and drops instructions and page footers", () => {
    const page = [
      "Third & Fourth Semester",
      "ii. Part - B and Part - C should be answered in answer booklet.",
      "21. (a) Explain the concept of CPU scheduling and its criteria. (b) Write a note on monolithic and layered OS structure",
      "29MF3&4-21CSC202J",
    ].join("\n");
    expect(splitQuestions(page)).toEqual([
      "Explain the concept of CPU scheduling and its criteria.",
      "Write a note on monolithic and layered OS structure",
    ]);
  });

  it("splits a photographed paper that lost its question numbers at the question's first word", () => {
    const photo = [
      "Explain the important components of the Java development",
      "environment, including JDK, compiler, JRE, JVM and bytecode.",
      "Write a Java program to generate a three-digit lottery number and",
      "determine the prize based on the following rules:",
      "If the user's input matches the lottery number in the exact order,",
      "the prize is $10,000.",
      "Implement a Java Swing program to create a simple Login Form",
      "using JLabel, JTextField, JPasswordField, and JButton.",
      "When the Login button is clicked, display a message.",
      "Differentiate between FlowLayout, BorderLayout and GridLayout",
      "based on how they arrange components.",
      "Page 1",
      "Marks",
    ].join("\n");
    const qs = splitQuestions(photo);
    expect(qs).toHaveLength(4);
    expect(qs[2]).toMatch(/^Implement a Java Swing program/);
  });
});

describe("clusterVectors", () => {
  const unit = (v: number[]) => {
    const n = Math.hypot(...v);
    return v.map((x) => x / n);
  };

  it("groups near-identical directions and keeps different ones apart", () => {
    const vectors = [unit([1, 0.05, 0]), unit([1, 0, 0.05]), unit([0, 1, 0]), unit([0.02, 1, 0]), unit([0, 0, 1])];
    const clusters = clusterVectors(vectors, 0.9).map((c) => [...c].sort()).sort((a, b) => a[0] - b[0]);
    expect(clusters).toEqual([[0, 1], [2, 3], [4]]);
  });

  it("handles nothing", () => {
    expect(clusterVectors([])).toEqual([]);
  });
});

describe("labelClusters", () => {
  it("names each cluster by what sets it apart", () => {
    const labels = labelClusters([
      ["Explain the banker's algorithm with an example", "Using banker's algorithm, is the system in a safe state"],
      ["Explain LRU page replacement", "Count page faults for FIFO page replacement"],
    ]);
    expect(labels[0]).toContain("bankers algorithm");
    expect(labels[1]).toContain("page replacement");
    // A chosen bigram suppresses its own words.
    expect(labels[1].split(" · ")).not.toContain("page");
  });

  it("skips the newer letterhead", () => {
    const page = [
      "SCHOOL OF COMPUTING",
      "Course Articulation Matrix: PO1 PO2 PSO1",
      "CO1 PO3 PSO2 3 2 1",
      "Year/Sem: II/III",
      "1. Explain the working of a circular queue with an example of insertion",
    ].join("\n");
    expect(splitQuestions(page)).toEqual(["Explain the working of a circular queue with an example of insertion"]);
  });

  it("drops a header that OCR ran together, typos and all", () => {
    const headers = [
      "RA25127040 10009 Academie Year: 2026-27 (ODD) Test: FP-1 S.No. Course POZ POS Outcome COL C04 Date: 17.09.2026 (5 x 4 - 20 Marks)",
      "Test: FJ - III Date: 06/11//2024 Course Outcome PO PO PO PO Program Specific Outcomes PSO-1 PSO-2 Q. No Question Marks BL C O",
    ];
    for (const h of headers) expect(splitQuestions(h)).toEqual([]);
    // One marker is a question that happens to mention a date.
    expect(splitQuestions("1. Write a program that parses a date: dd/mm/yyyy and prints the day")).toHaveLength(1);
  });

  it("never names a topic after algebra", () => {
    const [label] = labelClusters([["solve y+x = 2 by fourier series", "fourier series of y+x"]]);
    expect(label).not.toMatch(/y\+x/);
  });

  it("never names a topic after a course code", () => {
    const [label] = labelClusters([["15CS302J paging and segmentation", "15CS302J paging with segmentation"]]);
    expect(label).not.toMatch(/15cs302j/);
    expect(label).toContain("paging");
  });
});

describe("splitAnswer", () => {
  it("keeps an answer key's answer apart from its question", () => {
    expect(splitAnswer("What is the postfix of (A + B) * C? Answer: A B + C *")).toEqual({
      text: "What is the postfix of (A + B) * C?",
      answer: "A B + C *",
    });
    expect(splitAnswer("Convert A + B * C to postfix. Ans: A B C * +").answer).toBe("A B C * +");
  });
  it("leaves a plain question alone", () => {
    expect(splitAnswer("Explain the answer set of a query language.")).toEqual({
      text: "Explain the answer set of a query language.",
    });
  });
});

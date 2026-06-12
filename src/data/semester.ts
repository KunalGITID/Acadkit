/**
 * Canonical academic calendar for the current semester (SRM KTR).
 *
 * Edit this file each new semester: update the window, the official
 * holiday list, and the date → Day Order map. The map already bakes in
 * the rotation (it skips weekends and the official holidays below).
 * User-declared holidays are layered on top at runtime and auto-shift
 * the remaining day orders forward — see src/lib/calendar.ts.
 */

export const SEMESTER_START = "2026-07-21";
export const SEMESTER_END = "2026-11-18";

export const OFFICIAL_HOLIDAYS: Record<string, string> = {
  "2026-08-26": "Milad-un-Nabi",
  "2026-09-04": "Krishna Jayanthi",
  "2026-09-14": "Vinayakar Chathurthi",
  "2026-10-02": "Gandhi Jayanthi",
  "2026-10-19": "Ayutha Pooja",
  "2026-10-20": "Vijaya Dasami",
  "2026-11-08": "Deepavali",
};

export const DAY_ORDER_MAP: Record<string, number> = {
  "2026-07-21": 1, "2026-07-22": 2, "2026-07-23": 3, "2026-07-24": 4, "2026-07-27": 5,
  "2026-07-28": 1, "2026-07-29": 2, "2026-07-30": 3, "2026-07-31": 4, "2026-08-03": 5,
  "2026-08-04": 1, "2026-08-05": 2, "2026-08-06": 3, "2026-08-07": 4, "2026-08-10": 5,
  "2026-08-11": 1, "2026-08-12": 2, "2026-08-13": 3, "2026-08-14": 4, "2026-08-17": 5,
  "2026-08-18": 1, "2026-08-19": 2, "2026-08-20": 3, "2026-08-21": 4, "2026-08-24": 5,
  "2026-08-25": 1, "2026-08-27": 2, "2026-08-28": 3, "2026-08-31": 4, "2026-09-01": 5,
  "2026-09-02": 1, "2026-09-03": 2, "2026-09-07": 3, "2026-09-08": 4, "2026-09-09": 5,
  "2026-09-10": 1, "2026-09-11": 2, "2026-09-15": 3, "2026-09-16": 4, "2026-09-17": 5,
  "2026-09-18": 1, "2026-09-21": 2, "2026-09-22": 3, "2026-09-23": 4, "2026-09-24": 5,
  "2026-09-25": 1, "2026-09-28": 2, "2026-09-29": 3, "2026-09-30": 4, "2026-10-01": 5,
  "2026-10-05": 1, "2026-10-06": 2, "2026-10-07": 3, "2026-10-08": 4, "2026-10-09": 5,
  "2026-10-12": 1, "2026-10-13": 2, "2026-10-14": 3, "2026-10-15": 4, "2026-10-16": 5,
  "2026-10-21": 1, "2026-10-22": 2, "2026-10-23": 3, "2026-10-26": 4, "2026-10-27": 5,
  "2026-10-28": 1, "2026-10-29": 2, "2026-10-30": 3, "2026-11-02": 4, "2026-11-03": 5,
  "2026-11-04": 1, "2026-11-05": 2, "2026-11-06": 3, "2026-11-09": 4, "2026-11-10": 5,
  "2026-11-11": 1, "2026-11-12": 2, "2026-11-13": 3, "2026-11-16": 4, "2026-11-17": 5,
  "2026-11-18": 1,
};

/** Starting subject list, seeded for fresh PINs. */
export const SEED_SUBJECTS: Array<{
  code: string;
  name: string;
  credits: number;
  type: "theory" | "lab";
  color_hex: string;
}> = [
  { code: "21CSC201J", name: "Data Structures & Algorithms", credits: 4, type: "theory", color_hex: "#7c6af7" },
  { code: "21CSC202J", name: "Operating Systems", credits: 4, type: "theory", color_hex: "#f97316" },
  { code: "21DCS201P", name: "Design Thinking & Methodology", credits: 3, type: "theory", color_hex: "#22d3ee" },
  { code: "21MAB201T", name: "Transforms & Boundary Value Problems", credits: 4, type: "theory", color_hex: "#4ade80" },
  { code: "21CSS202T", name: "Fundamentals of Data Science", credits: 5, type: "theory", color_hex: "#f472b6" },
  { code: "21CSC206P", name: "Advanced OOP", credits: 3, type: "theory", color_hex: "#facc15" },
  { code: "21LEM201T", name: "Professional Ethics", credits: 0, type: "theory", color_hex: "#fb7185" },
  { code: "21PDM201L", name: "Verbal Reasoning", credits: 0, type: "theory", color_hex: "#a78bfa" },
];

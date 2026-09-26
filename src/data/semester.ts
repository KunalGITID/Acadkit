/**
 * Canonical academic calendar for the current semester (SRM KTR).
 *
 * Edit this file each new semester: update the window and the official
 * holiday list. The date → Day Order rotation is generated from them at
 * runtime (weekends and these holidays skipped), with user-declared
 * holidays layered on top to shift the rest forward — see
 * src/lib/calendar.ts.
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

import {
  BookOpen,
  BookOpenCheck,
  CalendarDays,
  Clock3,
  GraduationCap,
  History,
  House,
  LifeBuoy,
  ListX,
  Settings,
  UserCheck,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Shown under the label in the More sheet, where there's room. */
  blurb?: string;
}

/**
 * The bottom bar, and the top of the sidebar. Exactly five — an iOS tab
 * bar shows no more, and these are the destinations used daily.
 */
export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Home", icon: House },
  { to: "/attendance", label: "Attendance", icon: UserCheck },
  { to: "/marks", label: "Marks", icon: GraduationCap },
  { to: "/timetable", label: "Timetable", icon: Clock3 },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
];

/**
 * Everything that doesn't fit the five-item bar.
 *
 * The sidebar lists these inline on desktop; on mobile — and especially
 * in an installed iOS PWA, where there is no browser UI to fall back on
 * — they are only reachable through the More sheet, so this list is the
 * single source for both.
 */
export const SECONDARY_NAV: NavItem[] = [
  { to: "/survival", label: "Survival", icon: LifeBuoy, blurb: "Which days you can skip" },
  { to: "/log", label: "Absences", icon: ListX, blurb: "Every period you've missed" },
  { to: "/study-log", label: "Study log", icon: BookOpenCheck, blurb: "Hours you've studied, by subject" },
  { to: "/history", label: "History", icon: History, blurb: "Past semesters and CGPA" },
  // No Wrapped: it plays once, when you archive a semester (History),
  // rather than sitting here to be opened any day of the term.
];

/** Contents of the More sheet. Settings has its own button, so it's not repeated here. */
export const MORE_NAV: NavItem[] = SECONDARY_NAV;

/**
 * The study folder has its own place — a book in the top bar on the
 * phone, its own row in the sidebar — rather than a line in More. It is
 * opened daily in exam weeks, and More is for the occasional pages.
 */
export const STUDY_ITEM: NavItem = { to: "/files", label: "Study", icon: BookOpen, blurb: "Your study folder, on every device" };

export const SETTINGS_ITEM: NavItem = { to: "/settings", label: "Settings", icon: Settings };

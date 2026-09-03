import {
  CalendarDays,
  Clock3,
  GraduationCap,
  History,
  House,
  ListX,
  Settings,
  Sparkles,
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
  { to: "/insights", label: "Insights", icon: Sparkles, blurb: "Projections, risk and what-ifs" },
  { to: "/log", label: "Absences", icon: ListX, blurb: "Every period you've missed" },
  { to: "/history", label: "History", icon: History, blurb: "Past semesters and CGPA" },
];

/** Contents of the More sheet. Settings has its own button, so it's not repeated here. */
export const MORE_NAV: NavItem[] = SECONDARY_NAV;

export const SETTINGS_ITEM: NavItem = { to: "/settings", label: "Settings", icon: Settings };

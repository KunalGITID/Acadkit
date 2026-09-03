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
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Home", icon: House },
  { to: "/attendance", label: "Attendance", icon: UserCheck },
  { to: "/marks", label: "Marks", icon: GraduationCap },
  { to: "/insights", label: "Insights", icon: Sparkles },
  { to: "/timetable", label: "Timetable", icon: Clock3 },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
];

/**
 * Reachable from the sidebar and from Settings, but kept out of the
 * bottom bar — five targets is already the most a thumb wants.
 */
export const SECONDARY_NAV: NavItem[] = [
  { to: "/log", label: "Absences", icon: ListX },
  { to: "/history", label: "History", icon: History },
];

export const SETTINGS_ITEM: NavItem = { to: "/settings", label: "Settings", icon: Settings };

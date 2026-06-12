import {
  CalendarDays,
  Clock3,
  GraduationCap,
  House,
  Settings,
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
  { to: "/timetable", label: "Timetable", icon: Clock3 },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
];

export const SETTINGS_ITEM: NavItem = { to: "/settings", label: "Settings", icon: Settings };

import { Calendar, CalendarDays, ClipboardList, Home, LayoutGrid } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Home", icon: Home },
  { to: "/marks", label: "Marks", icon: ClipboardList },
  { to: "/attendance", label: "Attendance", icon: LayoutGrid },
  { to: "/timetable", label: "Timetable", icon: CalendarDays },
  { to: "/calendar", label: "Calendar", icon: Calendar },
] as const;

export function BottomNav() {
  const location = useLocation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#1e1e2e] bg-[#0a0a0f]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Main navigation"
    >
      <div className="flex h-16 items-center justify-around px-2">
        {navItems.map(({ to, label, icon: Icon }) => {
          const isActive =
            to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);

          return (
            <Link
              key={to}
              to={to}
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-h-[44px] flex-1 flex-col items-center justify-center gap-1 rounded-lg text-xs transition-colors",
                "focus-visible:outline-2 focus-visible:outline-[#7c6af7]",
                isActive ? "text-[#7c6af7]" : "text-[#8a8aaa] hover:text-foreground"
              )}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { NAV_ITEMS, SECONDARY_NAV, SETTINGS_ITEM } from "@/components/layout/nav-items";
import { DayOrderChip } from "@/components/layout/day-order-chip";
import { cn } from "@/lib/utils";

export function Sidebar() {

  return (
    <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-surface/50 px-4 py-6 lg:flex">
      <div className="flex items-center gap-2.5 px-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-accent text-white shadow-pop">
          <Sparkles className="h-[18px] w-[18px]" />
        </div>
        <span className="text-lg font-extrabold tracking-tight">AcadKit</span>
      </div>

      <div className="mt-6 px-1">
        <DayOrderChip expanded />
      </div>

      <nav className="mt-6 flex flex-1 flex-col gap-1" aria-label="Primary">
        {[...NAV_ITEMS, ...SECONDARY_NAV, SETTINGS_ITEM].map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === "/"}>
            {({ isActive }) => (
              <span
                className={cn(
                  "relative flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition-colors",
                  isActive ? "text-accent" : "text-muted hover:bg-surface-2/70 hover:text-ink"
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="sidebar-pill"
                    className="absolute inset-0 rounded-2xl bg-accent/10"
                    transition={{ type: "spring", stiffness: 450, damping: 35 }}
                  />
                )}
                <item.icon className="relative z-10 h-[18px] w-[18px]" strokeWidth={2.2} />
                <span className="relative z-10">{item.label}</span>
              </span>
            )}
          </NavLink>
        ))}
      </nav>

    </aside>
  );
}

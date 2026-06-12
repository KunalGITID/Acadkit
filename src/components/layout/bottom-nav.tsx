import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { cn, haptic } from "@/lib/utils";

export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav
      aria-label="Primary"
      className="glass fixed inset-x-0 bottom-0 z-30 border-t pb-safe-b lg:hidden"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-2 py-2">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => haptic()}
              className="relative flex w-16 flex-col items-center gap-1 rounded-2xl py-1.5"
              aria-current={active ? "page" : undefined}
            >
              {active && (
                <motion.span
                  layoutId="bottom-nav-pill"
                  className="absolute inset-0 rounded-2xl bg-accent/12"
                  transition={{ type: "spring", stiffness: 450, damping: 35 }}
                />
              )}
              <item.icon
                className={cn(
                  "relative z-10 h-[22px] w-[22px] transition-colors",
                  active ? "text-accent" : "text-muted"
                )}
                strokeWidth={active ? 2.4 : 2}
              />
              <span
                className={cn(
                  "relative z-10 text-[10px] font-bold transition-colors",
                  active ? "text-accent" : "text-muted"
                )}
              >
                {item.label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

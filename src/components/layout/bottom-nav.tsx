import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { useNavCollapsed } from "@/hooks/useNavCollapsed";
import { useSwipe } from "@/hooks/useSwipe";
import { cn, haptic } from "@/lib/utils";

export function BottomNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const collapsed = useNavCollapsed();

  // Swiping the bar itself walks the tabs, so you can change page
  // without aiming at a 44px target one-handed.
  const index = NAV_ITEMS.findIndex((i) => i.to === pathname);
  const go = (delta: number) => {
    if (index < 0) return;
    const next = NAV_ITEMS[index + delta];
    if (!next) return;
    haptic();
    navigate(next.to);
  };
  const swipe = useSwipe(() => go(1), () => go(-1), { threshold: 40 });
  return (
    <nav
      aria-label="Primary"
      /* The safe-area inset is a clearance requirement, not a margin.
         Honouring it in full left a dead strip of background under the
         bar taller than the labels themselves — real screen area spent
         on a home indicator that needs a fraction of it. Trimmed to
         what actually keeps the tap targets clear of the gesture bar,
         with a floor so a device reporting nothing still gets some. */
      className="glass fixed inset-x-0 bottom-0 z-30 border-t pb-[max(0.25rem,calc(env(safe-area-inset-bottom)-0.6rem))] lg:hidden"
      data-swipe
      {...swipe}
    >
      <div
        className={cn(
          "mx-auto flex max-w-lg items-stretch justify-around px-1 transition-[padding] duration-200",
          collapsed ? "pb-0.5 pt-1" : "pb-1 pt-1.5"
        )}
      >
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => haptic()}
              className="relative flex flex-1 basis-0 flex-col items-center gap-1 rounded-2xl py-1.5"
              aria-current={active ? "page" : undefined}
            >
              {active && (
                <motion.span
                  layoutId="bottom-nav-pill"
                  data-nav-pill
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
              {/* The label is what goes. The icon and the pill are what
                  make a tab findable at a glance; the word underneath is
                  reassurance you stop needing after the first week. */}
              <motion.span
                initial={false}
                animate={{
                  height: collapsed ? 0 : "auto",
                  opacity: collapsed ? 0 : 1,
                }}
                transition={{ type: "spring", stiffness: 400, damping: 34 }}
                className={cn(
                  "relative z-10 overflow-hidden text-[9.5px] font-bold leading-[1.2] transition-colors",
                  active ? "text-accent" : "text-muted"
                )}
              >
                {item.label}
              </motion.span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

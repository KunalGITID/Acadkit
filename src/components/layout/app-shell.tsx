import { Suspense, useEffect, useRef } from "react";
import { Link, NavLink, useLocation, useOutlet } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Settings, Sparkles } from "lucide-react";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Sidebar } from "@/components/layout/sidebar";
import { OfflineBanner } from "@/components/layout/offline-banner";
import { Skeleton } from "@/components/ui/misc";
import { useSync } from "@/hooks/useSync";
import { cn, haptic } from "@/lib/utils";

function PageFallback() {
  return (
    <div className="space-y-4 pt-2">
      <Skeleton className="h-9 w-44" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-28 w-full" />
    </div>
  );
}

/** The five bottom-nav tabs, in on-screen order — used to tell which way to slide. */
const TAB_ROUTES = ["/", "/attendance", "/marks", "/timetable", "/calendar"];

/** +1/-1 when moving between two tabs (which way to slide); 0 for any other navigation (fade instead). */
function useTabSlideDirection(pathname: string) {
  const prevPathname = useRef(pathname);
  const prevIndex = TAB_ROUTES.indexOf(prevPathname.current);
  const currentIndex = TAB_ROUTES.indexOf(pathname);
  const direction =
    prevPathname.current !== pathname && prevIndex !== -1 && currentIndex !== -1
      ? currentIndex > prevIndex
        ? 1
        : -1
      : 0;

  useEffect(() => {
    prevPathname.current = pathname;
  }, [pathname]);

  return direction;
}

const pageVariants = {
  enter: (direction: number) =>
    direction === 0
      ? { opacity: 0, x: 0, y: 14, scale: 0.995 }
      : { opacity: 0, x: direction > 0 ? 44 : -44, y: 0, scale: 1 },
  center: { opacity: 1, x: 0, y: 0, scale: 1 },
  exit: (direction: number) =>
    direction === 0
      ? { opacity: 0, x: 0, y: -10, scale: 0.995 }
      : { opacity: 0, x: direction > 0 ? -44 : 44, y: 0, scale: 1 },
};

export function AppShell() {
  useSync();
  const location = useLocation();
  const outlet = useOutlet();
  const direction = useTabSlideDirection(location.pathname);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_1fr]">
      <Sidebar />

      <div className="flex min-w-0 flex-col">
        {/* Mobile top bar */}
        <header className="glass sticky top-0 z-30 border-b pt-safe-t lg:hidden">
          <div className="flex items-center justify-between px-4 py-2.5">
            <Link to="/" className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-white">
                <Sparkles className="h-4 w-4" />
              </span>
              <span className="text-[17px] font-extrabold tracking-tight">AcadKit</span>
            </Link>
            <div className="flex items-center gap-2">
              <NavLink
                to="/insights"
                onClick={() => haptic()}
                aria-label="Insights"
                className={({ isActive }) =>
                  cn(
                    "flex h-10 w-10 items-center justify-center rounded-2xl border transition-colors",
                    isActive ? "border-accent/40 bg-accent/15" : "bg-surface hover:bg-surface-2"
                  )
                }
              >
                <Sparkles className="h-5 w-5 text-accent" />
              </NavLink>
              <Link
                to="/settings"
                aria-label="Settings"
                className="flex h-10 w-10 items-center justify-center rounded-2xl text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <Settings className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </header>

        <OfflineBanner />

        <main className="relative mx-auto w-full max-w-5xl flex-1 overflow-x-hidden px-4 pb-32 pt-4 lg:px-10 lg:pb-16 lg:pt-8">
          <AnimatePresence mode="popLayout" initial={false} custom={direction}>
            <motion.div
              key={location.pathname}
              custom={direction}
              variants={pageVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
            >
              <Suspense fallback={<PageFallback />}>{outlet}</Suspense>
            </motion.div>
          </AnimatePresence>
        </main>

        <BottomNav />
      </div>
    </div>
  );
}

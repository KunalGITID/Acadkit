import { Suspense } from "react";
import { Link, useLocation, useOutlet } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Settings, Sparkles } from "lucide-react";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Sidebar } from "@/components/layout/sidebar";
import { DayOrderChip } from "@/components/layout/day-order-chip";
import { Skeleton } from "@/components/ui/misc";
import { useSync } from "@/hooks/useSync";

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

export function AppShell() {
  useSync();
  const location = useLocation();
  const outlet = useOutlet();

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
              <DayOrderChip />
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

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-32 pt-4 lg:px-10 lg:pb-16 lg:pt-8">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 14, scale: 0.995 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.995 }}
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

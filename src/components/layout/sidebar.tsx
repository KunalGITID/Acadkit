import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import { LayoutGrid, Sparkles } from "lucide-react";
import { NAV_ITEMS, SETTINGS_ITEM, STUDY_ITEM, type NavItem } from "@/components/layout/nav-items";
import { DayOrderChip } from "@/components/layout/day-order-chip";
import { cn } from "@/lib/utils";

const row = (active: boolean) =>
  cn(
    "relative flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition-colors",
    active ? "text-accent" : "text-muted hover:bg-surface-2/70 hover:text-ink"
  );

function Pill() {
  return (
    <motion.span
      layoutId="sidebar-pill"
      className="absolute inset-0 rounded-2xl bg-accent/10"
      transition={{ type: "spring", stiffness: 450, damping: 35 }}
    />
  );
}

function Item({ item }: { item: NavItem }) {
  return (
    <NavLink to={item.to} end={item.to === "/"}>
      {({ isActive }) => (
        <span className={row(isActive)}>
          {isActive && <Pill />}
          <item.icon className="relative z-10 h-[18px] w-[18px]" strokeWidth={2.2} />
          <span className="relative z-10">{item.label}</span>
        </span>
      )}
    </NavLink>
  );
}

/**
 * The same five destinations as the phone's bottom bar, then Study
 * (the phone's top-bar book), More and Settings — the desktop used to list all eleven, which buried the five
 * used daily among pages opened once a month. More opens the same sheet
 * the phone uses, so the two layouts have one idea of what is primary.
 */
export function Sidebar({ onMore, moreActive }: { onMore: () => void; moreActive: boolean }) {
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-surface/50 px-4 py-6 lg:flex">
      <div className="flex items-center gap-2.5 px-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-brand text-brand-ink shadow-pop">
          <Sparkles className="h-[18px] w-[18px]" />
        </div>
        <span className="text-lg font-extrabold tracking-tight">AcadKit</span>
      </div>

      <div className="mt-6 px-1">
        <DayOrderChip expanded />
      </div>

      <nav className="mt-6 flex flex-1 flex-col gap-1" aria-label="Primary">
        {NAV_ITEMS.map((item) => (
          <Item key={item.to} item={item} />
        ))}
        <div className="my-2 border-t" />
        <Item item={STUDY_ITEM} />
        <button type="button" onClick={onMore} aria-haspopup="dialog" className={row(moreActive)}>
          {moreActive && <Pill />}
          <LayoutGrid className="relative z-10 h-[18px] w-[18px]" strokeWidth={2.2} />
          <span className="relative z-10">More</span>
        </button>
        <div className="mt-auto">
          <Item item={SETTINGS_ITEM} />
        </div>
      </nav>

    </aside>
  );
}

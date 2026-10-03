import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createDomFinder, type Finder } from "@/components/viewer/find";
import type { FindState } from "@/hooks/useFind";

/** The header button: a lens that glints when tapped and a ring that turns while search is open. */
export function FindButton({ find, disabled }: { find: FindState; disabled?: boolean }) {
  const [glint, setGlint] = useState(0);
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.88 }}
      disabled={disabled}
      onClick={() => {
        setGlint((g) => g + 1);
        if (find.open) find.close();
        else find.setOpen(true);
      }}
      data-open={find.open}
      data-glint={glint > 0}
      key={glint}
      className="find-btn flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-ink disabled:opacity-40"
      aria-label={find.open ? "Close search" : "Search in this file"}
      aria-expanded={find.open}
    >
      <motion.span
        initial={glint ? { rotate: -18, scale: 0.85 } : false}
        animate={{ rotate: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 14 }}
        className="flex"
      >
        <Search className="h-[18px] w-[18px]" strokeWidth={2.4} />
      </motion.span>
      <span className="find-glint" />
      <AnimatePresence>
        {find.open && find.total > 0 && (
          <motion.span
            key="badge"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 18 }}
            className="absolute -right-0.5 -top-0.5 z-10 min-w-[18px] rounded-full bg-accent px-1 text-[10px] font-extrabold leading-[18px] text-black tabular"
          >
            {find.total > 99 ? "99+" : find.total}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

/** The bar under the header: the field, the count, and previous / next. */
export function FindBar({ find, busy }: { find: FindState; busy?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (find.open) requestAnimationFrame(() => input.current?.focus());
  }, [find.open]);
  const short = find.query.trim().length < 2;
  return (
    <AnimatePresence initial={false}>
      {find.open && (
        <motion.div
          key="find"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
          className="relative shrink-0 overflow-hidden border-b bg-bg"
        >
          <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 py-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                ref={input}
                type="text"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value={find.query}
                onChange={(e) => find.setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    find.step(e.shiftKey ? -1 : 1);
                  } else if (e.key === "Escape") find.close();
                }}
                placeholder="Find a word or a sentence"
                className="h-10 w-full rounded-xl bg-surface-2 pl-9 pr-3 text-base font-medium text-ink placeholder:text-muted focus:outline-hidden focus:ring-2 focus:ring-accent/60"
                aria-label="Find in this file"
              />
            </div>
            <span className="w-18 shrink-0 text-center text-xs font-bold text-muted tabular" aria-live="polite">
              {short ? "" : find.searching || busy ? "…" : find.total ? `${find.current + 1} / ${find.total}` : "No match"}
            </span>
            <button
              type="button"
              onClick={() => find.step(-1)}
              disabled={!find.total}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 disabled:opacity-35"
              aria-label="Previous match"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => find.step(1)}
              disabled={!find.total}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 disabled:opacity-35"
              aria-label="Next match"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={find.close}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted hover:text-ink"
              aria-label="Close search"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {(find.searching || busy) && !short && <div className="find-scan" />}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Down the right edge, a mark for every match at its place in the file -
 * where they cluster shows where the file dwells on it. Tap one to go there.
 */
export function MatchRail({ find }: { find: FindState }) {
  if (!find.open || find.marks.length === 0) return null;
  return (
    <div className="pointer-events-none absolute bottom-24 right-1 top-3 z-10 w-3" aria-hidden>
      <div className="absolute inset-y-0 right-1 w-[3px] rounded-full bg-ink/10" />
      {find.marks.map((y, i) => (
        <motion.button
          key={i}
          type="button"
          tabIndex={-1}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ delay: Math.min(0.4, i * 0.012), duration: 0.18 }}
          onClick={() => find.go(i)}
          className={cn(
            "pointer-events-auto absolute right-0 h-[3px] origin-right rounded-full",
            i === find.current ? "w-3 bg-accent shadow-[0_0_6px_hsl(var(--accent))]" : "w-2 bg-accent/60"
          )}
          style={{ top: `calc(${(y * 100).toFixed(2)}% - 1.5px)` }}
        />
      ))}
    </div>
  );
}

/** Hands the viewer a finder over a rendered (non-PDF) file's content. */
export function DomFind({
  content,
  scroller,
  onFinder,
}: {
  content: HTMLElement | null;
  scroller: HTMLElement | null;
  onFinder: (f: Finder | null) => void;
}) {
  useEffect(() => {
    if (!content || !scroller) return;
    const f = createDomFinder(content, scroller);
    onFinder(f);
    return () => {
      f.dispose();
      onFinder(null);
    };
  }, [content, scroller, onFinder]);
  return null;
}

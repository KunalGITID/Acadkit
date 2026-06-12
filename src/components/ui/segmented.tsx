import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/utils";

interface SegmentedProps<T extends string | number> {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  layoutId: string;
  className?: string;
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  layoutId,
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="tablist"
      className={cn("flex rounded-2xl bg-surface-2/80 p-1", className)}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            role="tab"
            aria-selected={active}
            onClick={() => {
              haptic();
              onChange(opt.value);
            }}
            className={cn(
              "relative flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
              active ? "text-ink" : "text-muted hover:text-ink"
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-xl bg-surface shadow-card"
                transition={{ type: "spring", stiffness: 450, damping: 35 }}
              />
            )}
            <span className="relative z-10">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

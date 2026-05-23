import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface MarksProgressProps {
  obtained: number;
  max: number;
  color?: string;
  label?: string;
  className?: string;
}

export function MarksProgress({
  obtained,
  max,
  color = "#7c6af7",
  label,
  className,
}: MarksProgressProps) {
  const [width, setWidth] = useState(0);
  const pct = max > 0 ? Math.min(100, (obtained / max) * 100) : 0;

  useEffect(() => {
    const t = requestAnimationFrame(() => setWidth(pct));
    return () => cancelAnimationFrame(t);
  }, [pct]);

  return (
    <div className={cn("space-y-1", className)}>
      {label && (
        <p className="text-xs text-muted-foreground">{label}</p>
      )}
      <div className="flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#1e1e2e]">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{ width: `${width}%`, backgroundColor: color }}
          />
        </div>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {obtained.toFixed(obtained % 1 ? 1 : 0)} / {max}
        </span>
      </div>
    </div>
  );
}

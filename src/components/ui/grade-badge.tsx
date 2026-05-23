import { cn } from "@/lib/utils";

const GRADE_STYLES: Record<string, string> = {
  O: "bg-[#7c6af7]/25 text-[#7c6af7] border-[#7c6af7]/40",
  "A+": "bg-[#4ade80]/25 text-[#4ade80] border-[#4ade80]/40",
  A: "bg-[#22d3ee]/25 text-[#22d3ee] border-[#22d3ee]/40",
  "B+": "bg-[#facc15]/25 text-[#facc15] border-[#facc15]/40",
  B: "bg-[#f97316]/25 text-[#f97316] border-[#f97316]/40",
  C: "bg-[#fb7185]/25 text-[#fb7185] border-[#fb7185]/40",
  F: "bg-[#6b6b8a]/25 text-[#6b6b8a] border-[#6b6b8a]/40",
};

const SIZE_STYLES = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-1 text-sm",
  lg: "px-4 py-2 text-lg font-bold",
};

interface GradeBadgeProps {
  grade: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function GradeBadge({
  grade,
  size = "md",
  className,
}: GradeBadgeProps) {
  const display = grade ?? "?";
  const style =
    grade && GRADE_STYLES[grade]
      ? GRADE_STYLES[grade]
      : "bg-[#1e1e2e] text-muted-foreground border-[#1e1e2e]";

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md border font-mono font-semibold",
        SIZE_STYLES[size],
        style,
        className
      )}
    >
      {display}
    </span>
  );
}

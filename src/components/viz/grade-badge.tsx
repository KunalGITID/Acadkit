import { GRADE_COLORS, type Grade } from "@/lib/grades";
import { cn } from "@/lib/utils";

export function GradeBadge({
  grade,
  className,
  size = "md",
}: {
  grade: Grade;
  className?: string;
  size?: "md" | "lg";
}) {
  const color = GRADE_COLORS[grade];
  return (
    <span
      className={cn(
        "grade-badge inline-flex items-center justify-center rounded-2xl font-extrabold",
        size === "lg" ? "h-12 min-w-12 px-3 text-xl" : "h-9 min-w-9 px-2 text-sm",
        className
      )}
      // The text colour comes from .grade-badge in index.css: darker in light mode, where these hues on their own tint fall well under 4.5:1.
      style={{ backgroundColor: `${color}22`, "--grade": color } as React.CSSProperties}
    >
      {grade}
    </span>
  );
}

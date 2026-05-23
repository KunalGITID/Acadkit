import { useEffect, useState } from "react";
import { getAttendanceColor } from "@/lib/attendance";
import { cn } from "@/lib/utils";

interface CircularProgressProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  className?: string;
}

export function CircularProgress({
  percentage,
  size = 80,
  strokeWidth = 8,
  color,
  className,
}: CircularProgressProps) {
  const [animated, setAnimated] = useState(0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const ringColor = color ?? getAttendanceColor(percentage);
  const offset = circumference - (animated / 100) * circumference;

  useEffect(() => {
    const t = requestAnimationFrame(() => setAnimated(percentage));
    return () => cancelAnimationFrame(t);
  }, [percentage]);

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1e1e2e"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease-out" }}
        />
      </svg>
      <span
        className="absolute font-mono text-sm font-bold text-foreground"
        style={{ fontSize: size < 70 ? 11 : 14 }}
      >
        {percentage}%
      </span>
    </div>
  );
}

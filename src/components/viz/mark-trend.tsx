import { useMemo } from "react";
import type { Mark } from "@/types";

/**
 * A subject's internal marks over time, as a percentage per component.
 *
 * Every mark already carries `added_at` and nothing plotted it, so the
 * one question a list of scores can't answer — am I getting better or
 * worse — had no answer anywhere in the app.
 *
 * Percentages, not raw marks: FT-I out of 5 and a CT out of 50 are not
 * comparable as numbers, and a line joining 2 to 34 would be nonsense.
 * A single mark draws a dot rather than a line, because one point is not
 * a trend and pretending otherwise is the most common chart lie.
 */
export function MarkTrend({
  marks,
  color,
  className,
}: {
  marks: Mark[];
  color: string;
  className?: string;
}) {
  const points = useMemo(() => {
    return marks
      .filter((m) => !m.is_external && m.max_marks > 0)
      .slice()
      .sort((a, b) => String(a.added_at ?? "").localeCompare(String(b.added_at ?? "")))
      .map((m) => ({
        pct: (m.marks_obtained / m.max_marks) * 100,
        label: `${m.label}: ${m.marks_obtained}/${m.max_marks}`,
      }));
  }, [marks]);

  if (points.length === 0) return null;

  const W = 100;
  const H = 28;
  const pad = 3;
  const span = Math.max(1, points.length - 1);
  const xy = points.map((p, i) => ({
    x: points.length === 1 ? W / 2 : pad + (i / span) * (W - pad * 2),
    // 0–100% maps to the full height, so the line is comparable between
    // subjects rather than auto-scaled to flatter a bad run.
    y: H - pad - (Math.max(0, Math.min(100, p.pct)) / 100) * (H - pad * 2),
    ...p,
  }));

  const last = xy[xy.length - 1];
  const first = xy[0];
  const delta = points.length > 1 ? last.pct - first.pct : 0;

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-7 w-full overflow-visible"
        preserveAspectRatio="none"
        role="img"
        aria-label={
          points.length === 1
            ? points[0].label
            : `${points.length} marks, ${delta >= 0 ? "up" : "down"} ${Math.abs(Math.round(delta))} points`
        }
      >
        {/* The 75% line, so the trend has something to be above or below. */}
        <line
          x1="0"
          x2={W}
          y1={H - pad - 0.75 * (H - pad * 2)}
          y2={H - pad - 0.75 * (H - pad * 2)}
          stroke="currentColor"
          strokeWidth="0.5"
          strokeDasharray="2 2"
          className="text-muted/40"
        />
        {xy.length > 1 && (
          <polyline
            points={xy.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {xy.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={i === xy.length - 1 ? 2.4 : 1.6}
            fill={color}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    </div>
  );
}

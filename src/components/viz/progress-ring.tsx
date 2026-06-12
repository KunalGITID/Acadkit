import { motion } from "framer-motion";

interface ProgressRingProps {
  /** 0–100 */
  value: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  children?: React.ReactNode;
  className?: string;
  /** Arc sweep in degrees (360 = full circle, 270 = gauge). */
  sweep?: number;
}

export function ProgressRing({
  value,
  size = 120,
  strokeWidth = 10,
  color = "hsl(var(--accent))",
  trackColor = "hsl(var(--line) / 0.1)",
  children,
  className,
  sweep = 360,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = (sweep / 360) * circumference;
  const clamped = Math.max(0, Math.min(100, value));
  const filled = (clamped / 100) * arcLength;
  // Rotate so a partial sweep gauge opens at the bottom
  const rotation = sweep === 360 ? -90 : 90 + (360 - sweep) / 2;

  return (
    <div className={`relative inline-flex items-center justify-center ${className ?? ""}`}>
      <svg width={size} height={size} role="img" aria-label={`${Math.round(clamped)}%`}>
        <g transform={`rotate(${rotation} ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={trackColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${arcLength} ${circumference}`}
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${arcLength} ${circumference}`}
            initial={{ strokeDashoffset: arcLength }}
            animate={{ strokeDashoffset: arcLength - filled }}
            transition={{ type: "spring", stiffness: 50, damping: 16 }}
            style={{ filter: `drop-shadow(0 0 6px ${color}50)` }}
          />
        </g>
      </svg>
      {children && <div className="absolute inset-0 flex items-center justify-center">{children}</div>}
    </div>
  );
}

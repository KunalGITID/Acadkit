import { useId } from "react";
import { motion } from "framer-motion";
import { AnimatedNumber } from "@/components/viz/animated-number";

interface SgpaDialProps {
  sgpa: number | null;
  size?: number;
}

/** 270° gauge with a gradient arc, used as the Marks page hero. */
export function SgpaDial({ sgpa, size = 200 }: SgpaDialProps) {
  const id = useId();
  const strokeWidth = 16;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const sweep = 270;
  const arcLength = (sweep / 360) * circumference;
  const fraction = sgpa === null ? 0 : Math.max(0, Math.min(1, sgpa / 10));
  const rotation = 90 + (360 - sweep) / 2;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} role="img" aria-label={sgpa === null ? "SGPA not available" : `SGPA ${sgpa.toFixed(2)}`}>
        <defs>
          <linearGradient id={id} x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(var(--accent))" />
            <stop offset="100%" stopColor="hsl(var(--accent-2))" />
          </linearGradient>
        </defs>
        <g transform={`rotate(${rotation} ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="hsl(var(--line) / 0.1)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${arcLength} ${circumference}`}
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={`url(#${id})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${arcLength} ${circumference}`}
            initial={{ strokeDashoffset: arcLength }}
            animate={{ strokeDashoffset: arcLength - fraction * arcLength }}
            transition={{ type: "spring", stiffness: 45, damping: 15 }}
          />
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {sgpa === null ? (
          <>
            <span className="text-3xl font-extrabold text-muted">—</span>
            <span className="mt-1 text-xs font-semibold text-muted">no marks yet</span>
          </>
        ) : (
          <>
            <AnimatedNumber value={sgpa} decimals={2} className="text-5xl font-extrabold accent-gradient-text" />
            <span className="mt-1 text-xs font-bold uppercase tracking-widest text-muted">SGPA</span>
          </>
        )}
      </div>
    </div>
  );
}

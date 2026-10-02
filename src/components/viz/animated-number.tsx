import { useEffect, useRef } from "react";
import { motion, useSpring, useTransform, useReducedMotion } from "framer-motion";

interface AnimatedNumberProps {
  value: number;
  decimals?: number;
  className?: string;
  suffix?: string;
  /** Drop trailing zeros: 9.60 -> "9.6", 10.00 -> "10". */
  trim?: boolean;
}

/** Number that springs to its new value (tabular digits, no layout shift). */
export function AnimatedNumber({ value, decimals = 0, className, suffix, trim }: AnimatedNumberProps) {
  const reduced = useReducedMotion();
  const spring = useSpring(value, { stiffness: 70, damping: 18 });
  const display = useTransform(spring, (v) => (trim ? String(Number(v.toFixed(decimals))) : v.toFixed(decimals)) + (suffix ?? ""));
  const first = useRef(true);

  useEffect(() => {
    if (reduced || first.current) {
      spring.jump(value);
      first.current = false;
    } else {
      spring.set(value);
    }
  }, [value, spring, reduced]);

  return <motion.span className={`tabular ${className ?? ""}`}>{display}</motion.span>;
}

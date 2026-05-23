import { useCallback, useRef } from "react";

export function useSwipeTabs<T extends string>(
  tabs: readonly T[],
  current: T,
  onChange: (tab: T) => void,
  threshold = 60
) {
  const startX = useRef<number | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0]?.clientX ?? null;
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (startX.current === null) return;
      const dx = (e.changedTouches[0]?.clientX ?? 0) - startX.current;
      startX.current = null;
      if (Math.abs(dx) < threshold) return;
      const idx = tabs.indexOf(current);
      if (dx < 0 && idx < tabs.length - 1) onChange(tabs[idx + 1]!);
      if (dx > 0 && idx > 0) onChange(tabs[idx - 1]!);
    },
    [tabs, current, onChange, threshold]
  );

  return { onTouchStart, onTouchEnd };
}

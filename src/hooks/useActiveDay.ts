import { useEffect } from "react";
import { usePin } from "@/hooks/useData";
import { recordActiveDay } from "@/lib/activity";

/** Count this account as active today (src/lib/activity.ts). */
export function useActiveDay(): void {
  const pin = usePin();
  useEffect(() => {
    if (pin) void recordActiveDay(pin);
  }, [pin]);
}

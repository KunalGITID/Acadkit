import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useSurvivalPlan } from "@/hooks/useSurvivalPlan";
import { useTone } from "@/hooks/useTone";
import { todayISO } from "@/lib/dates";
import { freeDayLoss, type FreeDayMark } from "@/lib/freeDays";
import { say, VOICE } from "@/lib/voice";

/** Tells you when an absence just cost you a day off. */
export function useFreeDayWatch() {
  const plan = useSurvivalPlan();
  const tone = useTone();

  const previous = useRef<FreeDayMark | null>(null);

  useEffect(() => {
    if (!plan) return;
    const now: FreeDayMark = { count: plan.freeDays.length, date: todayISO() };
    const lost = freeDayLoss(previous.current, now);
    previous.current = now;
    if (lost === null) return;

    toast(say(VOICE.freeDaySpent, tone, lost), {
      description: say(VOICE.freeDayLeft, tone, now.count),
    });
  }, [plan, tone]);
}

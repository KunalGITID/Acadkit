import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useSurvivalPlan } from "@/hooks/useSurvivalPlan";
import { useTone } from "@/hooks/useTone";
import { todayISO } from "@/lib/dates";
import { freeDayLoss, type FreeDayMark } from "@/lib/freeDays";
import { say, VOICE } from "@/lib/voice";

/**
 * Tells you when an absence just cost you a day off.
 *
 * The survival card is a snapshot: marking one class absent can turn a
 * day you could have taken into one you can't, and nothing said so. You
 * would find out by going back and noticing the list had changed, which
 * is exactly the kind of thing nobody notices.
 *
 * Three things stop it crying wolf:
 *
 *  - **No baseline, no message.** The first plan of the session is
 *    recorded silently; there is nothing to have changed from.
 *  - **Only decreases.** Marking a class present can add a free day
 *    back, and "you gained a day" is not news worth interrupting for.
 *  - **Not across midnight.** Free days also disappear by being spent
 *    the ordinary way — the day arrives and passes. On a new date the
 *    baseline resets without a message, or the app would announce a
 *    theft every morning.
 */
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

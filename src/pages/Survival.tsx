import { LifeBuoy } from "lucide-react";
import { Skeleton } from "@/components/ui/misc";
import { SurvivalPlan } from "@/components/insights/survival-plan";
import { useProjectionReport } from "@/hooks/useProjectionReport";
import { useTone } from "@/hooks/useTone";
import { say, VOICE } from "@/lib/voice";

/**
 * The survival schedule: which of the days ahead you can actually miss.
 *
 * Everything else that used to share this page was per subject and
 * moved to where that subject is read — the attendance forecast to
 * Attendance, the grade budget to Marks. This one is per *day*, which is
 * the unit you make decisions in: nobody decides "I'll attend 73% of
 * Operating Systems", they decide whether to get up on Tuesday.
 */
export default function Survival() {
  const tone = useTone();
  const { subjects, attendance, snapshots, timetable, effMap, isLoading } = useProjectionReport();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-44 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 px-1 text-2xl font-extrabold tracking-tight lg:text-3xl">
        <LifeBuoy className="h-6 w-6 shrink-0 text-accent" />
        {say(VOICE.survivalTitle, tone)}
      </h1>
      <SurvivalPlan
        subjects={subjects}
        attendance={attendance}
        snapshots={snapshots}
        timetable={timetable}
        effMap={effMap}
      />
    </div>
  );
}

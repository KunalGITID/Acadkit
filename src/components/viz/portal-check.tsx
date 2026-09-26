import { useMemo } from "react";
import { Info, ShieldAlert } from "lucide-react";
import { Dot } from "@/components/ui/misc";
import { useSettings, useSnapshotHistory, useSubjects, useTimetable } from "@/hooks/useData";
import { buildEffectiveMap, semesterWindow } from "@/lib/calendar";
import { relativeDay } from "@/lib/dates";
import { portalAnomalies } from "@/lib/portalAnomalies";
import { cn } from "@/lib/utils";

/**
 * What looked off in the latest portal sync (src/lib/portalAnomalies.ts).
 *
 * Invisible when every sync looks like a normal week — the steady state.
 * Shown on the Attendance page because the portal is the baseline under
 * every number on it: a misread page moves all of them at once, and this
 * is the one place that says which number to distrust and why.
 */
export function PortalCheck() {
  const { data: history } = useSnapshotHistory();
  const { data: subjects } = useSubjects();
  const { data: timetable } = useTimetable();
  const { data: settings } = useSettings();

  const semStart = settings?.sem_start ?? null;
  const semEnd = settings?.sem_end ?? null;
  const declared = settings?.declared_holidays;
  const anomalies = useMemo(() => {
    if (!history?.length) return [];
    const effMap = buildEffectiveMap(declared ?? [], semesterWindow({ sem_start: semStart, sem_end: semEnd }));
    return portalAnomalies({
      history,
      subjects: subjects ?? [],
      timetable: timetable ?? [],
      effMap,
    });
  }, [history, subjects, timetable, declared, semStart, semEnd]);

  if (anomalies.length === 0) return null;
  const warn = anomalies.some((a) => a.severity === "warn");

  return (
    <section
      className={cn(
        "card space-y-2.5 p-4",
        warn ? "border-warn/30 bg-warn/5" : "border-accent/20"
      )}
    >
      <p className="flex items-center gap-2 text-sm font-bold">
        <ShieldAlert className={cn("h-4 w-4 shrink-0", warn ? "text-warn-deep" : "text-accent")} />
        {warn ? "The last portal sync looks off" : "Worth a look in the last portal sync"}
      </p>
      <ul className="space-y-2">
        {anomalies.map((a) => (
          <li key={`${a.subjectCode}-${a.kind}`} className="flex items-start gap-2 text-xs font-medium">
            {a.subject ? (
              <Dot color={a.subject.color_hex} className="mt-1 h-1.5 w-1.5 shrink-0" />
            ) : (
              <Info className="mt-0.5 h-3 w-3 shrink-0 text-muted" />
            )}
            <span>
              <b className="text-ink">{a.subject?.short_name || a.subject?.name || a.subjectCode}</b>{" "}
              <span className="text-muted">· synced {relativeDay(a.syncedAt.slice(0, 10))}.</span>{" "}
              {a.message}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] font-medium text-muted">
        If it's a misread, sync again from the portal page; if the portal really changed, the
        numbers above already reflect it.
      </p>
    </section>
  );
}

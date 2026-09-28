import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { TriangleAlert, X } from "lucide-react";
import { usePortalSnapshots, useSettings, useSubjects, useTimetable } from "@/hooks/useData";
import { semesterWindow } from "@/lib/calendar";
import { auditTimetable, describeAudit, suspectAudits } from "@/lib/timetableCheck";
import { formatDate } from "@/lib/dates";
import { haptic } from "@/lib/utils";

const DISMISSED_KEY = "acadkit:timetable-audit-dismissed";

/** What the state of the timetable is remembered by. */
function signature(codes: string[], gaps: number[]): string {
  return codes.map((c, i) => `${c}:${gaps[i]}`).join("|");
}

function read(): string | null {
  try {
    return window.localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

/** The timetable, checked against the one you're actually attending. */
export function TimetableAudit() {
  const { data: subjects } = useSubjects();
  const { data: timetable } = useTimetable();
  const { data: snapshots } = usePortalSnapshots();
  const { data: settings } = useSettings();
  const [dismissed, setDismissed] = useState(read);

  const suspects = useMemo(() => {
    if (!subjects?.length || !snapshots?.length) return [];
    return suspectAudits(
      auditTimetable({
        subjects,
        timetable: timetable ?? [],
        snapshots,
        declared: settings?.declared_holidays ?? [],
        window: semesterWindow(settings),
      })
    );
  }, [subjects, timetable, snapshots, settings]);

  const sig = signature(
    suspects.map((s) => s.subject.code),
    suspects.map((s) => s.gap)
  );

  if (!suspects.length || dismissed === sig) return null;

  function hide() {
    haptic(10);
    try {
      window.localStorage.setItem(DISMISSED_KEY, sig);
    } catch {
      // Private mode: the card stays until the next reload, which is a
      // better failure than the dismiss appearing not to work at all.
    }
    setDismissed(sig);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="card border-warn/40 bg-warn/10 p-4"
    >
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 h-[18px] w-[18px] shrink-0 text-warn-deep" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-warn-deep">
            Your timetable and the portal disagree
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Everything the app projects is counted off these slots, so this is worth a look —
            though a lab the portal counts as two hours will do it too.
          </p>
          <ul className="mt-2.5 space-y-1.5">
            {suspects.map((a) => (
              <li key={a.subject.id} className="text-xs">
                <span className="font-semibold">{a.subject.name}</span>
                <span className="text-muted"> - {describeAudit(a)}</span>
                <span className="text-muted"> (portal, {formatDate(a.asOf)})</span>
              </li>
            ))}
          </ul>
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={hide}
          className="-m-1 shrink-0 rounded-lg p-1 text-muted hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
}

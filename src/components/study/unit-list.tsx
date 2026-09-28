import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { StudyRefs } from "@/components/study/study-refs";
import { usePin } from "@/hooks/useData";
import { fetchTicks, setTick } from "@/api/units";
import { paperShares, unitProgress, type CourseUnits, type Tick } from "@/lib/units";
import { cn } from "@/lib/utils";

/** A course's syllabus units: how far through each you are (topics ticked), where your notes cover it, how much of the past papers it carries, and a warning where you have no notes for it. */
export function UnitList({
  course,
  unitShare,
  only,
  className,
}: {
  course: CourseUnits;
  unitShare?: Record<string, number>;
  only?: number[];
  className?: string;
}) {
  const pin = usePin();
  const qc = useQueryClient();
  const [open, setOpen] = useState<number | null>(null);
  const ticks = useQuery({ queryKey: ["syllabus-ticks", pin], queryFn: () => fetchTicks(pin) });
  const progress = useMemo(() => unitProgress(course, ticks.data ?? []), [course, ticks.data]);
  const shares = useMemo(() => paperShares(unitShare), [unitShare]);
  const tickedSet = useMemo(
    () => new Set((ticks.data ?? []).filter((t) => t.course_code === course.code).map((t) => `${t.unit}|${t.topic}`)),
    [ticks.data, course.code]
  );

  const toggle = useMutation({
    mutationFn: ({ t, done }: { t: Tick; done: boolean }) => setTick(pin, t, done),
    onMutate: ({ t, done }) => {
      // Tick at once; the network catches up.
      qc.setQueryData<Tick[]>(["syllabus-ticks", pin], (old = []) =>
        done
          ? [...old, t]
          : old.filter((x) => !(x.course_code === t.course_code && x.unit === t.unit && x.topic === t.topic))
      );
    },
    onError: () => {
      toast.error("Couldn't save that tick. Check your connection.");
      qc.invalidateQueries({ queryKey: ["syllabus-ticks", pin] });
    },
  });

  const units = course.units.filter((u) => !only || only.includes(u.n));

  return (
    <div className={cn("divide-y", className)}>
      {units.map((u) => {
        const p = progress.find((x) => x.n === u.n)!;
        const share = shares.get(u.n);
        const isOpen = open === u.n;
        const gap = course.hasFiles && u.files === 0;
        return (
          <div key={u.n}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : u.n)}
              aria-expanded={isOpen}
              className="flex w-full items-start gap-3 px-4 py-3 text-left"
            >
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-xs font-extrabold tabular">
                {u.n}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold leading-snug">{u.title}</span>
                <span className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                  <span className="bg-good transition-all" style={{ width: `${Math.round(p.done * 100)}%` }} />
                </span>
                <span className="mt-1 flex flex-wrap gap-x-2 text-[11px] font-medium text-muted">
                  <span>
                    {p.ticked}/{p.topics} topics
                  </span>
                  {share !== undefined && <span>· ~{Math.round(share * 100)}% of past papers</span>}
                  {u.hours && <span>· {u.hours} h</span>}
                  {gap ? (
                    <span className="flex items-center gap-1 font-semibold text-warn-deep">
                      · <TriangleAlert className="h-3 w-3" /> no notes
                    </span>
                  ) : (
                    course.hasFiles && <span>· {u.files} {u.files === 1 ? "file" : "files"} of notes</span>
                  )}
                </span>
              </span>
              <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-muted transition-transform", isOpen && "rotate-180")} />
            </button>
            {isOpen && (
              <div className="space-y-3 px-4 pb-4">
                {u.refs.length > 0 ? (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Read</p>
                    <StudyRefs refs={u.refs} className="mt-1" />
                  </div>
                ) : (
                  gap && (
                    <p className="rounded-xl bg-warn/10 px-3 py-2 text-xs font-medium">
                      Nothing in your folder covers this unit yet. Get the unit's notes or slides into the subject's folder
                      and it'll be picked up at the next sync.
                    </p>
                  )
                )}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Topics · tick what you've studied</p>
                  <ul className="mt-1.5 space-y-1">
                    {u.topics.map((topic) => {
                      const done = tickedSet.has(`${u.n}|${topic}`);
                      return (
                        <li key={topic}>
                          <button
                            type="button"
                            onClick={() => toggle.mutate({ t: { course_code: course.code, unit: u.n, topic }, done: !done })}
                            className="flex w-full items-start gap-2.5 rounded-lg px-1 py-1 text-left text-xs font-medium hover:bg-surface-2/60"
                            aria-pressed={done}
                          >
                            <span
                              className={cn(
                                "mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                                done ? "border-good bg-good text-bg" : "border-line"
                              )}
                            >
                              {done && <Check className="h-3 w-3" strokeWidth={3} />}
                            </span>
                            <span className={cn(done && "text-muted line-through")}>{topic}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

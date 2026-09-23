import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, Clock3, GraduationCap } from "lucide-react";
import { FileRow } from "@/components/study/file-row";
import { Dot } from "@/components/ui/misc";
import { usePin, useSettings, useSubjects, useTimetable } from "@/hooks/useData";
import { fetchStudyPrep, signStudyFiles } from "@/api/studyFiles";
import { semesterWindow } from "@/lib/calendar";
import { prepId, rankedTopics, upcomingPrep, type PrepTest } from "@/lib/examPrep";
import { formatPrep, prepWindows, totalPrepMinutes } from "@/lib/prep";
import type { StudyFile } from "@/lib/studyFiles";
import { cn } from "@/lib/utils";

function daysAway(iso: string, now: number): string {
  const d = Math.round(
    (new Date(new Date(iso).toLocaleDateString("en-CA")).getTime() -
      new Date(new Date(now).toLocaleDateString("en-CA")).getTime()) /
      86_400_000
  );
  return d <= 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`;
}

/**
 * Exam prep: for each upcoming test, what it covers, what past papers
 * keep asking, the files to open and the free periods you have before
 * it. The Study page's first section, because in an exam week that is
 * what you open the folder for.
 */
export function ExamPrep({ files }: { files: StudyFile[] }) {
  const pin = usePin();
  const [params] = useSearchParams();
  const linked = params.get("prep");
  const [open, setOpen] = useState<string | null>(linked);
  const [now] = useState(() => Date.now());
  const prep = useQuery({ queryKey: ["study-prep", pin], queryFn: () => fetchStudyPrep(pin), staleTime: 5 * 60_000 });
  const tests = useMemo(() => upcomingPrep(prep.data, now), [prep.data, now]);
  if (tests.length === 0) return null;

  return (
    <section className="space-y-2">
      <p className="flex items-center gap-2 px-1 text-xs font-bold uppercase tracking-widest text-muted">
        <GraduationCap className="h-4 w-4 text-accent" /> Exam prep
      </p>
      {tests.map((t) => {
        const id = prepId(t);
        return (
          <PrepCard
            key={id}
            test={t}
            files={files}
            now={now}
            open={open === id}
            scrollTo={linked === id}
            onToggle={() => setOpen(open === id ? null : id)}
          />
        );
      })}
    </section>
  );
}

function PrepCard({
  test,
  files,
  now,
  open,
  scrollTo,
  onToggle,
}: {
  test: PrepTest;
  files: StudyFile[];
  now: number;
  open: boolean;
  scrollTo: boolean;
  onToggle: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { data: subjects } = useSubjects();
  const { data: timetable } = useTimetable();
  const { data: settings } = useSettings();
  const subject = subjects?.find((s) => s.code.replace(/\s/g, "").toLowerCase() === test.subject_code.replace(/\s/g, "").toLowerCase());

  useEffect(() => {
    if (scrollTo) ref.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [scrollTo]);

  const byPath = useMemo(() => new Map(files.map((f) => [f.path, f])), [files]);
  const prepFiles = test.files.map((f) => ({ ...f, file: byPath.get(f.path) })).filter((f) => f.file) as {
    path: string;
    why?: string | null;
    file: StudyFile;
  }[];
  const links = useQuery({
    queryKey: ["study-links", "prep", prepId(test), prepFiles.map((f) => f.file.key).join("|")],
    queryFn: () => signStudyFiles(prepFiles.map((f) => f.file)),
    enabled: open && prepFiles.length > 0,
    staleTime: 30 * 60_000,
    gcTime: 30 * 60_000,
  });

  const windows = useMemo(() => {
    if (!open || !timetable) return [];
    const d = new Date();
    return prepWindows({
      due: test.due_date,
      timetable,
      declared: settings?.declared_holidays ?? [],
      window: semesterWindow({ sem_start: settings?.sem_start ?? null, sem_end: settings?.sem_end ?? null }),
      fromMinutes: d.getHours() * 60 + d.getMinutes(),
    });
  }, [open, timetable, settings, test.due_date]);

  const topics = rankedTopics(test);

  return (
    <div ref={ref} className="card scroll-mt-24 overflow-hidden p-0">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-3 p-4 text-left">
        {subject && <Dot color={subject.color_hex} className="mt-[7px] h-2 w-2 shrink-0" />}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">{test.title}</span>
          <span className="block text-xs font-medium text-muted">
            {new Date(test.due_date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })} ·{" "}
            {daysAway(test.due_date, now)}
            {topics.length > 0 && ` · ${topics.length} ranked topics`}
          </span>
        </span>
        <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-4 border-t px-4 pb-4 pt-3 text-sm">
          {test.portion && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted">Portion</p>
              <p className="mt-1 font-medium">{test.portion}</p>
            </div>
          )}
          {test.pattern && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted">Paper pattern</p>
              <p className="mt-1 font-medium">{test.pattern}</p>
            </div>
          )}

          {topics.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted">
                Most asked in past papers · study top-down
              </p>
              <ol className="mt-2 space-y-2">
                {topics.map((t, i) => (
                  <li key={i}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-semibold">
                        {t.topic}
                        {t.unit && <span className="font-medium text-muted"> · {t.unit}</span>}
                      </span>
                      <span className="shrink-0 text-xs font-bold text-muted tabular">
                        {t.seen}/{t.of}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round((t.seen / Math.max(t.of, 1)) * 100)}%` }} />
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {prepFiles.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted">Open these</p>
              <div className="-mx-4 mt-1 divide-y">
                {prepFiles.map((f) => (
                  <div key={f.path}>
                    <FileRow file={f.file} href={links.data?.[f.file.key]} showFolder />
                    {f.why && <p className="-mt-2 px-4 pb-3 pl-12 text-xs font-medium text-muted">{f.why}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-muted">
              <Clock3 className="h-3.5 w-3.5" /> Free periods before it
              {windows.length > 0 && ` · ${formatPrep(totalPrepMinutes(windows))}`}
            </p>
            {windows.length === 0 ? (
              <p className="mt-1 text-xs font-medium text-muted">No free period of 45 min or more between classes before this test.</p>
            ) : (
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {windows.slice(0, 8).map((w, i) => (
                  <li key={i} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold tabular">
                    {new Date(`${w.date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric" })} {w.start}–{w.end}
                  </li>
                ))}
                {windows.length > 8 && <li className="px-1 py-1 text-xs font-semibold text-muted">+{windows.length - 8} more</li>}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

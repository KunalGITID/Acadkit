import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, GraduationCap } from "lucide-react";
import { Dot } from "@/components/ui/misc";
import { usePin, useSubjects } from "@/hooks/useData";
import { fetchStudyPrep, fetchStudyTopics } from "@/api/studyFiles";
import { prepId, topicsForTest, upcomingPrep, type PrepTest, type TopicsData } from "@/lib/examPrep";
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
 * Exam prep: for each upcoming test, what it covers and how the paper
 * is set. Lives on the Marks page, folded to one line until opened —
 * it is looked at before a test, not every visit.
 */
export function ExamPrep() {
  const pin = usePin();
  const [params] = useSearchParams();
  const linked = params.get("prep");
  const [open, setOpen] = useState<string | null>(linked);
  const [expanded, setExpanded] = useState(!!linked);
  const [now] = useState(() => Date.now());
  const prep = useQuery({ queryKey: ["study-prep", pin], queryFn: () => fetchStudyPrep(pin), staleTime: 5 * 60_000 });
  const topics = useQuery({ queryKey: ["study-topics", pin], queryFn: () => fetchStudyTopics(pin), staleTime: 30 * 60_000 });
  const tests = useMemo(() => upcomingPrep(prep.data, now), [prep.data, now]);
  if (tests.length === 0) return null;

  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="card flex w-full items-center gap-3 p-4 text-left"
      >
        <GraduationCap className="h-5 w-5 shrink-0 text-accent" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">Exam prep · {tests.length} tests</span>
          <span className="block truncate text-xs font-medium text-muted">
            Next: {tests[0].title} · {daysAway(tests[0].due_date, now)}
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform", expanded && "rotate-180")} />
      </button>
      {expanded && tests.map((t) => {
        const id = prepId(t);
        return (
          <PrepCard
            key={id}
            test={t}
            topics={topics.data}
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
  topics,
  now,
  open,
  scrollTo,
  onToggle,
}: {
  test: PrepTest;
  topics: TopicsData | null | undefined;
  now: number;
  open: boolean;
  scrollTo: boolean;
  onToggle: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { data: subjects } = useSubjects();
  const subject = useMemo(
    () => subjects?.find((s) => s.code.replace(/\s/g, "").toLowerCase() === test.subject_code.replace(/\s/g, "").toLowerCase()),
    [subjects, test.subject_code]
  );

  useEffect(() => {
    if (scrollTo) ref.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [scrollTo]);

  // What past papers keep asking. The scan's own counts, read off the
  // papers for this exact portion, win when it has them; otherwise the
  // topics the sync mined from every paper in the folder.
  const curated = test.topics.filter((t) => t.of > 0);
  const mined = curated.length ? null : topicsForTest(topics, test);

  return (
    <div ref={ref} className="card scroll-mt-24 overflow-hidden p-0">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-3 p-4 text-left">
        {subject && <Dot color={subject.color_hex} className="mt-[7px] h-2 w-2 shrink-0" />}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">{test.title}</span>
          <span className="block text-xs font-medium text-muted">
            {new Date(test.due_date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })} ·{" "}
            {daysAway(test.due_date, now)}
          </span>
        </span>
        <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>

      {open && (test.portion || test.pattern || curated.length > 0 || mined) && (
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
          {curated.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted">Most asked in past papers</p>
              <ul className="mt-1.5 space-y-1">
                {curated.slice(0, 6).map((t) => (
                  <li key={t.topic} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 font-medium">{t.topic}</span>
                    <span className="shrink-0 text-xs font-bold tabular text-muted">
                      {t.seen}/{t.of}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {mined && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted">
                Most asked in past papers
                <span className="font-semibold normal-case tracking-normal">
                  {" "}
                  · {mined.scope === "test" ? `${mined.papers} papers of this test` : `all ${mined.papers} papers`}
                </span>
              </p>
              <ul className="mt-1.5 space-y-2">
                {mined.topics.map((t) => (
                  <li key={t.label}>
                    <p className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 font-semibold">{t.label}</span>
                      <span className="shrink-0 text-xs font-bold tabular text-muted">
                        {t.count} of {mined.papers}
                        {t.latest ? ` · ${t.latest}` : ""}
                      </span>
                    </p>
                    {t.example && <p className="mt-0.5 line-clamp-2 text-xs font-medium text-muted">“{t.example}”</p>}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] font-medium text-muted">
                Grouped automatically from the papers' text, scans included — how often a topic came
                up, not a guess at the next paper.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

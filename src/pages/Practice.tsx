import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ChevronDown, ChevronLeft, FileText, FolderOpen, Shuffle } from "lucide-react";
import { StudyRefs } from "@/components/study/study-refs";
import { warmViewer } from "@/components/viewer/loaders";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { usePin, useSubjects } from "@/hooks/useData";
import { fetchStudyTopics } from "@/api/studyFiles";
import type { AskedQuestion, MinedTopic } from "@/lib/examPrep";
import { paperLabel, practiceTopics, practiceUnits, questionsOf, randomQuestion } from "@/lib/practice";
import { viewerHref } from "@/lib/viewer";
import { useViewerLinkState } from "@/hooks/useViewerLink";
import { cn } from "@/lib/utils";

const norm = (code: string) => code.replace(/\s/g, "").toUpperCase();

/** Past-paper practice for one subject: every topic the sync found asked in two or more papers, most-asked first, with the real questions and where to read them - plus a random question weighted toward the topics that keep coming back. */
export default function Practice() {
  useEffect(() => warmViewer(), []);
  const { code: raw = "" } = useParams();
  const code = norm(raw);
  const pin = usePin();
  const { data: subjects } = useSubjects();
  const topics = useQuery({ queryKey: ["study-topics", pin], queryFn: () => fetchStudyTopics(pin), staleTime: 5 * 60_000 });
  const data = topics.data?.subjects.find((s) => norm(s.subject_code) === code) ?? null;
  const name = subjects?.find((s) => norm(s.code) === code)?.name ?? code;

  const [unit, setUnit] = useState<number | null>(null);
  const units = useMemo(() => practiceUnits(data?.topics ?? []), [data]);
  const shown = useMemo(() => practiceTopics(data?.topics ?? [], unit), [data, unit]);
  const [drill, setDrill] = useState<{ topic: MinedTopic; question: AskedQuestion } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  if (topics.isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2 px-1">
        <Link
          to={`/subject/${code}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted hover:text-ink"
          aria-label={`Back to ${name}`}
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-balance wrap-break-word text-2xl font-extrabold leading-tight tracking-tight lg:text-3xl">Past-paper practice</h1>
          <p className="truncate text-sm font-medium text-muted">
            {name}
            {data ? ` · ${data.topics.length} topics from ${data.papers} papers` : ""}
          </p>
        </div>
      </div>

      {!data || data.topics.length === 0 ? (
        <section className="card">
          <EmptyState
            icon={FolderOpen}
            title="No past papers to practise from"
            description="Put papers in this subject's 07_PYQs folder on your Mac; the next sync finds the topics they keep asking."
            className="py-10"
          />
        </section>
      ) : (
        <>
          <section className="card space-y-3">
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">Random question</span>
                <span className="block text-xs font-medium text-muted">
                  The most-asked topics come up most{unit != null ? ` · unit ${unit} only` : ""}
                </span>
              </span>
              <Button className="shrink-0" onClick={() => setDrill(randomQuestion(shown, Math.random, drill?.question.text))}>
                <Shuffle className="h-4 w-4" />
                {drill ? "Another" : "Give me one"}
              </Button>
            </div>
            {drill && (
              <div className="space-y-2 border-t pt-3">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">
                  {drill.topic.label}
                  {drill.topic.unit != null ? ` · unit ${drill.topic.unit}` : ""}
                </p>
                <Question q={drill.question} />
                {drill.topic.refs && drill.topic.refs.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <p className="text-xs font-semibold text-muted">Where to read it</p>
                    <StudyRefs refs={drill.topic.refs} />
                  </div>
                )}
              </div>
            )}
          </section>

          {units.length > 1 && (
            <div className="flex flex-wrap gap-2 px-1" role="group" aria-label="Filter by unit">
              {[null, ...units].map((u) => (
                <button
                  key={u ?? "all"}
                  type="button"
                  onClick={() => {
                    setUnit(u);
                    setDrill(null);
                  }}
                  aria-pressed={unit === u}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-bold",
                    unit === u ? "bg-brand text-brand-ink" : "bg-surface-2 text-muted hover:text-ink"
                  )}
                >
                  {u == null ? "All units" : `Unit ${u}`}
                </button>
              ))}
            </div>
          )}

          <section className="card divide-y overflow-hidden p-0">
            {shown.map((t) => {
              const isOpen = open === t.label;
              const qs = questionsOf(t);
              return (
                <div key={t.label}>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : t.label)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{t.label}</span>
                      <span className="block text-xs font-medium text-muted">
                        {t.papers} of {data.papers} papers
                        {t.latest ? ` · last ${t.latest}` : ""}
                        {t.unit != null ? ` · unit ${t.unit}` : ""}
                      </span>
                    </span>
                    <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform", isOpen && "rotate-180")} />
                  </button>
                  {isOpen && (
                    <div className="space-y-3 px-4 pb-4">
                      <p className="text-xs font-semibold text-muted">
                        As it was asked{qs.length > 1 ? ` in ${qs.length} papers` : ""}
                      </p>
                      <ol className="space-y-3">
                        {qs.map((q, i) => (
                          <li key={i}>
                            <Question q={q} />
                          </li>
                        ))}
                      </ol>
                      {t.refs && t.refs.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-muted">Where to read it</p>
                          <StudyRefs refs={t.refs} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
          <p className="px-1 text-xs font-medium text-muted">How often each came up in past papers, not a guess at the next one.</p>
        </>
      )}
    </div>
  );
}

/** One real question, with the paper it came from and a way to open it. */
function Question({ q }: { q: AskedQuestion }) {
  // Opens over this page, so closing the paper keeps your place (useViewerLink).
  const viewerState = useViewerLinkState();
  const label = paperLabel(q);
  const [reveal, setReveal] = useState(false);
  return (
    <div className="space-y-1.5 rounded-xl bg-surface-2/60 p-3">
      <p className="whitespace-pre-line wrap-break-word text-sm leading-relaxed">{q.text}</p>
      {q.answer &&
        (reveal ? (
          <p className="whitespace-pre-line wrap-break-word border-l-2 border-accent pl-2 text-sm leading-relaxed text-muted">
            {q.answer}
          </p>
        ) : (
          <button type="button" onClick={() => setReveal(true)} className="text-xs font-bold text-accent">
            Show the answer key's answer
          </button>
        ))}
      {(label || q.path) && (
        <p className="flex items-center justify-between gap-3 text-xs font-semibold text-muted">
          <span>{label}</span>
          {q.path && (
            <Link to={viewerHref(q.path)} state={viewerState} className="flex items-center gap-1 text-accent">
              <FileText className="h-3.5 w-3.5" /> Open paper
            </Link>
          )}
        </p>
      )}
    </div>
  );
}

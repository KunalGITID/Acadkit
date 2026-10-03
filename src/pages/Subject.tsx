import { useEffect, useMemo, useState } from "react";
import { warmViewer } from "@/components/viewer/loaders";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ChevronDown, ChevronRight, FolderOpen, GraduationCap, Shuffle, TriangleAlert, UserCheck } from "lucide-react";
import { FileRow } from "@/components/study/file-row";
import { StudyRefs } from "@/components/study/study-refs";
import { AreaHistoryNote } from "@/components/study/area-history";
import { UnitList } from "@/components/study/unit-list";
import { fetchTicks, fetchUnits } from "@/api/units";
import { SubjectSearch } from "@/components/study/subject-search";
import { useStudyDeletions } from "@/hooks/useStudyDeletions";
import { Dot, EmptyState, Skeleton } from "@/components/ui/misc";
import {
  useAttendance,
  useListedDeadlines,
  useMarks,
  usePin,
  usePortalSnapshots,
  useSubjects,
} from "@/hooks/useData";
import { fetchStudyManifest, fetchStudyTopics } from "@/api/studyFiles";
import { computeSubjectAttendance, snapshotsByCode } from "@/lib/attendance";
import { deadlineLabel } from "@/lib/deadlines";
import { titleCase } from "@/lib/curriculum";
import type { SubjectTopics } from "@/lib/examPrep";
import { courseProgress, unitsWithoutNotes, type CourseUnits } from "@/lib/units";
import type { FileKind, StudyFile } from "@/lib/studyFiles";
import { cn } from "@/lib/utils";

const KIND_ORDER: { kind: FileKind; label: string }[] = [
  { kind: "notes", label: "Notes" },
  { kind: "guide", label: "Guides & prep" },
  { kind: "lab", label: "Lab" },
  { kind: "assignment", label: "Assignments" },
  { kind: "pyq", label: "Past papers" },
  { kind: "syllabus", label: "Syllabus & plan" },
  { kind: "whatsapp", label: "From WhatsApp" },
  { kind: "other", label: "Other" },
];

const norm = (code: string) => code.replace(/\s/g, "").toUpperCase();

/** Everything the app knows about one subject, on one page: attendance, marks and what's next, the syllabus units, every file of the subject by kind and unit (tags from scripts/lib/tags.mjs), and, folded below them, the topics past papers keep asking with where to read them. */
export default function Subject() {
  // Load the viewer while you browse, so the first file opens without waiting on it.
  useEffect(() => warmViewer(), []);
  const { code: raw = "" } = useParams();
  const code = norm(raw);
  const pin = usePin();

  const { data: subjects } = useSubjects();
  const { data: attendance } = useAttendance();
  const { data: snapshots } = usePortalSnapshots();
  const { data: marks } = useMarks();
  const { data: deadlines } = useListedDeadlines();
  const manifest = useQuery({ queryKey: ["study-files", pin], queryFn: () => fetchStudyManifest(pin), staleTime: 5 * 60_000 });
  const topics = useQuery({ queryKey: ["study-topics", pin], queryFn: () => fetchStudyTopics(pin), staleTime: 5 * 60_000 });
  const unitsData = useQuery({ queryKey: ["units", pin], queryFn: () => fetchUnits(pin), staleTime: 5 * 60_000 });
  const syllabus = unitsData.data?.courses[code] ?? null;

  const subject = subjects?.find((s) => norm(s.code) === code);
  const files = useMemo(
    () => (manifest.data?.files ?? []).filter((f) => f.subject_code && norm(f.subject_code) === code),
    [manifest.data, code]
  );
  const att = useMemo(() => {
    if (!subject) return null;
    return computeSubjectAttendance(subject, attendance ?? [], snapshotsByCode(snapshots ?? []).get(code));
  }, [subject, attendance, snapshots, code]);
  const subjectMarks = useMemo(() => (subject ? (marks ?? []).filter((m) => m.subject_id === subject.id) : []), [marks, subject]);
  const next = useMemo(() => {
    if (!subject) return null;
    const now = Date.now();
    return (
      (deadlines ?? [])
        .filter((d) => d.subject_id === subject.id && d.status === "pending" && new Date(d.due_date).getTime() >= now)
        .sort((a, b) => a.due_date.localeCompare(b.due_date))[0] ?? null
    );
  }, [deadlines, subject]);

  const pastTopics = topics.data?.subjects.find((s) => norm(s.subject_code) === code);

  if (manifest.isLoading && !subjects) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!subject && files.length === 0 && !syllabus) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="px-1 text-2xl font-extrabold tracking-tight lg:text-3xl">{code || "Subject"}</h1>
        <section className="card">
          <EmptyState
            icon={FolderOpen}
            title="Nothing for this subject yet"
            description="Nothing in your subjects or study folder has this course code."
            className="py-10"
          />
        </section>
      </div>
    );
  }

  const got = subjectMarks.reduce((n, m) => n + m.marks_obtained, 0);
  const outOf = subjectMarks.reduce((n, m) => n + m.max_marks, 0);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2.5 px-1">
        {subject && <Dot color={subject.color_hex} className="h-3 w-3 shrink-0" />}
        <div className="min-w-0">
          <h1 className="text-balance wrap-break-word text-2xl font-extrabold leading-tight tracking-tight lg:text-3xl">{subject?.name ?? (syllabus?.title ? titleCase(syllabus.title) : code)}</h1>
          <p className="text-sm font-medium text-muted">
            {code}
            {!subject && syllabus && typeof syllabus.semester === "number" && ` · Semester ${syllabus.semester}, not started yet`}
            {!subject && syllabus && typeof syllabus.semester !== "number" && " · elective"}
          </p>
        </div>
      </div>

      {subject && (
        <section className="grid grid-cols-3 gap-2">
          <Link to="/attendance" className="card p-3 transition-colors hover:bg-surface-2/60">
            <UserCheck className="h-4 w-4 text-muted" />
            <p className="mt-1.5 text-lg font-extrabold tabular">
              {att?.percentage != null ? `${Math.round(att.percentage)}%` : "—"}
            </p>
            <p className="text-[11px] font-semibold text-muted">
              attendance{att && att.percentage != null && ` · bar ${att.min}`}
            </p>
          </Link>
          <Link to="/marks" className="card p-3 transition-colors hover:bg-surface-2/60">
            <GraduationCap className="h-4 w-4 text-muted" />
            <p className="mt-1.5 text-lg font-extrabold tabular">{outOf > 0 ? `${got}/${outOf}` : "—"}</p>
            <p className="text-[11px] font-semibold text-muted">
              {subjectMarks.length} mark{subjectMarks.length === 1 ? "" : "s"} in
            </p>
          </Link>
          <Link to="/calendar" className="card p-3 transition-colors hover:bg-surface-2/60">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted">Next</p>
            <p className="mt-1 line-clamp-2 text-sm font-bold">{next ? deadlineLabel(next, subject) : "Nothing due"}</p>
            {next && (
              <p className="text-[11px] font-semibold text-muted">
                {new Date(next.due_date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
              </p>
            )}
          </Link>
        </section>
      )}

      <AreaHistoryNote code={code} />

      {files.length > 0 && <SubjectSearch files={files} name={subject?.short_name?.trim() || subject?.name || syllabus?.title || code} />}

      {syllabus && <NotesGaps course={syllabus} />}

      {syllabus && syllabus.units.length > 0 && (
        <SyllabusCard
          course={syllabus}
          unitShare={pastTopics?.unitShare}
          note={
            [
              syllabus.prerequisites && !/^nil$/i.test(syllabus.prerequisites) ? `builds on ${syllabus.prerequisites}` : null,
              !subject ? "a head start: tick topics before the semester begins" : null,
            ]
              .filter(Boolean)
              .join(" · ")
          }
        />
      )}

      {files.length > 0 && <FileGroups files={files} />}

      {pastTopics && pastTopics.topics.length > 0 && <PastTopics topics={pastTopics} showUnit={!!syllabus} code={code} />}
    </div>
  );
}

/** The course's chapters and their topics, folded to one line until opened. */
function SyllabusCard({ course, unitShare, note }: { course: CourseUnits; unitShare?: Record<string, number>; note: string }) {
  const pin = usePin();
  const [open, setOpen] = useState(false);
  // Same query UnitList ticks through, so the summary moves as you tick.
  const ticks = useQuery({ queryKey: ["syllabus-ticks", pin], queryFn: () => fetchTicks(pin) });
  const progress = useMemo(() => courseProgress(course, ticks.data ?? []), [course, ticks.data]);
  return (
    <section className="card overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">Syllabus</span>
          <span className="block text-xs font-medium text-muted">
            {course.units.length} units · {progress.ticked}/{progress.topics} topics ticked{note ? ` · ${note}` : ""}
          </span>
          <span className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <span className="bg-good transition-all" style={{ width: `${progress.pct}%` }} />
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          {course.file && <StudyRefs refs={[{ path: course.file, page: null }]} className="border-t px-4 py-2" />}
          <UnitList course={course} unitShare={unitShare} className="border-t" />
        </>
      )}
    </section>
  );
}

/**
 * The units your folder has nothing for, so you know what to get before
 * a test. Silent when every unit is covered.
 */
function NotesGaps({ course }: { course: CourseUnits }) {
  const gaps = unitsWithoutNotes(course);
  if (!gaps.length) return null;
  return (
    <section className="card flex items-start gap-3 border-warn/30 px-4 py-3">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn-deep" />
      <div className="min-w-0 text-xs font-medium text-muted">
        <p className="text-sm font-bold text-ink">
          No notes yet for {gaps.length === 1 ? "one unit" : `${gaps.length} units`}
        </p>
        <ul className="mt-1 space-y-0.5">
          {gaps.map((u) => (
            <li key={u.n}>
              <b className="text-ink">Unit {u.n}</b> · {u.title}
            </li>
          ))}
        </ul>
        <p className="mt-1.5">
          Put its notes or slides in the subject's folder and they're picked up at the next sync.
        </p>
      </div>
    </section>
  );
}

/** The most-asked topics a subject page lists; the practice page has the rest. */
const TOP_TOPICS = 12;

/** What past papers keep asking, folded to one line until opened. */
function PastTopics({ topics, showUnit, code }: { topics: SubjectTopics; showUnit: boolean; code: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="card overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">What past papers keep asking</span>
          <span className="block text-xs font-medium text-muted">
            {topics.topics.length} topics from {topics.papers} papers
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>
      <Link
        to={`/practice/${code}`}
        className="flex items-center gap-3 border-t px-4 py-3 text-sm font-semibold text-accent"
      >
        <Shuffle className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1">Practise with the real questions</span>
        <ChevronRight className="h-4 w-4 shrink-0" />
      </Link>
      {open && (
        <div className="space-y-3 border-t px-4 pb-4 pt-3">
          <p className="text-xs font-medium text-muted">How often each came up, not a guess at the next paper.</p>
          <ul className="space-y-3">
            {topics.topics.slice(0, TOP_TOPICS).map((t) => (
              <li key={t.label} className="space-y-1">
                <p className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 font-semibold">
                    {t.label}
                    {t.unit && showUnit && <span className="ml-1.5 text-[11px] font-bold text-muted">· unit {t.unit}</span>}
                  </span>
                  <span className="shrink-0 text-xs font-bold tabular text-muted">
                    {t.papers}/{topics.papers}
                    {t.latest ? ` · ${t.latest}` : ""}
                  </span>
                </p>
                {t.refs && t.refs.length > 0 && <StudyRefs refs={t.refs} />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** The subject's files by kind; notes further split by unit. Every group starts folded. */
function FileGroups({ files }: { files: StudyFile[] }) {
  // Same deletes as the Study page's folders: swipe a row right.
  const { pendingByPath, available: canDelete, askDelete, undo } = useStudyDeletions();
  const rowProps = (f: StudyFile) => ({
    deleting: pendingByPath.has(f.path),
    onDelete: canDelete ? () => askDelete(f) : undefined,
    onUndo: () => undo(f.path),
    swipeToDelete: true,
  });
  const [open, setOpen] = useState<string | null>(null);
  const groups = useMemo(
    () =>
      KIND_ORDER.map((g) => ({ ...g, files: files.filter((f) => (f.kind ?? "other") === g.kind) })).filter(
        (g) => g.files.length > 0
      ),
    [files]
  );

  return (
    <section className="space-y-2">
      <p className="flex items-baseline justify-between gap-3 px-1">
        <span className="text-[11px] font-bold uppercase tracking-widest text-muted">Files</span>
        {canDelete && <span className="text-[11px] font-medium text-muted">swipe a file right to delete</span>}
      </p>
      {groups.map((g) => {
        const isOpen = open === g.kind;
        const byUnit =
          g.kind === "notes"
            ? [...new Set(g.files.map((f) => f.unit ?? 0))].sort((a, b) => (a || 99) - (b || 99))
            : null;
        return (
          <div key={g.kind} className="card overflow-hidden p-0">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : g.kind)}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
            >
              <span className="min-w-0 flex-1 text-sm font-bold">{g.label}</span>
              <span className="text-xs font-semibold text-muted tabular">{g.files.length}</span>
              <ChevronDown className={cn("h-4 w-4 text-muted transition-transform", isOpen && "rotate-180")} />
            </button>
            {isOpen && (
              <div className="divide-y border-t">
                {byUnit
                  ? byUnit.map((u) => (
                      <div key={u}>
                        <p className="bg-surface-2/40 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-muted">
                          {u ? `Unit ${u}` : "Other notes"}
                        </p>
                        {g.files
                          .filter((f) => (f.unit ?? 0) === u)
                          .map((f) => (
                            <FileRow key={f.path} file={f} showFolder={false} {...rowProps(f)} />
                          ))}
                      </div>
                    ))
                  : g.files.map((f) => <FileRow key={f.path} file={f} showFolder {...rowProps(f)} />)}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

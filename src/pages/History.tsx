import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Archive, ChevronDown, GraduationCap, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dot, EmptyState, Skeleton } from "@/components/ui/misc";
import { GradeBadge } from "@/components/viz/grade-badge";
import { AnimatedNumber } from "@/components/viz/animated-number";
import {
  useArchives,
  useAttendance,
  useDeleteArchive,
  useMarks,
  useSettings,
  useSubjects,
} from "@/hooks/useData";
import { clearAcademicData, insertArchive } from "@/api/queries";
import { computeOverallAttendance } from "@/lib/attendance";
import { computeSgpa, groupMarksBySubject, type Grade } from "@/lib/grades";
import { useAppStore } from "@/store/app";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { SemesterArchive, SubjectArchiveRow } from "@/types";

function SemesterCard({
  archive,
  index,
  onDelete,
}: {
  archive: SemesterArchive;
  index: number;
  onDelete: (a: SemesterArchive) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 26, delay: index * 0.04 }}
      className="card overflow-hidden"
    >
      <button className="flex w-full items-center gap-4 p-5 text-left" onClick={() => setOpen((v) => !v)}>
        <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-accent/10">
          <span className="text-xl font-extrabold tabular accent-gradient-text">
            {archive.sgpa === null ? "—" : archive.sgpa.toFixed(2)}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{archive.label}</p>
          <p className="text-xs font-medium text-muted">
            {archive.credits ?? 0} credits · {archive.summary.length} subjects
            {archive.archived_at ? ` · archived ${formatDate(archive.archived_at.slice(0, 10))}` : ""}
          </p>
        </div>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="border-t">
          <div className="space-y-1.5 p-4">
            {archive.summary.map((r: SubjectArchiveRow) => (
              <div key={r.code} className="flex items-center gap-3 rounded-xl bg-surface-2/40 px-3 py-2">
                <Dot color={r.color_hex} className="h-2 w-2" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{r.name}</span>
                {r.attendancePct !== null && (
                  <span className="text-xs font-medium tabular text-muted">{Math.round(r.attendancePct)}%</span>
                )}
                <GradeBadge grade={r.grade as Grade} />
              </div>
            ))}
            <Button
              variant="danger"
              size="sm"
              className="mt-2"
              onClick={() => onDelete(archive)}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete this record
            </Button>
          </div>
        </motion.div>
      )}
    </motion.section>
  );
}

export default function History() {
  const pin = useAppStore((s) => s.pin)!;
  const qc = useQueryClient();
  const { data: archives, isLoading } = useArchives();
  const { data: subjects } = useSubjects();
  const { data: marks } = useMarks();
  const { data: attendance } = useAttendance();
  const { data: settings } = useSettings();
  const deleteArchive = useDeleteArchive();
  const [busy, setBusy] = useState(false);

  const current = useMemo(
    () => computeSgpa(subjects ?? [], groupMarksBySubject(marks ?? [])),
    [subjects, marks]
  );

  const { cgpa, completed, cgpaWithCurrent } = useMemo(() => {
    const done = (archives ?? []).filter((a) => a.sgpa !== null && (a.credits ?? 0) > 0);
    const cr = done.reduce((s, a) => s + (a.credits ?? 0), 0);
    const cgpa = cr > 0 ? done.reduce((s, a) => s + (a.sgpa ?? 0) * (a.credits ?? 0), 0) / cr : null;
    let cgpaWithCurrent: number | null = cgpa;
    if (current.sgpa !== null && current.totalCredits > 0) {
      const totalCr = cr + current.totalCredits;
      const weighted =
        done.reduce((s, a) => s + (a.sgpa ?? 0) * (a.credits ?? 0), 0) +
        current.sgpa * current.totalCredits;
      cgpaWithCurrent = totalCr > 0 ? weighted / totalCr : null;
    }
    return { cgpa, completed: done.length, cgpaWithCurrent };
  }, [archives, current]);

  async function archiveNow() {
    const overall = computeOverallAttendance(subjects ?? [], attendance ?? []);
    const attBySubject = new Map(overall.subjects.map((s) => [s.subject.id, s.percentage]));
    const summary: SubjectArchiveRow[] = current.rows
      .filter((r) => r.marks.hasAnyMarks || r.subject.credits > 0)
      .map((r) => ({
        code: r.subject.code,
        name: r.subject.name,
        credits: r.subject.credits,
        grade: r.marks.grade,
        points: r.marks.points,
        total: r.marks.predictedTotal,
        attendancePct: attBySubject.get(r.subject.id) ?? null,
        color_hex: r.subject.color_hex,
      }));

    const defaultLabel = `Semester ${settings?.semester ?? (archives?.length ?? 0) + 1}`;
    const label = window.prompt("Name this semester:", defaultLabel);
    if (label === null) return;

    setBusy(true);
    try {
      await insertArchive(pin, {
        label: label.trim() || defaultLabel,
        sgpa: current.sgpa,
        credits: current.totalCredits,
        summary,
        sem_start: settings?.sem_start ?? null,
        sem_end: settings?.sem_end ?? null,
      });
      await qc.invalidateQueries({ queryKey: ["archives", pin] });
      toast.success("Semester archived");

      if (
        window.confirm(
          "Archived! Clear this semester's subjects, timetable, attendance & marks to start fresh? (Your history and PIN stay.)"
        )
      ) {
        await clearAcademicData(pin);
        await qc.invalidateQueries();
        toast.success("Cleared — ready for the new semester");
      }
    } catch (err) {
      toast.error("Couldn't archive", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const hasArchives = (archives ?? []).length > 0;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="px-1 text-2xl font-extrabold tracking-tight lg:text-3xl">Semester history</h1>

      {/* CGPA hero */}
      <section className="card flex items-center justify-around gap-3 p-6">
        <div className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted">CGPA</p>
          <p className="mt-1 text-4xl font-extrabold accent-gradient-text">
            {cgpa === null ? "—" : <AnimatedNumber value={cgpa} decimals={2} />}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            {completed} completed semester{completed === 1 ? "" : "s"}
          </p>
        </div>
        {current.sgpa !== null && (
          <>
            <div className="h-12 w-px bg-line/10" />
            <div className="text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted">
                Incl. this sem
              </p>
              <p className="mt-1 text-4xl font-extrabold text-good-deep">
                {cgpaWithCurrent === null ? "—" : <AnimatedNumber value={cgpaWithCurrent} decimals={2} />}
              </p>
              <p className="mt-0.5 text-[11px] text-muted">predicted so far</p>
            </div>
          </>
        )}
      </section>

      <Button className="w-full" onClick={archiveNow} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
        Archive current semester
      </Button>

      {!hasArchives ? (
        <section className="card">
          <EmptyState
            icon={GraduationCap}
            title="No past semesters yet"
            description="When a semester ends, archive it here — its SGPA and per-subject brief are saved, and your CGPA builds up automatically."
            className="py-8"
          />
        </section>
      ) : (
        <div className="space-y-3">
          {(archives ?? []).map((a, i) => (
            <SemesterCard
              key={a.id}
              archive={a}
              index={i}
              onDelete={(arc) => {
                if (window.confirm(`Delete the saved record for ${arc.label}?`)) {
                  deleteArchive.mutate(arc.id);
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

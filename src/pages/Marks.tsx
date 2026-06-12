import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Pencil, Plus, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Dot, Skeleton } from "@/components/ui/misc";
import { SgpaDial } from "@/components/viz/sgpa-dial";
import { GradeBadge } from "@/components/viz/grade-badge";
import { AnimatedNumber } from "@/components/viz/animated-number";
import { MarkSheet } from "@/components/sheets/mark-sheet";
import { useMarks, useSubjects } from "@/hooks/useData";
import { computeSgpa, type SubjectMarks } from "@/lib/grades";
import { cn } from "@/lib/utils";
import type { Mark, Subject } from "@/types";

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
      <motion.div
        className="h-full rounded-full"
        style={{ backgroundColor: color }}
        initial={{ width: 0 }}
        animate={{ width: `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%` }}
        transition={{ type: "spring", stiffness: 60, damping: 18 }}
      />
    </div>
  );
}

function SubjectMarksCard({
  subject,
  marks,
  index,
  onAdd,
  onEdit,
}: {
  subject: Subject;
  marks: SubjectMarks;
  index: number;
  onAdd: (subject: Subject, external: boolean) => void;
  onEdit: (subject: Subject, mark: Mark) => void;
}) {
  const audit = subject.credits === 0;

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 26, delay: index * 0.04 }}
      className="card p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-bold">
            <Dot color={subject.color_hex} />
            <span className="truncate">{subject.name}</span>
          </p>
          <p className="mt-0.5 text-xs font-medium text-muted">
            {subject.code} · {audit ? "audit (no SGPA)" : `${subject.credits} credits`}
          </p>
        </div>
        {marks.hasAnyMarks ? (
          <GradeBadge grade={marks.grade} />
        ) : (
          <Badge className="bg-surface-2 text-muted">no marks</Badge>
        )}
      </div>

      {/* Internal /60 and external /40 bars */}
      <div className="mt-4 space-y-3">
        <div>
          <div className="mb-1.5 flex items-baseline justify-between text-xs font-semibold">
            <span className="text-muted">Internal · scaled to 60</span>
            <span className="tabular">
              <AnimatedNumber value={marks.internal60} decimals={1} />
              <span className="text-muted"> / 60</span>
            </span>
          </div>
          <Bar value={marks.internal60} max={60} color={subject.color_hex} />
        </div>
        <div>
          <div className="mb-1.5 flex items-baseline justify-between text-xs font-semibold">
            <span className="text-muted">External · scaled to 40</span>
            <span className="tabular">
              <AnimatedNumber value={marks.external40} decimals={1} />
              <span className="text-muted"> / 40</span>
            </span>
          </div>
          <Bar value={marks.external40} max={40} color="hsl(var(--accent-2))" />
        </div>
      </div>

      {/* Components */}
      {marks.internalComponents.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {marks.internalComponents.map((m) => (
            <button
              key={m.id}
              onClick={() => onEdit(subject, m)}
              className="group flex items-center gap-1.5 rounded-xl border bg-surface-2/50 px-2.5 py-1.5 text-xs font-semibold transition-colors hover:bg-surface-2"
            >
              {m.label}
              <span className="tabular text-muted">
                {m.marks_obtained}/{m.max_marks}
              </span>
              <Pencil className="h-3 w-3 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          ))}
          {marks.external && (
            <button
              onClick={() => onEdit(subject, marks.external!)}
              className="group flex items-center gap-1.5 rounded-xl border border-accent/30 bg-accent/10 px-2.5 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/15"
            >
              {marks.external.label}
              <span className="tabular">
                {marks.external.marks_obtained}/{marks.external.max_marks}
              </span>
              <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-t pt-4">
        <p className="text-sm font-bold tabular">
          Total{" "}
          <span className={cn(marks.hasAnyMarks ? "text-ink" : "text-muted")}>
            <AnimatedNumber value={marks.total} decimals={1} />
          </span>
          <span className="text-muted"> / 100</span>
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => onAdd(subject, false)}>
            <Plus className="h-3.5 w-3.5" /> Internal
          </Button>
          {!marks.external && (
            <Button variant="outline" size="sm" onClick={() => onAdd(subject, true)}>
              <Plus className="h-3.5 w-3.5" /> External
            </Button>
          )}
        </div>
      </div>
    </motion.section>
  );
}

export default function Marks() {
  const { data: subjects, isLoading: sLoading } = useSubjects();
  const { data: marks, isLoading: mLoading } = useMarks();

  const [sheetSubject, setSheetSubject] = useState<Subject | null>(null);
  const [sheetMark, setSheetMark] = useState<Mark | null>(null);
  const [sheetExternal, setSheetExternal] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const result = useMemo(() => {
    const bySubject = new Map<string, Mark[]>();
    for (const m of marks ?? []) {
      const list = bySubject.get(m.subject_id) ?? [];
      list.push(m);
      bySubject.set(m.subject_id, list);
    }
    return computeSgpa(subjects ?? [], bySubject);
  }, [subjects, marks]);

  if (sLoading || mLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="px-1 text-2xl font-extrabold tracking-tight lg:text-3xl">Marks</h1>

      <section className="card flex flex-col items-center gap-2 p-6 lg:flex-row lg:justify-between lg:px-10">
        <SgpaDial sgpa={result.sgpa} />
        <div className="flex flex-col items-center gap-1 lg:items-end">
          <p className="flex items-center gap-2 text-sm font-semibold text-muted">
            <Target className="h-4 w-4" />
            {result.countedSubjects === 0
              ? "Add marks to see your predicted SGPA"
              : `Predicted from ${result.countedSubjects} subject${result.countedSubjects > 1 ? "s" : ""} · ${result.totalCredits} credits`}
          </p>
          <p className="max-w-xs text-center text-xs text-muted lg:text-right">
            O ≥ 91 · A+ ≥ 81 · A ≥ 71 · B+ ≥ 61 · B ≥ 56 · C ≥ 50
          </p>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {result.rows.map(({ subject, marks: m }, i) => (
          <SubjectMarksCard
            key={subject.id}
            subject={subject}
            marks={m}
            index={i}
            onAdd={(s, external) => {
              setSheetSubject(s);
              setSheetMark(null);
              setSheetExternal(external);
              setSheetOpen(true);
            }}
            onEdit={(s, mark) => {
              setSheetSubject(s);
              setSheetMark(mark);
              setSheetOpen(true);
            }}
          />
        ))}
      </div>

      <MarkSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        subject={sheetSubject}
        mark={sheetMark}
        defaultExternal={sheetExternal}
      />
    </div>
  );
}

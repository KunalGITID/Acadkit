import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Pencil, Plus, Target, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Dot, Skeleton } from "@/components/ui/misc";
import { SgpaDial } from "@/components/viz/sgpa-dial";
import { GradeBadge } from "@/components/viz/grade-badge";
import { AnimatedNumber } from "@/components/viz/animated-number";
import { MarkSheet } from "@/components/sheets/mark-sheet";
import { MarksCalculators } from "@/components/marks/calculators";
import { useMarks, useSubjects } from "@/hooks/useData";
import { Segmented } from "@/components/ui/segmented";
import { computeSgpa, groupMarksBySubject, type SubjectMarks } from "@/lib/grades";
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
  onAdd: (subject: Subject) => void;
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
            {subject.internal_only ? " · internals = /100" : ""}
          </p>
        </div>
        {marks.hasAnyMarks ? (
          <GradeBadge grade={marks.grade} />
        ) : (
          <Badge className="bg-surface-2 text-muted">no marks</Badge>
        )}
      </div>

      {/* Internals so far (raw) */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-baseline justify-between text-xs font-semibold">
          <span className="text-muted">Internals so far</span>
          <span className="tabular">
            <AnimatedNumber value={marks.internalObtained} decimals={0} />
            <span className="text-muted"> / {marks.internalMax}</span>
          </span>
        </div>
        <Bar value={marks.internalObtained} max={marks.internalMax} color={subject.color_hex} />
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
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-t pt-4">
        {marks.hasAnyMarks ? (
          <p className="flex items-center gap-1.5 text-sm font-bold tabular">
            <TrendingUp className="h-4 w-4 text-accent" />
            On pace for <AnimatedNumber value={marks.predictedTotal} decimals={0} />
            <span className="text-muted">/ 100</span>
          </p>
        ) : (
          <p className="text-sm font-semibold text-muted">No internals yet</p>
        )}
        <Button variant="secondary" size="sm" onClick={() => onAdd(subject)}>
          <Plus className="h-3.5 w-3.5" /> Add marks
        </Button>
      </div>
    </motion.section>
  );
}

export default function Marks() {
  const { data: subjects, isLoading: sLoading } = useSubjects();
  const { data: marks, isLoading: mLoading } = useMarks();

  const [view, setView] = useState<"marks" | "calculator">("marks");
  const [sheetSubject, setSheetSubject] = useState<Subject | null>(null);
  const [sheetMark, setSheetMark] = useState<Mark | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const result = useMemo(
    () => computeSgpa(subjects ?? [], groupMarksBySubject(marks ?? [])),
    [subjects, marks]
  );

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
      <div className="flex items-center justify-between gap-3 px-1">
        <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">Marks</h1>
        <Segmented
          layoutId="marks-view"
          options={[
            { value: "marks", label: "Marks" },
            { value: "calculator", label: "Calculator" },
          ]}
          value={view}
          onChange={setView}
          className="w-56"
        />
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {view === "marks" ? (
          <motion.div
            key="marks-view"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="space-y-4"
          >
            <section className="card flex flex-col items-center gap-2 p-6 lg:flex-row lg:justify-between lg:px-10">
              <SgpaDial sgpa={result.sgpa} />
              <div className="flex flex-col items-center gap-1 lg:items-end">
                <p className="flex items-center gap-2 text-sm font-semibold text-muted">
                  <Target className="h-4 w-4" />
                  {result.countedSubjects === 0
                    ? "Add internal marks to see your predicted SGPA"
                    : `Predicted from ${result.countedSubjects} subject${result.countedSubjects > 1 ? "s" : ""} · ${result.totalCredits} credits`}
                </p>
                <p className="max-w-xs text-center text-xs text-muted lg:text-right">
                  Grades projected from your internal performance so far — O ≥ 91 · A+ ≥ 81 ·
                  A ≥ 71 · B+ ≥ 61 · B ≥ 56 · C ≥ 50
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
                  onAdd={(s) => {
                    setSheetSubject(s);
                    setSheetMark(null);
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
          </motion.div>
        ) : (
          <motion.div
            key="calculator-view"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
          >
            <MarksCalculators rows={result.rows} />
          </motion.div>
        )}
      </AnimatePresence>

      <MarkSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        subject={sheetSubject}
        mark={sheetMark}
        existing={(marks ?? []).filter((m) => m.subject_id === sheetSubject?.id)}
      />
    </div>
  );
}

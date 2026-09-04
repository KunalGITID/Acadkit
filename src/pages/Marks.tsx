import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { Pencil, Plus, Share2, Target, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Dot, Skeleton } from "@/components/ui/misc";
import { SgpaDial } from "@/components/viz/sgpa-dial";
import { GradeBadge } from "@/components/viz/grade-badge";
import { AnimatedNumber } from "@/components/viz/animated-number";
import { MarkTrend } from "@/components/viz/mark-trend";
import { MarkSheet } from "@/components/sheets/mark-sheet";
import { MarksCalculators } from "@/components/marks/calculators";
import {
  useAttendance,
  useMarks,
  usePortalSnapshots,
  useSettings,
  useSubjects,
} from "@/hooks/useData";
import { Segmented } from "@/components/ui/segmented";
import { say, VOICE } from "@/lib/voice";
import { useTone } from "@/hooks/useTone";
import { useSwipe } from "@/hooks/useSwipe";
import { slideTransition, slideVariants } from "@/lib/slide";
import { SwipeHint } from "@/components/ui/swipe-hint";
import { computeSgpa, groupMarksBySubject, type SubjectMarks } from "@/lib/grades";
import { buildShareData, renderShareCard, shareCard } from "@/lib/shareCard";
import { computeOverallAttendance } from "@/lib/attendance";
import type { Mark, Subject } from "@/types";

/**
 * Renders the semester to a PNG and hands it to the OS share sheet,
 * falling back to a download where Web Share can't take files.
 */
function ShareButton({
  rows,
  sgpa,
}: {
  rows: Array<{ subject: Subject; marks: SubjectMarks }>;
  sgpa: number | null;
}) {
  const { data: settings } = useSettings();
  const { data: attendance } = useAttendance();
  const { data: snapshots } = usePortalSnapshots();
  const [busy, setBusy] = useState(false);

  async function onShare() {
    setBusy(true);
    try {
      const overall = computeOverallAttendance(
        rows.map((r) => r.subject),
        attendance ?? [],
        snapshots ?? []
      );
      const data = buildShareData({
        name: settings?.name,
        semester: settings?.semester,
        sgpa,
        attendancePct: overall.percentage,
        subjects: rows.map((r) => ({
          code: r.subject.code,
          grade: r.marks.grade,
          color: r.subject.color_hex,
          hasMarks: r.marks.hasAnyMarks,
        })),
      });
      const blob = await renderShareCard(data);
      const how = await shareCard(blob, "acadkit-semester.png");
      toast.success(how === "shared" ? "Shared" : "Image saved");
    } catch (err) {
      toast.error((err as Error)?.message ?? "Couldn't create the image");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      className="shrink-0"
      disabled={busy}
      onClick={onShare}
    >
      <Share2 className="h-4 w-4" />
      {busy ? "Rendering…" : "Share"}
    </Button>
  );
}

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
  const tone = useTone();
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
          <p className="flex items-start gap-2 font-bold">
            <Dot color={subject.color_hex} className="mt-1.5 shrink-0" />
            <span className="line-clamp-2">{subject.name}</span>
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
        {marks.internalComponents.length > 1 && (
          <MarkTrend
            marks={marks.internalComponents}
            color={subject.color_hex}
            className="mt-3"
          />
        )}
      </div>

      {/* Components */}
      {marks.internalComponents.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {marks.internalComponents.map((m) => (
            <button
              key={m.id}
              onClick={() => onEdit(subject, m)}
              // px/py rather than a fixed height so the chip still hugs
              // its label; py-3 takes it from 30px to a tappable 42.
              className="group flex items-center gap-1.5 rounded-xl border bg-surface-2/50 px-3 py-3 text-xs font-semibold transition-colors hover:bg-surface-2"
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
          <p className="text-sm font-semibold text-muted">{say(VOICE.noInternals, tone)}</p>
        )}
        <Button variant="secondary" size="sm" onClick={() => onAdd(subject)}>
          <Plus className="h-3.5 w-3.5" /> Add marks
        </Button>
      </div>
    </motion.section>
  );
}

export default function Marks() {
  const tone = useTone();
  const { data: subjects, isLoading: sLoading } = useSubjects();
  const { data: marks, isLoading: mLoading } = useMarks();

  const [view, setView] = useState<"marks" | "calculator">("marks");
  // The segmented control stays; this just means you don't have to
  // reach for it.
  // Direction drives the slide, so content moves the way you pushed it.
  const [dir, setDir] = useState(0);
  const [swiped, setSwiped] = useState(false);
  const goView = (next: "marks" | "calculator", delta: number) => {
    setDir(delta);
    setSwiped(true);
    setView(next);
  };
  const marksSwipe = useSwipe(
    () => goView("calculator", 1),
    () => goView("marks", -1)
  );
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
    <div className="relative space-y-4">
      {/* Title, switcher and Share shared one row, and on a 390px phone
          the three didn't fit — Share was clipped off the right edge.
          They stack until there is room for a row. */}
      <div className="flex flex-col gap-3 px-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">
            {say(VOICE.titleMarks, tone)}
          </h1>
          {say(VOICE.subMarks, tone) && (
            <p className="mt-0.5 text-xs italic text-muted">
              ({say(VOICE.subMarks, tone)})
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Segmented
            layoutId="marks-view"
            options={[
              { value: "marks", label: "Marks" },
              { value: "calculator", label: "Calculator" },
            ]}
            value={view}
            onChange={(v) =>
              goView(v as "marks" | "calculator", v === "calculator" ? 1 : -1)
            }
            className="min-w-0 flex-1 sm:w-56 sm:flex-none"
          />
          <ShareButton rows={result.rows} sgpa={result.sgpa} />
        </div>
      </div>

      <SwipeHint id="marks" dismissed={swiped} />

      <div data-swipe {...marksSwipe}>
      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        {view === "marks" ? (
          <motion.div
            key="marks-view"
            custom={dir}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={slideTransition}
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
            custom={dir}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={slideTransition}
          >
            <MarksCalculators rows={result.rows} />
          </motion.div>
        )}
      </AnimatePresence>
      </div>

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

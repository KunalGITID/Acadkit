import { BookOpen } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSwipeTabs } from "@/hooks/useSwipeTabs";
import { SubjectMarksCard } from "@/components/marks/SubjectMarksCard";
import { GradeBadge } from "@/components/ui/grade-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MarksProgress } from "@/components/ui/marks-progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAllSubjectsSGPA,
  useMarks,
  useSubjectMarksDetail,
} from "@/hooks/useMarks";
import { useSettings } from "@/hooks/useSettings";
import { useSubjects } from "@/hooks/useSubjects";
import {
  GRADE_OPTIONS,
  computeSGPA,
  getGrade,
  predictRequiredExternal,
  scaleInternalTo60,
  type SubjectSGPAResult,
} from "@/lib/sgpa";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";
import type { Mark, Subject } from "@/types/database";

type Tab = "marks" | "analytics" | "calculator";
const TABS = ["marks", "analytics", "calculator"] as const satisfies readonly Tab[];

interface SubjectMarksProgress {
  internalScaled: number;
  externalMark: number | null;
  totalMark: number | null;
}

const GRADE_POINT_ORDER = [
  { grade: "O", points: 10 },
  { grade: "A+", points: 9 },
  { grade: "A", points: 8 },
  { grade: "B+", points: 7 },
  { grade: "B", points: 6 },
  { grade: "C", points: 5 },
  { grade: "F", points: 0 },
];

function gradeForRequiredPoints(points: number): string {
  const target = Math.max(0, points);
  const match = [...GRADE_POINT_ORDER]
    .reverse()
    .find((item) => item.points >= target);
  return match?.grade ?? "O";
}

export default function MarksPage() {
  const [tab, setTab] = useState<Tab>("marks");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const swipe = useSwipeTabs(TABS, tab, setTab);

  const subjectsQuery = useSubjects();
  const marksQuery = useMarks();
  useSettings();

  const subjects = useAppStore((s) => s.subjects);
  const settings = useAppStore((s) => s.settings);
  const { results, sgpa } = useAllSubjectsSGPA();

  const isLoading = subjectsQuery.isLoading || marksQuery.isLoading;
  const isError = subjectsQuery.isError || marksQuery.isError;
  const completedCount = results.filter((result) => result.isComplete).length;

  return (
    <main
      className="min-h-screen bg-background pb-24"
      onTouchStart={swipe.onTouchStart}
      onTouchEnd={swipe.onTouchEnd}
    >
      <header className="sticky top-0 z-40 border-b border-[#1e1e2e] bg-background/95 px-4 pb-3 pt-4 backdrop-blur">
        <h1 className="font-syne text-xl font-bold text-foreground">Marks</h1>
        <div className="mt-3 flex rounded-lg bg-[#111118] p-1">
          {(["marks", "analytics", "calculator"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={cn(
                "relative flex-1 rounded-md py-2 text-xs font-medium transition-all",
                tab === item
                  ? "text-[#7c6af7]"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {item === "marks" ? "Marks" : item === "analytics" ? "Analytics" : "Calculator"}
              {tab === item && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-[#7c6af7]" />
              )}
            </button>
          ))}
        </div>
      </header>

      {isLoading ? (
        <div className="space-y-3 px-4 py-4">
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
        </div>
      ) : isError ? (
        <StateMessage
          title="Could not load marks"
          body="Check your connection and try again."
        />
      ) : tab === "marks" ? (
        <MarksTab
          subjects={subjects}
          expandedId={expandedId}
          onExpand={setExpandedId}
        />
      ) : tab === "analytics" ? (
        <AnalyticsTab
          results={results}
          sgpa={sgpa}
          subjects={subjects}
          allMarks={marksQuery.data ?? []}
          completedCount={completedCount}
        />
      ) : (
        <CalculatorTab
          results={results}
          sgpa={sgpa}
          subjects={subjects}
          allMarks={marksQuery.data ?? []}
          targetSgpa={settings?.target_sgpa ?? null}
        />
      )}
    </main>
  );
}

function MarksTab({
  subjects,
  expandedId,
  onExpand,
}: {
  subjects: Subject[];
  expandedId: string | null;
  onExpand: (subjectId: string | null) => void;
}) {
  if (subjects.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-16 text-center">
        <BookOpen className="mb-4 h-12 w-12 text-muted-foreground/40" />
        <p className="font-syne text-lg text-foreground">No subjects yet</p>
        <p className="mt-2 text-sm text-muted-foreground">Add subjects in Timetable → Manage</p>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 space-y-3 px-4 py-4 duration-300">
      {subjects.map((subject) => (
        <SubjectMarksCard
          key={subject.id}
          subject={subject}
          open={expandedId === subject.id}
          onOpenChange={(open) => onExpand(open ? subject.id : null)}
        />
      ))}
    </div>
  );
}

function AnalyticsTab({
  results,
  sgpa,
  subjects,
  allMarks,
  completedCount,
}: {
  results: SubjectSGPAResult[];
  sgpa: number | null;
  subjects: Subject[];
  allMarks: Mark[];
  completedCount: number;
}) {
  const [fillAllValue, setFillAllValue] = useState("");
  const [assumedExternals, setAssumedExternals] = useState<Record<string, string>>({});

  const progressBySubject = useMemo(
    () => getMarksProgressBySubject(subjects, allMarks),
    [subjects, allMarks]
  );

  const incompleteSubjects = results.filter((r) => !r.isComplete);

  const projectedSgpa = useMemo(() => {
    const projected = results.map((result) => {
      if (result.isComplete) return result;
      const raw = assumedExternals[result.subjectId];
      if (!raw || raw === "") return result;
      const val = Number(raw);
      if (isNaN(val) || val < 0 || val > 40) return result;
      const progress = progressBySubject[result.subjectId];
      const internalScaled = progress?.internalScaled ?? 0;
      const total = Math.round((internalScaled + val) * 100) / 100;
      const { grade, points } = getGrade(total);
      return {
        ...result,
        gradeResult: {
          grade,
          gradePoints: points,
          totalMark: total,
          internalScaled,
          externalMark: val,
          percentage: total,
        },
        isComplete: true,
      };
    });
    return computeSGPA(projected);
  }, [results, assumedExternals, progressBySubject]);

  const handleFillAll = () => {
    const val = fillAllValue.trim();
    if (!val) return;
    const filled: Record<string, string> = {};
    incompleteSubjects.forEach((r) => {
      filled[r.subjectId] = val;
    });
    setAssumedExternals(filled);
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 space-y-4 px-4 py-4 duration-300">
      <section className="rounded-lg border border-[#1e1e2e] bg-[#111118] px-6 py-8 text-center">
        <p className="text-sm text-muted-foreground">Current SGPA</p>
        <p className="font-syne text-5xl font-bold text-[#7c6af7]">
          {sgpa !== null ? sgpa.toFixed(2) : "-"}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Based on {completedCount} completed subject
          {completedCount === 1 ? "" : "s"}
        </p>
        {projectedSgpa !== null && (
          <div className="mt-3 border-t border-[#1e1e2e] pt-3">
            <p className="text-xs text-muted-foreground">Projected (with assumed externals)</p>
            <p className="font-syne text-2xl font-bold text-[#22d3ee]">
              {projectedSgpa.toFixed(2)}
            </p>
          </div>
        )}
      </section>

      {incompleteSubjects.length > 0 && (
        <section className="rounded-lg border border-[#1e1e2e] bg-[#111118] p-4">
          <h3 className="font-syne font-semibold">Projected SGPA</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Set expected externals for subjects with no End Sem yet
          </p>

          <div className="mt-3 flex items-center gap-2 border-b border-[#1e1e2e] pb-3">
            <Input
              type="number"
              min={0}
              max={40}
              step={0.5}
              value={fillAllValue}
              onChange={(e) => setFillAllValue(e.target.value)}
              placeholder="e.g. 35"
              className="w-20 font-mono text-xs"
            />
            <span className="text-xs text-muted-foreground">/40</span>
            <button
              type="button"
              onClick={handleFillAll}
              className="rounded-md bg-[#7c6af7]/20 px-3 py-1.5 text-xs font-medium text-[#c4b5fd] transition-colors hover:bg-[#7c6af7]/30"
            >
              Apply to all
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {incompleteSubjects.map((result) => {
              const progress = progressBySubject[result.subjectId];
              const raw = assumedExternals[result.subjectId] ?? "";
              const val = Number(raw);
              const hasValid = raw !== "" && !isNaN(val) && val >= 0 && val <= 40;
              const projTotal = hasValid
                ? Math.round(((progress?.internalScaled ?? 0) + val) * 100) / 100
                : null;
              const projGradeInfo = projTotal !== null ? getGrade(projTotal) : null;
              return (
                <div key={result.subjectId} className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {result.subjectName}
                  </p>
                  <div className="flex shrink-0 items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      max={40}
                      step={0.5}
                      value={raw}
                      onChange={(e) =>
                        setAssumedExternals((prev) => ({
                          ...prev,
                          [result.subjectId]: e.target.value,
                        }))
                      }
                      placeholder="—"
                      className="w-16 text-center font-mono text-xs"
                    />
                    <span className="shrink-0 text-xs text-muted-foreground">/40</span>
                  </div>
                  {projGradeInfo ? (
                    <GradeBadge grade={projGradeInfo.grade} size="sm" />
                  ) : (
                    <div className="w-10 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
          {projectedSgpa !== null && (
            <div className="mt-3 rounded-md bg-[#0a0a0f] p-3 text-center">
              <p className="text-xs text-muted-foreground">Projected SGPA</p>
              <p className="font-syne text-3xl font-bold text-[#22d3ee]">
                {projectedSgpa.toFixed(2)}
              </p>
            </div>
          )}
        </section>
      )}

      <SubjectBreakdown
        results={results}
        subjects={subjects}
        sgpa={sgpa}
        progressBySubject={progressBySubject}
      />
    </div>
  );
}

function CalculatorTab({
  results,
  sgpa,
  subjects,
  allMarks,
  targetSgpa,
}: {
  results: SubjectSGPAResult[];
  sgpa: number | null;
  subjects: Subject[];
  allMarks: Mark[];
  targetSgpa: number | null;
}) {
  const [predictSubjectId, setPredictSubjectId] = useState(subjects[0]?.id ?? "");
  const [targetGrade, setTargetGrade] = useState<string>("A");
  const [targetSgpaInput, setTargetSgpaInput] = useState(9.8);
  const [predictMode, setPredictMode] = useState<"ext-needed" | "int-needed">("ext-needed");
  const [predictExternalInput, setPredictExternalInput] = useState("35");
  const [cgpaRows, setCgpaRows] = useState<{ sgpa: string; credits: string }[]>(
    Array.from({ length: 8 }, () => ({ sgpa: "", credits: "" }))
  );

  useEffect(() => {
    if (!predictSubjectId && subjects[0]) {
      setPredictSubjectId(subjects[0].id);
    }
  }, [predictSubjectId, subjects]);

  const progressBySubject = useMemo(
    () => getMarksProgressBySubject(subjects, allMarks),
    [subjects, allMarks]
  );

  const selectedSubject = subjects.find((subject) => subject.id === predictSubjectId);
  const predictDetail = useSubjectMarksDetail(predictSubjectId);
  const requiredExternal = predictRequiredExternal(targetGrade, predictDetail.internalScaled);
  const targetGradeMin = getGradeThreshold(targetGrade);
  const alreadyAchieved =
    predictDetail.externalRecord !== null &&
    predictDetail.gradeResult !== null &&
    predictDetail.gradeResult.totalMark >= targetGradeMin;

  const predictExternalValue = Math.max(0, Math.min(40, Number(predictExternalInput) || 0));

  const cgpaResult = useMemo(() => {
    let totalPoints = 0;
    let totalCredits = 0;
    let semCount = 0;
    for (const row of cgpaRows) {
      const s = Number(row.sgpa);
      const c = Number(row.credits);
      if (row.sgpa !== "" && row.credits !== "" && !isNaN(s) && !isNaN(c) && c > 0 && s >= 0 && s <= 10) {
        totalPoints += s * c;
        totalCredits += c;
        semCount++;
      }
    }
    if (totalCredits === 0) return null;
    return { cgpa: Math.round((totalPoints / totalCredits) * 100) / 100, semCount, totalCredits };
  }, [cgpaRows]);

  const targetSgpaAnalysis = useMemo(
    () => calculateTargetSgpa(results, subjects, targetSgpaInput, progressBySubject),
    [progressBySubject, results, subjects, targetSgpaInput]
  );

  const onTrack = sgpa !== null && sgpa >= targetSgpaInput;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 space-y-4 px-4 py-4 duration-300">
      <section className="rounded-lg border border-[#1e1e2e] bg-[#111118] p-4">
        <h3 className="font-syne font-semibold">What do I need?</h3>

        <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-[#0a0a0f] p-1">
          <button
            type="button"
            onClick={() => setPredictMode("ext-needed")}
            className={cn(
              "rounded-md px-2 py-2 text-xs font-medium transition-colors",
              predictMode === "ext-needed"
                ? "bg-[#7c6af7]/20 text-[#c4b5fd]"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Internals → External needed
          </button>
          <button
            type="button"
            onClick={() => setPredictMode("int-needed")}
            className={cn(
              "rounded-md px-2 py-2 text-xs font-medium transition-colors",
              predictMode === "int-needed"
                ? "bg-[#22d3ee]/20 text-[#67e8f9]"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Set external → Internal needed
          </button>
        </div>

        <div className="mt-4 space-y-3 border-b border-[#1e1e2e] pb-4">
          <select
            value={predictSubjectId}
            onChange={(event) => setPredictSubjectId(event.target.value)}
            className="w-full rounded-md border border-input bg-[#0a0a0f] px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-[#7c6af7]/50"
          >
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>

          {predictMode === "ext-needed" ? (
            <>
              <p className="text-xs text-muted-foreground">
                Pick a target grade — how much End Sem do you need?
              </p>
              <div className="grid grid-cols-6 gap-1">
                {GRADE_OPTIONS.map((grade) => (
                  <button
                    key={grade}
                    type="button"
                    onClick={() => setTargetGrade(grade)}
                    className={cn(
                      "min-h-[34px] rounded-md border font-mono text-xs transition-colors",
                      targetGrade === grade
                        ? "border-[#7c6af7] bg-[#7c6af7]/20 text-[#c4b5fd]"
                        : "border-[#1e1e2e] bg-[#0a0a0f] text-muted-foreground"
                    )}
                  >
                    {grade}
                  </button>
                ))}
              </div>
              <div className="rounded-md bg-[#0a0a0f] p-3 font-mono text-xs">
                <p className="text-muted-foreground">
                  Internal scaled: {predictDetail.internalScaled.toFixed(1)}/60
                </p>
                {!selectedSubject ? (
                  <p className="mt-2 text-muted-foreground">Add a subject first.</p>
                ) : alreadyAchieved ? (
                  <p className="mt-2 text-[#4ade80]">
                    Already achieved {targetGrade}. Total:{" "}
                    {predictDetail.gradeResult?.totalMark.toFixed(1)}/100
                  </p>
                ) : predictDetail.externalRecord ? (
                  <p className="mt-2 text-foreground">
                    Current grade: {predictDetail.gradeResult?.grade ?? "?"}. Total:{" "}
                    {predictDetail.gradeResult?.totalMark.toFixed(1)}/100
                  </p>
                ) : requiredExternal > 40 ? (
                  <p className="mt-2 text-[#fb7185]">
                    {targetGrade} not reachable — would need {requiredExternal.toFixed(1)}/40.
                  </p>
                ) : (
                  <p className="mt-2 text-foreground">
                    Need {requiredExternal.toFixed(1)}/40 in End Sem to get {targetGrade}
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Set your expected external — see what internal total you need per grade
              </p>
              <div className="flex items-center gap-2">
                <Label className="shrink-0 text-xs text-muted-foreground">Expected external</Label>
                <Input
                  type="number"
                  min={0}
                  max={40}
                  step={0.5}
                  value={predictExternalInput}
                  onChange={(e) => setPredictExternalInput(e.target.value)}
                  className="w-20 font-mono text-xs"
                />
                <span className="text-xs text-muted-foreground">/40</span>
              </div>
              <div className="rounded-md bg-[#0a0a0f] p-3 font-mono text-xs">
                <p className="mb-2 text-muted-foreground">
                  Internal scaled: {predictDetail.internalScaled.toFixed(1)}/60
                </p>
                {(GRADE_OPTIONS as readonly string[]).map((grade) => {
                  const minTotal = getGradeThreshold(grade);
                  const neededInternal = Math.max(0, minTotal - predictExternalValue);
                  const achievable = neededInternal <= 60;
                  const alreadyMet = achievable && predictDetail.internalScaled >= neededInternal;
                  return (
                    <div key={grade} className="flex items-center justify-between gap-2 py-0.5">
                      <span
                        className={cn(
                          "w-7 rounded px-1 py-0.5 text-center font-medium",
                          alreadyMet
                            ? "bg-[#4ade80]/20 text-[#4ade80]"
                            : achievable
                              ? "bg-[#7c6af7]/10 text-[#c4b5fd]"
                              : "bg-[#fb7185]/10 text-[#fb7185]"
                        )}
                      >
                        {grade}
                      </span>
                      <span
                        className={cn(
                          "text-right",
                          alreadyMet
                            ? "text-[#4ade80]"
                            : achievable
                              ? "text-foreground"
                              : "text-[#fb7185]"
                        )}
                      >
                        {alreadyMet
                          ? "✓ already there"
                          : achievable
                            ? `need ${neededInternal.toFixed(1)}/60 internal`
                            : "not reachable"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">Target SGPA calculator</p>
          <div className="flex items-center gap-2">
            <Label className="shrink-0">Target SGPA</Label>
            <Input
              type="number"
              min={0}
              max={10}
              step={0.1}
              value={targetSgpaInput}
              onChange={(event) => setTargetSgpaInput(Number(event.target.value))}
              className="w-24 font-mono"
            />
          </div>
          <div className="rounded-md bg-[#0a0a0f] p-3">
            <p className="font-mono text-xs text-muted-foreground">
              {targetSgpaAnalysis.summary}
            </p>
            <p
              className={cn(
                "mt-1 text-xs font-medium",
                onTrack ? "text-[#4ade80]" : "text-amber-400"
              )}
            >
              {sgpa === null
                ? ""
                : onTrack
                  ? "On track"
                  : `${(targetSgpaInput - (sgpa ?? 0)).toFixed(2)} points needed`}
            </p>
          </div>
          {targetSgpaAnalysis.remaining.length > 0 && (
            <div className="space-y-1">
              {targetSgpaAnalysis.remaining.map((item) => (
                <div
                  key={item.subjectId}
                  className="flex items-center justify-between gap-2 rounded-md bg-[#0a0a0f] px-3 py-2 text-xs"
                >
                  <span className="min-w-0 truncate">{item.subjectName}</span>
                  <span
                    className={cn(
                      "shrink-0 text-right font-mono",
                      item.externalNeeded !== null && item.externalNeeded > 40
                        ? "text-[#fb7185]"
                        : "text-[#c4b5fd]"
                    )}
                  >
                    {item.gradeNeeded} ·{" "}
                    {item.externalNeeded === null
                      ? "add internals"
                      : item.externalNeeded > 40
                        ? `${item.externalNeeded.toFixed(1)}/40 impossible`
                        : `${item.externalNeeded.toFixed(1)}/40 End Sem`}
                  </span>
                </div>
              ))}
            </div>
          )}
          {targetSgpa !== null && targetSgpa !== targetSgpaInput && (
            <p className="text-[10px] text-muted-foreground">
              Saved target: {targetSgpa.toFixed(2)}
            </p>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-[#1e1e2e] bg-[#111118] p-4">
        <h3 className="font-syne font-semibold">CGPA Calculator</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Enter SGPA and credits for each semester
        </p>
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-[36px_1fr_1fr] gap-2 text-xs font-medium text-muted-foreground">
            <span>Sem</span>
            <span>SGPA</span>
            <span>Credits</span>
          </div>
          {cgpaRows.map((row, i) => (
            <div key={i} className="grid grid-cols-[36px_1fr_1fr] items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{i + 1}</span>
              <Input
                type="number"
                min={0}
                max={10}
                step={0.01}
                value={row.sgpa}
                onChange={(e) =>
                  setCgpaRows((prev) =>
                    prev.map((r, idx) => (idx === i ? { ...r, sgpa: e.target.value } : r))
                  )
                }
                placeholder="—"
                className="font-mono text-xs"
              />
              <Input
                type="number"
                min={0}
                step={1}
                value={row.credits}
                onChange={(e) =>
                  setCgpaRows((prev) =>
                    prev.map((r, idx) => (idx === i ? { ...r, credits: e.target.value } : r))
                  )
                }
                placeholder="—"
                className="font-mono text-xs"
              />
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-md bg-[#0a0a0f] p-3 text-center">
          {cgpaResult ? (
            <>
              <p className="text-xs text-muted-foreground">
                CGPA · {cgpaResult.semCount} sem{cgpaResult.semCount === 1 ? "" : "s"} · {cgpaResult.totalCredits} credits
              </p>
              <p className="font-syne text-3xl font-bold text-[#7c6af7]">
                {cgpaResult.cgpa.toFixed(2)}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Enter SGPA and credits above to calculate CGPA
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function SubjectBreakdown({
  results,
  subjects,
  sgpa,
  progressBySubject,
}: {
  results: SubjectSGPAResult[];
  subjects: Subject[];
  sgpa: number | null;
  progressBySubject: Record<string, SubjectMarksProgress>;
}) {
  return (
    <section className="overflow-x-auto rounded-lg border border-[#1e1e2e]">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-[#1e1e2e] bg-[#111118] text-xs text-muted-foreground">
          <tr>
            <th className="p-3 font-medium">Subject</th>
            <th className="p-3 font-medium">Credits</th>
            <th className="p-3 font-medium">Internal</th>
            <th className="p-3 font-medium">External</th>
            <th className="p-3 font-medium">Total</th>
            <th className="p-3 font-medium">Grade</th>
            <th className="p-3 font-medium">Points</th>
          </tr>
        </thead>
        <tbody>
          {results.map((result) => {
            const subject = subjects.find((item) => item.id === result.subjectId);
            const gradeResult = result.gradeResult;
            const progress = progressBySubject[result.subjectId];

            return (
              <tr
                key={result.subjectId}
                className="border-b border-[#1e1e2e]/70 bg-[#0a0a0f] last:border-b-0"
              >
                <td className="p-3">
                  <p className="max-w-[150px] truncate font-syne font-medium">
                    {result.subjectName}
                  </p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {subject?.code}
                  </p>
                </td>
                <td className="p-3 font-mono">{result.credits}</td>
                <td className="p-3">
                  {progress && progress.internalScaled > 0 ? (
                    <div className="w-28">
                      <MarksProgress
                        obtained={progress.internalScaled}
                        max={60}
                        color="#38bdf8"
                      />
                    </div>
                  ) : (
                    <span className="font-mono text-xs text-muted-foreground">-</span>
                  )}
                </td>
                <td className="p-3 font-mono text-xs">
                  {progress?.externalMark !== null && progress?.externalMark !== undefined
                    ? `${progress.externalMark.toFixed(1)}/40`
                    : "-"}
                </td>
                <td className="p-3 font-mono text-xs">
                  {gradeResult ? `${gradeResult.totalMark.toFixed(1)}/100` : "-"}
                </td>
                <td className="p-3">
                  <GradeBadge grade={gradeResult?.grade ?? null} size="sm" />
                </td>
                <td className="p-3 font-mono">
                  {gradeResult?.gradePoints ?? "-"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t border-[#1e1e2e] bg-[#111118] p-3 font-mono text-xs text-muted-foreground">
        SGPA = sum(points × credits) / sum(credits)
        {sgpa !== null ? ` = ${sgpa.toFixed(2)}` : " = -"}
      </p>
    </section>
  );
}

function StateMessage({ title, body }: { title: string; body?: string }) {
  return (
    <div className="px-6 py-16 text-center">
      <p className="font-syne text-foreground">{title}</p>
      {body && <p className="mt-2 text-sm text-muted-foreground">{body}</p>}
    </div>
  );
}

function getGradeThreshold(grade: string): number {
  const thresholds: Record<string, number> = {
    O: 91,
    "A+": 81,
    A: 71,
    "B+": 61,
    B: 56,
    C: 50,
    F: 0,
  };
  return thresholds[grade] ?? 50;
}

function getMarksProgressBySubject(subjects: Subject[], marks: Mark[]) {
  return subjects.reduce<Record<string, SubjectMarksProgress>>(
    (progress, subject) => {
      const subjectMarks = marks.filter((mark) => mark.subject_id === subject.id);
      const internalRecords = subjectMarks.filter((mark) => !mark.is_external);
      const externalRecord = subjectMarks.find((mark) => mark.is_external) ?? null;
      const internalScaled = scaleInternalTo60(internalRecords);
      const externalMark = externalRecord
        ? Math.round(
            (externalRecord.marks_obtained / externalRecord.max_marks) * 40 * 100
          ) / 100
        : null;

      progress[subject.id] = {
        internalScaled,
        externalMark,
        totalMark:
          externalMark === null
            ? null
            : Math.round((internalScaled + externalMark) * 100) / 100,
      };
      return progress;
    },
    {}
  );
}

function calculateTargetSgpa(
  results: SubjectSGPAResult[],
  subjects: Subject[],
  targetSgpa: number,
  progressBySubject: Record<string, SubjectMarksProgress>
) {
  const totalCredits = subjects.reduce((sum, subject) => sum + subject.credits, 0);
  const earnedPoints = results.reduce(
    (sum, result) =>
      sum + (result.gradeResult?.gradePoints ?? 0) * result.credits,
    0
  );
  const remaining = results.filter((result) => !result.isComplete);
  const remainingCredits = remaining.reduce(
    (sum, result) => sum + result.credits,
    0
  );

  if (subjects.length === 0) {
    return { summary: "Add subjects to use the calculator.", remaining: [] };
  }

  if (remainingCredits === 0) {
    return { summary: "All subjects have complete marks.", remaining: [] };
  }

  const neededPoints =
    (targetSgpa * totalCredits - earnedPoints) / remainingCredits;
  const roundedNeeded = Math.round(neededPoints * 100) / 100;
  const impossible = roundedNeeded > 10;
  const alreadyCovered = roundedNeeded <= 0;
  const gradeNeeded = alreadyCovered
    ? "F"
    : gradeForRequiredPoints(roundedNeeded);
  const targetGradeMinimum = getGradeThreshold(gradeNeeded);

  return {
    summary: impossible
      ? `Target ${targetSgpa.toFixed(2)} is not reachable from the remaining credits.`
      : alreadyCovered
        ? `You have enough earned points for ${targetSgpa.toFixed(2)}.`
        : `You need about ${roundedNeeded.toFixed(2)} points on average across remaining subjects.`,
    remaining: remaining.map((result) => {
      const progress = progressBySubject[result.subjectId];
      const externalNeeded = progress
        ? Math.max(0, targetGradeMinimum - progress.internalScaled)
        : null;

      return {
        subjectId: result.subjectId,
        subjectName: result.subjectName,
        gradeNeeded: impossible ? "O+" : gradeNeeded,
        externalNeeded: impossible ? 41 : externalNeeded,
      };
    }),
  };
}

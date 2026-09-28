import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, GraduationCap, ListPlus, TriangleAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SemesterSetupSheet } from "@/components/sheets/semester-setup-sheet";
import { usePin } from "@/hooks/useData";
import { fetchCurriculum } from "@/api/studyFiles";
import { degreeProgress, graduationLadder, takenCodes, upcomingInWeakAreas } from "@/lib/curriculum";
import type { SemesterArchive } from "@/types";

/** The whole degree from the curriculum (lib/curriculum.ts): credits done, under way and left; the average SGPA the rest of it needs for a final CGPA, taking this semester at your target; the courses ahead in an area that has gone badly; and setting up the next semester's subjects. */
export function DegreePlan({
  archives,
  currentCredits,
  currentCodes,
  targetSgpa,
  semester,
}: {
  archives: SemesterArchive[];
  currentCredits: number;
  currentCodes: string[];
  targetSgpa: number;
  semester: number;
}) {
  const pin = usePin();
  const cur = useQuery({ queryKey: ["curriculum", pin], queryFn: () => fetchCurriculum(pin), staleTime: 60 * 60_000 });
  const [setup, setSetup] = useState(false);

  const plan = useMemo(() => {
    if (!cur.data) return null;
    const taken = takenCodes(archives, currentCodes);
    return {
      progress: degreeProgress(cur.data, archives, currentCredits),
      ladder: graduationLadder(cur.data, archives, currentCredits, targetSgpa, [8, 8.14, 8.5, 9]),
      weak: upcomingInWeakAreas(cur.data, archives, taken, semester),
    };
  }, [cur.data, archives, currentCredits, currentCodes, targetSgpa, semester]);

  if (!cur.data || !plan) return null;
  const { progress: p, ladder, weak } = plan;
  const pct = (n: number) => `${(100 * n) / p.total}%`;

  return (
    <section className="card space-y-4 p-5">
      <div className="flex items-center gap-2">
        <GraduationCap className="h-4 w-4 text-accent" />
        <p className="font-bold">Degree plan</p>
        <span className="ml-auto text-xs font-semibold text-muted tabular">
          {p.done + p.current}/{p.total} credits
        </span>
      </div>

      <div>
        <div className="flex h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
          <span className="bg-good" style={{ width: pct(p.done) }} />
          <span className="bg-accent/60" style={{ width: pct(p.current) }} />
        </div>
        <p className="mt-1.5 text-[11px] font-medium text-muted">
          {p.done} done · {p.current} this semester · {p.remaining} to go
        </p>
      </div>

      {p.remaining > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted">To graduate with</p>
          <ul className="mt-2 space-y-1.5">
            {ladder.map((r) => (
              <li key={r.target} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-bold tabular">{r.target.toFixed(2).replace(/0$/, "")} CGPA</span>
                {r.verdict === "impossible" ? (
                  <span className="text-xs font-semibold text-muted">out of reach</span>
                ) : r.verdict === "secured" ? (
                  <span className="text-xs font-semibold text-good-deep">already safe</span>
                ) : (
                  <span className="text-xs font-semibold">
                    average <b className="tabular text-accent">{r.needed!.toFixed(2)}</b> SGPA after this
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted">
            Taking this semester at your {targetSgpa.toFixed(2)} target, over the {p.remaining} credits left.
          </p>
        </div>
      )}

      {weak.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-2xl bg-warn/10 px-3 py-2.5 text-xs font-medium">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn-deep" />
          <p>
            <span className="font-bold text-ink">Coming up in your hardest area:</span>{" "}
            {weak.map((w, i) => (
              <span key={w.course.code}>
                {i > 0 && ", "}
                <Link to={`/subject/${w.course.code}`} className="font-semibold text-ink underline underline-offset-2">
                  {w.course.title}
                </Link>{" "}
                (Sem {w.semester}, {w.course.credits} cr)
              </span>
            ))}
            . Worth starting early: each opens its syllabus with a head-start deck.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" className="w-full" onClick={() => setSetup(true)}>
          <ListPlus className="h-4 w-4" /> Set up semester
        </Button>
        <Link
          to="/electives"
          className="flex h-11 items-center justify-center gap-1 rounded-2xl bg-surface-2 text-sm font-semibold text-ink hover:bg-surface-2/70"
        >
          Electives <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      <SemesterSetupSheet
        open={setup}
        onClose={() => setSetup(false)}
        curriculum={cur.data}
        archives={archives}
        currentCodes={currentCodes}
        defaultSemester={Math.min(semester + 1, cur.data.semesters.length)}
      />
    </section>
  );
}

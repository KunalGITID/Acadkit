import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useMarks, useSubjects } from "@/hooks/useData";
import { groupMarksBySubject, GRADE_COLORS } from "@/lib/grades";
import { currentOutcome, gradeThresholds, whatIfMark, type WhatIfComponent } from "@/lib/whatIf";
import { floorTotal } from "@/lib/plan";

/** Up to 2 decimals, no trailing zeros: SRM marks keep their decimals (9.34, 9.6, 10). */
function fmt(v: number): string {
  return String(Number(v.toFixed(2)));
}

/** "What if I get this?" - the budget, run backwards. */
export function WhatIf({
  subjectId,
  component,
}: {
  subjectId: string;
  component: WhatIfComponent;
}) {
  const { data: subjects } = useSubjects();
  const { data: marks } = useMarks();

  const input = useMemo(
    () => ({
      subjects: subjects ?? [],
      marksBySubject: groupMarksBySubject(marks ?? []),
      subjectId,
      component,
    }),
    [subjects, marks, subjectId, component]
  );

  // Opens on full marks: the optimistic end is the one people reach for
  // first, and it makes the ceiling of the control obvious.
  const [obtained, setObtained] = useState(component.max);

  const now = useMemo(() => currentOutcome(input), [input]);
  const imagined = useMemo(() => whatIfMark(input, obtained), [input, obtained]);
  const steps = useMemo(() => gradeThresholds(input), [input]);

  if (!now || !imagined) return null;

  const nextUp = steps.find((s) => s.obtained > 0 && s.grade !== now.grade);
  const sgpaDelta =
    imagined.sgpa !== null && now.sgpa !== null ? imagined.sgpa - now.sgpa : null;
  const color = GRADE_COLORS[imagined.grade];

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      className="overflow-hidden"
    >
      <div className="mt-1.5 rounded-xl bg-surface-2/70 p-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs font-bold">
            If you get <span className="tabular">{fmt(obtained)}</span>/{fmt(component.max)}
          </span>
          <span className="text-xs font-bold tabular" style={{ color }}>
            {floorTotal(imagined.total)}/100 · {imagined.grade}
          </span>
        </div>

        <input
          type="range"
          min={0}
          max={component.max}
          step={0.5}
          value={obtained}
          onChange={(e) => setObtained(Number(e.target.value))}
          aria-label={`Imagined mark for ${component.label}`}
          className="mt-2 h-6 w-full cursor-pointer accent-(--accent)"
        />

        <p className="text-[11px] text-muted">
          {sgpaDelta !== null && imagined.sgpa !== null ? (
            <>
              SGPA <b className="tabular text-ink">{imagined.sgpa.toFixed(2)}</b>
              {Math.abs(sgpaDelta) >= 0.005 && (
                <span className="tabular">
                  {" "}
                  ({sgpaDelta > 0 ? "+" : "−"}
                  {Math.abs(sgpaDelta).toFixed(2)})
                </span>
              )}
            </>
          ) : (
            "Not enough graded yet for an SGPA."
          )}
          {nextUp && (
            <>
              {" · "}
              <b className="text-ink tabular">{fmt(nextUp.obtained)}</b> here makes it a{" "}
              <b style={{ color: GRADE_COLORS[nextUp.grade] }}>{nextUp.grade}</b>
            </>
          )}
        </p>
      </div>
    </motion.div>
  );
}

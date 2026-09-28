import { useMemo } from "react";
import { TriangleAlert } from "lucide-react";
import { useArchives } from "@/hooks/useData";
import { areaRecord, isWeakArea } from "@/lib/pastRecord";
import { cn } from "@/lib/utils";

/**
 * A heads-up when this subject's area has gone worse for you than the rest
 * of your record (pastRecord.ts): "Maths: A*, C before - 6.5 against your
 * 8.14". Says nothing otherwise, including with no past semesters.
 */
export function AreaHistoryNote({ code, className }: { code: string; className?: string }) {
  const { data: archives } = useArchives();
  const record = useMemo(() => areaRecord(archives ?? [], code), [archives, code]);
  if (!isWeakArea(record)) return null;
  const grades = record.courses.map((c) => `${c.grade}${c.starred ? "*" : ""}`).join(", ");
  return (
    <div className={cn("flex items-start gap-2.5 rounded-2xl bg-warn/10 px-3 py-2.5 text-xs font-medium", className)}>
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn-deep" />
      <p>
        <span className="font-bold text-ink">{record.area.label} has been your hardest area</span>: {grades} in past
        semesters, {record.points.toFixed(1)} grade points against your {record.overallPoints.toFixed(2)} overall. The
        forecast for this subject starts a little lower because of it, and give it more of your time than it seems to
        need.
      </p>
    </div>
  );
}

import { useMemo } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";
import type { Mark, Subject } from "@/types";
import type { PortalMarkRow } from "@/lib/portal/parse";
import type { PortalMarkTotal } from "@/lib/portal/marksPaste";
import { floorMarks } from "@/lib/plan";

/** What a marks paste found: components by subject, an untitled popup to assign, and the summary's totals checked against yours. */
export function PastedMarksPreview({
  marks,
  uncoded,
  totals,
  subjects,
  current,
  assignTo,
  onAssign,
}: {
  marks: PortalMarkRow[];
  uncoded: PortalMarkRow[];
  totals: PortalMarkTotal[];
  subjects: Subject[];
  current: Mark[];
  assignTo: string;
  onAssign: (code: string) => void;
}) {
  const byCode = useMemo(() => new Map(subjects.map((s) => [s.code.trim().toUpperCase(), s])), [subjects]);
  const name = (code: string) => byCode.get(code)?.name ?? code;

  const groups = useMemo(() => {
    const g = new Map<string, PortalMarkRow[]>();
    for (const m of marks) g.set(m.subject_code, [...(g.get(m.subject_code) ?? []), m]);
    return [...g];
  }, [marks]);

  const checks = useMemo(
    () =>
      totals.map((t) => {
        const subject = byCode.get(t.subject_code);
        const mine = current.filter((m) => subject && m.subject_id === subject.id && !m.is_external);
        const got = floorMarks(mine.reduce((s, m) => s + (Number(m.marks_obtained) || 0), 0));
        const max = floorMarks(mine.reduce((s, m) => s + (Number(m.max_marks) || 0), 0));
        const same = Math.abs(got - t.obtained) < 0.005 && Math.abs(max - t.max) < 0.005;
        return { ...t, known: !!subject, got, max: t.max, mineMax: max, same };
      }),
    [totals, current, byCode]
  );
  const differing = checks.filter((c) => c.known && !c.same);

  return (
    <div className="space-y-2.5">
      {groups.length > 0 && (
        <div className="rounded-2xl border bg-surface-2/40 p-3 text-xs">
          <p className="font-bold">
            {marks.length} mark{marks.length === 1 ? "" : "s"} across {groups.length} subject{groups.length === 1 ? "" : "s"}
          </p>
          <ul className="mt-1.5 space-y-1 text-muted">
            {groups.map(([code, rows]) => (
              <li key={code}>
                <span className="font-semibold text-ink">{name(code)}</span>
                {": "}
                <span className="tabular">{rows.map((r) => `${r.label} ${r.marks_obtained}/${r.max_marks}`).join(" · ")}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-muted">A test you typed in yourself is replaced by the portal's mark, not counted twice.</p>
        </div>
      )}

      {uncoded.length > 0 && (
        <div className="rounded-2xl border bg-surface-2/40 p-3 text-xs">
          <p className="font-bold">
            <span className="tabular">{uncoded.map((r) => `${r.label} ${r.marks_obtained}/${r.max_marks}`).join(" · ")}</span>
          </p>
          <label className="mt-2 block font-semibold text-muted" htmlFor="pasted-marks-subject">
            The popup's title wasn't in the copy - which subject is this?
          </label>
          <select
            id="pasted-marks-subject"
            value={assignTo}
            onChange={(e) => onAssign(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border bg-surface px-3 text-sm font-semibold"
          >
            <option value="">Choose a subject…</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.code.trim().toUpperCase()}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>
        </div>
      )}

      {checks.length > 0 && (
        <div className="rounded-2xl border bg-surface-2/40 p-3 text-xs">
          <p className="font-bold">
            {differing.length === 0
              ? "Every subject's total matches the portal"
              : `${differing.length} subject${differing.length === 1 ? " differs" : "s differ"} from the portal`}
          </p>
          <ul className="mt-1.5 space-y-1">
            {checks.map((c) => (
              <li key={c.subject_code} className="flex items-start gap-1.5">
                {c.same ? (
                  <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-good" aria-label="matches" />
                ) : (
                  <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0 text-warn-deep" aria-label="differs" />
                )}
                <span>
                  <span className="font-semibold">{name(c.subject_code)}</span>{" "}
                  <span className="tabular text-muted">
                    portal {c.obtained}/{c.max}
                    {!c.known ? " · not one of your subjects" : c.same ? "" : ` · AcadKit ${c.got}/${c.mineMax}`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {differing.length > 0 && (
            <p className="mt-2 text-muted">
              The summary only has totals. Open <b>View Details</b> for {differing.length === 1 ? "that subject" : "those subjects"} on the portal
              and paste the popup here - or grab every subject at once with <b>Copy all marks</b> (Settings → Portal).
            </p>
          )}
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useAddSubject } from "@/hooks/useData";
import { setupOptions, takenCodes, type Curriculum } from "@/lib/curriculum";
import { cn } from "@/lib/utils";
import type { SemesterArchive } from "@/types";

const PALETTE = ["#7c6af7", "#f97316", "#22d3ee", "#4ade80", "#f472b6", "#facc15", "#fb7185", "#a78bfa", "#38bdf8", "#34d399"];

/** Add a semester's subjects from the curriculum instead of typing them. */
export function SemesterSetupSheet({
  open,
  onClose,
  curriculum,
  archives,
  currentCodes,
  defaultSemester,
}: {
  open: boolean;
  onClose: () => void;
  curriculum: Curriculum;
  archives: SemesterArchive[];
  currentCodes: string[];
  defaultSemester: number;
}) {
  const add = useAddSubject();
  const [semester, setSemester] = useState(defaultSemester);
  const taken = useMemo(() => takenCodes(archives, currentCodes), [archives, currentCodes]);
  const options = useMemo(() => setupOptions(curriculum, semester, taken), [curriculum, semester, taken]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  // For elective slots and choice groups: which course was actually chosen.
  const [chosen, setChosen] = useState<Record<string, string>>({});

  // Reset the ticks when the list itself changes (another semester), not on every re-render.
  const optionsKey = options.map((o) => o.course.code).join("|");
  useEffect(() => {
    setPicked(Object.fromEntries(options.map((o) => [o.course.code, o.suggested])));
    setChosen({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionsKey]);

  const rows = options.map((o) => {
    const c = o.course;
    const list = c.slot ? curriculum.electives[c.slot] : null;
    const pick = chosen[c.code];
    const code = list ? pick ?? "" : c.code;
    const title = list ? list.find(([k]) => k === pick)?.[1] ?? "" : c.title;
    return { o, list, code, title, ready: !!code };
  });
  const toAdd = rows.filter((r) => picked[r.o.course.code] && r.ready);

  function save() {
    toAdd.forEach((r, i) =>
      add.mutate({
        name: r.title,
        code: r.code,
        credits: r.o.course.credits,
        type: "theory",
        faculty: null,
        color_hex: PALETTE[(currentCodes.length + i) % PALETTE.length],
        internal_only: false,
        assessment: null,
        target_grade: null,
        medical_leave: false, // a new semester starts without ML
        short_name: null,
      })
    );
    toast.success(`${toAdd.length} subject${toAdd.length === 1 ? "" : "s"} added. Set each one's marks plan when it's announced.`);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Set up a semester"
      description="From your curriculum. Tick what you're actually taking."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {curriculum.semesters.map((s) => (
            <button
              key={s.n}
              type="button"
              onClick={() => setSemester(s.n)}
              className={cn(
                "h-9 min-w-9 rounded-xl px-3 text-sm font-bold",
                semester === s.n ? "bg-accent text-white" : "bg-surface-2 text-muted hover:text-ink"
              )}
            >
              {s.n}
            </button>
          ))}
        </div>

        {currentCodes.length > 0 && (
          <p className="rounded-xl bg-warn/10 px-3 py-2 text-xs font-medium">
            You still have {currentCodes.length} subjects this term. Archive the semester in History first, then set up the
            next one, or the two will mix.
          </p>
        )}

        {options.length === 0 ? (
          <p className="py-6 text-center text-sm font-medium text-muted">Everything planned for this semester is already taken.</p>
        ) : (
          <div className="space-y-1.5">
            {rows.map(({ o, list, title }) => (
              <label key={o.course.code} className="flex items-start gap-3 rounded-xl bg-surface-2/40 px-3 py-2.5">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-[hsl(var(--accent))]"
                  checked={!!picked[o.course.code]}
                  onChange={(e) => setPicked((p) => ({ ...p, [o.course.code]: e.target.checked }))}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{list ? o.course.title : title}</span>
                  <span className="block text-[11px] font-medium text-muted">
                    {list ? "pick one" : o.course.code} · {o.course.credits} credit{o.course.credits === 1 ? "" : "s"}
                    {o.plannedFor !== semester && ` · planned for Sem ${o.plannedFor}, not taken yet`}
                    {o.course.credits === 0 && " · non-credit, moves between semesters"}
                  </span>
                  {list && (
                    <select
                      value={chosen[o.course.code] ?? ""}
                      onChange={(e) => {
                        setChosen((c) => ({ ...c, [o.course.code]: e.target.value }));
                        setPicked((p) => ({ ...p, [o.course.code]: !!e.target.value }));
                      }}
                      className="mt-1.5 w-full rounded-lg border bg-surface px-2 py-1.5 text-base sm:text-xs"
                    >
                      <option value="">Choose the elective…</option>
                      {list.map(([code, name]) => (
                        <option key={code} value={code}>
                          {name} ({code})
                        </option>
                      ))}
                    </select>
                  )}
                </span>
              </label>
            ))}
          </div>
        )}

        <Button className="w-full" onClick={save} disabled={toAdd.length === 0}>
          Add {toAdd.length} subject{toAdd.length === 1 ? "" : "s"} ·{" "}
          {toAdd.reduce((n, r) => n + r.o.course.credits, 0)} credits
        </Button>
      </div>
    </Sheet>
  );
}

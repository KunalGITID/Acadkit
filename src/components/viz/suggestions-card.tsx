import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, FileSearch, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dot } from "@/components/ui/misc";
import {
  useAddDeadline,
  useDecideSuggestion,
  useDeadlines,
  useSubjects,
  useSuggestions,
  useUpdateDeadline,
  useUpdateSubject,
} from "@/hooks/useData";
import { deadlineLabel } from "@/lib/deadlines";
import { deadlineOffers, movedDueDate, planOffers, type DeadlineOffer, type PlanOffer } from "@/lib/suggestions";
import { haptic } from "@/lib/utils";

const SHOWN = 3;

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "DSA_21CSC201J/06_Notes_from_WhatsApp.pdf" → "06 Notes from WhatsApp". */
function sourceName(path: string | null): string | null {
  if (!path) return null;
  return path.slice(path.lastIndexOf("/") + 1).replace(/\.[a-z0-9]+$/i, "").replace(/_/g, " ");
}

/**
 * Deadlines the weekly scan found in your files, waiting for a yes.
 *
 * Invisible when there's nothing to decide — the steady state. Each row
 * says where it came from and quotes the line, because the whole point
 * of asking instead of adding is that you can check it.
 */
export function SuggestionsCard() {
  const { data: suggestions } = useSuggestions();
  const { data: deadlines } = useDeadlines();
  const { data: subjects } = useSubjects();
  const add = useAddDeadline();
  const updateSubject = useUpdateSubject();
  const updateDeadline = useUpdateDeadline();
  const decide = useDecideSuggestion();
  const [showAll, setShowAll] = useState(false);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const offers = useMemo(
    () => deadlineOffers(suggestions, deadlines, subjects, now),
    [suggestions, deadlines, subjects, now]
  );
  const plans = useMemo(() => planOffers(suggestions, subjects), [suggestions, subjects]);
  if (offers.length === 0 && plans.length === 0) return null;

  const visible = showAll ? offers : offers.slice(0, SHOWN);

  function accept(o: DeadlineOffer) {
    haptic([10, 40, 14]);
    if (o.moves) {
      // A reschedule updates the deadline you have; adding would leave the
      // old date standing beside the new one.
      updateDeadline.mutate({ id: o.moves.id, patch: { due_date: movedDueDate(o.moves, o.deadline.due_date) } });
      decide.mutate({ id: o.suggestion.id, status: "accepted" });
      toast.success(`Moved ${deadlineLabel(o.deadline, o.subject ?? undefined)} to ${when(o.deadline.due_date).split(",").slice(0, 2).join(",")}`);
      return;
    }
    add.mutate(o.deadline);
    decide.mutate({ id: o.suggestion.id, status: "accepted" });
    toast.success(`Added ${deadlineLabel(o.deadline, o.subject ?? undefined)}`);
  }

  function apply(o: PlanOffer) {
    haptic([10, 40, 14]);
    // internal_only is kept written in step with the weight (see CLAUDE.md),
    // so a device that hasn't run migration 021 still agrees.
    updateSubject.mutate({
      id: o.subject.id,
      patch: { assessment: o.assessment, internal_only: o.assessment.internal === 100 },
    });
    decide.mutate({ id: o.suggestion.id, status: "accepted" });
    toast.success(`Marks plan set for ${o.subject.short_name || o.subject.name}`);
  }

  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center gap-2">
        <FileSearch className="h-4 w-4 text-accent" />
        <p className="text-xs font-bold uppercase tracking-widest text-muted">
          Found in your files · {offers.length + plans.length}
        </p>
      </div>

      {plans.length > 0 && (
        <div className="mb-2 space-y-2">
          {plans.map((o) => (
            <div key={o.suggestion.id} className="rounded-2xl border bg-surface-2/40 p-3">
              <p className="flex items-start gap-1.5 text-sm font-bold">
                <Dot color={o.subject.color_hex} className="mt-[7px] h-1.5 w-1.5 shrink-0" />
                <span className="line-clamp-2">Marks plan · {o.subject.short_name || o.subject.name}</span>
              </p>
              <p className="mt-0.5 text-xs font-semibold text-ink">
                {o.assessment.components.map((c) => `${c.label} ${c.max}`).join(" · ")}
                {o.assessment.internal === 100 ? " · fully internal" : ` · ${o.assessment.internal} internal + ${100 - o.assessment.internal} end-sem`}
              </p>
              <p className="mt-1 text-xs font-medium text-muted">
                {!o.fresh && <span className="font-semibold text-warn-deep">Replaces your current plan. </span>}
                {o.suggestion.evidence && <span className="italic">“{o.suggestion.evidence}”</span>}
                {o.suggestion.evidence && o.suggestion.source && " — "}
                {sourceName(o.suggestion.source)}
              </p>
              <div className="mt-2.5 flex gap-2">
                <Button size="sm" onClick={() => apply(o)}>
                  <Check className="h-4 w-4" /> Apply
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    haptic();
                    decide.mutate({ id: o.suggestion.id, status: "dismissed" });
                  }}
                >
                  <X className="h-4 w-4" /> Dismiss
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {visible.map((o) => (
            <motion.div
              key={o.suggestion.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              className="rounded-2xl border bg-surface-2/40 p-3"
            >
              <p className="flex items-start gap-1.5 text-sm font-bold">
                {o.subject && <Dot color={o.subject.color_hex} className="mt-[7px] h-1.5 w-1.5 shrink-0" />}
                <span className="line-clamp-2">
                  {/* No subject means an admin item: its own name says more
                      than "Other" in front of it. */}
                  {o.subject || !o.suggestion.payload.label
                    ? deadlineLabel(o.deadline, o.subject ?? undefined)
                    : o.suggestion.payload.label}
                  {o.subject && o.suggestion.payload.label && ` · ${o.suggestion.payload.label}`}
                  {o.deadline.max_marks ? ` · ${o.deadline.max_marks} marks` : ""}
                </span>
              </p>
              {o.moves ? (
                <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs font-semibold text-ink">
                  <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warn-deep">Moved</span>
                  <span className="text-muted line-through">{when(o.moves.due_date)}</span>
                  <ArrowRight className="h-3 w-3" />
                  <span>{when(o.deadline.due_date)}</span>
                </p>
              ) : (
                <p className="mt-0.5 text-xs font-semibold text-ink">{when(o.deadline.due_date)}</p>
              )}
              {(o.suggestion.evidence || o.suggestion.source) && (
                <p className="mt-1 text-xs font-medium text-muted">
                  {o.suggestion.evidence && <span className="italic">“{o.suggestion.evidence}”</span>}
                  {o.suggestion.evidence && o.suggestion.source && " — "}
                  {sourceName(o.suggestion.source)}
                </p>
              )}
              <div className="mt-2.5 flex gap-2">
                <Button size="sm" onClick={() => accept(o)}>
                  {o.moves ? (
                    <>
                      <ArrowRight className="h-4 w-4" /> Move
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" /> Add
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    haptic();
                    decide.mutate({ id: o.suggestion.id, status: "dismissed" });
                  }}
                >
                  <X className="h-4 w-4" /> Dismiss
                </Button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {offers.length > SHOWN && (
        <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer" : `Show ${offers.length - SHOWN} more`}
        </Button>
      )}
    </section>
  );
}

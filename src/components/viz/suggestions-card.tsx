import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileSearch, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dot } from "@/components/ui/misc";
import {
  useAddDeadline,
  useDecideSuggestion,
  useDeadlines,
  useSubjects,
  useSuggestions,
} from "@/hooks/useData";
import { deadlineLabel } from "@/lib/deadlines";
import { deadlineOffers, type DeadlineOffer } from "@/lib/suggestions";
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
  if (offers.length === 0) return null;

  const visible = showAll ? offers : offers.slice(0, SHOWN);

  function accept(o: DeadlineOffer) {
    haptic([10, 40, 14]);
    add.mutate(o.deadline);
    decide.mutate({ id: o.suggestion.id, status: "accepted" });
    toast.success(`Added ${deadlineLabel(o.deadline, o.subject ?? undefined)}`);
  }

  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center gap-2">
        <FileSearch className="h-4 w-4 text-accent" />
        <p className="text-xs font-bold uppercase tracking-widest text-muted">
          Found in your files · {offers.length}
        </p>
      </div>

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
              <p className="mt-0.5 text-xs font-semibold text-ink">{when(o.deadline.due_date)}</p>
              {(o.suggestion.evidence || o.suggestion.source) && (
                <p className="mt-1 text-xs font-medium text-muted">
                  {o.suggestion.evidence && <span className="italic">“{o.suggestion.evidence}”</span>}
                  {o.suggestion.evidence && o.suggestion.source && " — "}
                  {sourceName(o.suggestion.source)}
                </p>
              )}
              <div className="mt-2.5 flex gap-2">
                <Button size="sm" onClick={() => accept(o)}>
                  <Plus className="h-4 w-4" /> Add
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

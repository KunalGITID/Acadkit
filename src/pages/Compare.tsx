import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Check, Copy, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { usePin } from "@/hooks/useData";
import { useAttendance, usePortalSnapshots, useSettings, useSubjects } from "@/hooks/useData";
import { computeOverallAttendance } from "@/lib/attendance";
import {
  buildSharedCard,
  compareCards,
  makeShareCode,
  normaliseShareCode,
  type SharedCard,
} from "@/lib/compare";
import { createShare, fetchSharedCard } from "@/api/queries";
import { useAppStore } from "@/store/app";
import { say, VOICE } from "@/lib/voice";
import { useTone } from "@/hooks/useTone";
import { cn } from "@/lib/utils";

/**
 * Compare attendance with a friend.
 *
 * The only screen in AcadKit that shows one person's data to another, so
 * it is built to make the exchange legible rather than frictionless. You
 * publish a snapshot under a random code and read theirs with a code
 * they give you — there is no directory, no search, and no way to find
 * someone who has not handed you ten characters.
 *
 * What leaves your account is defined in one place, `buildSharedCard`,
 * and it is attendance only. The card is frozen at the moment you press
 * share: a live link would keep exposing the account for as long as the
 * code existed, and nobody re-reads a permission they granted in
 * September.
 */
export default function Compare() {
  const tone = useTone();
  const pin = usePin();
  const { data: subjects } = useSubjects();
  const { data: attendance } = useAttendance();
  const { data: snapshots } = usePortalSnapshots();
  const { data: settings } = useSettings();
  const localName = useAppStore((s) => s.name);

  const overall = useMemo(
    () => computeOverallAttendance(subjects ?? [], attendance ?? [], snapshots ?? []),
    [subjects, attendance, snapshots]
  );

  const myCard = useMemo(
    () =>
      buildSharedCard(
        settings?.name || localName || null,
        overall.percentage,
        overall.subjects
      ),
    [settings?.name, localName, overall]
  );

  const [myCode, setMyCode] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [theirs, setTheirs] = useState<SharedCard | null>(null);

  async function publish() {
    setPublishing(true);
    try {
      const code = makeShareCode();
      await createShare(pin, code, myCard);
      setMyCode(code);
    } catch (err) {
      toast.error((err as Error)?.message ?? "Couldn't create a code");
    } finally {
      setPublishing(false);
    }
  }

  async function load() {
    const code = normaliseShareCode(input);
    if (code.length < 6) {
      toast.error("That code looks too short");
      return;
    }
    setLoading(true);
    try {
      const card = await fetchSharedCard(code);
      if (!card) {
        toast.error("No card for that code — it may have expired");
        return;
      }
      setTheirs(card);
    } catch (err) {
      toast.error((err as Error)?.message ?? "Couldn't load that code");
    } finally {
      setLoading(false);
    }
  }

  const comparison = theirs ? compareCards(myCard, theirs) : null;

  return (
    <div className="space-y-4">
      <Link
        to="/settings"
        className="inline-flex items-center gap-1.5 px-1 text-sm font-semibold text-muted"
      >
        <ArrowLeft className="h-4 w-4" /> Settings
      </Link>

      <h1 className="px-1 text-2xl font-extrabold tracking-tight lg:text-3xl">
        {say(VOICE.compareTitle, tone)}
      </h1>

      {/* Share your own */}
      <section className="card space-y-3 p-5">
        <div>
          <p className="font-bold">{say(VOICE.compareShareTitle, tone)}</p>
          <p className="mt-0.5 text-xs text-muted">
            Attendance percentages and subject names only — no marks, no SGPA, no dates. Frozen
            as they are now, and the code stops working after 30 days.
          </p>
        </div>

        {myCode ? (
          <button
            onClick={() => {
              navigator.clipboard?.writeText(myCode);
              toast.success("Code copied");
            }}
            className="flex w-full items-center justify-between gap-3 rounded-2xl border bg-surface-2/40 px-4 py-3"
          >
            <span className="font-mono text-xl font-extrabold tracking-[0.2em]">{myCode}</span>
            <Copy className="h-4 w-4 shrink-0 text-muted" />
          </button>
        ) : (
          <Button className="w-full" onClick={publish} disabled={publishing}>
            {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
            {publishing ? "Creating…" : say(VOICE.compareShareAction, tone)}
          </Button>
        )}
      </section>

      {/* Read theirs */}
      <section className="card space-y-3 p-5">
        <p className="font-bold">{say(VOICE.compareEnterTitle, tone)}</p>
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="K7M2PX9QRT"
            autoCapitalize="characters"
            className="font-mono tracking-widest"
          />
          <Button className="shrink-0" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Compare"}
          </Button>
        </div>
      </section>

      {comparison && theirs && (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card overflow-hidden"
        >
          <div className="grid grid-cols-2 divide-x border-b">
            <Side label="You" value={comparison.overall.mine} />
            <Side label={theirs.name ?? "Them"} value={comparison.overall.theirs} />
          </div>

          <ul className="divide-y">
            {comparison.rows.map((r) => (
              <li key={r.name} className="px-5 py-3">
                <p className="flex items-start gap-2 text-sm font-bold">
                  <span
                    aria-hidden
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: r.color }}
                  />
                  <span className="line-clamp-2">{r.name}</span>
                </p>
                <div className="mt-1.5 grid grid-cols-2 gap-3 text-sm font-extrabold tabular">
                  <Cell value={r.mine} other={r.theirs} />
                  <Cell value={r.theirs} other={r.mine} />
                </div>
              </li>
            ))}
          </ul>
        </motion.section>
      )}

      {!comparison && (
        <EmptyState
          icon={Users}
          title={say(VOICE.compareEmptyTitle, tone)}
          description={say(VOICE.compareEmptyBody, tone)}
        />
      )}
    </div>
  );
}

function Side({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="p-5 text-center">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted">{label}</p>
      <p className="mt-1 text-3xl font-extrabold tabular">{value === null ? "—" : `${value}%`}</p>
    </div>
  );
}

/**
 * One side of a subject row.
 *
 * Only the leader is emphasised, and only when there is a leader — a tie
 * highlighted on both sides reads as a rendering bug, and a subject only
 * one of you takes has nothing to win.
 */
function Cell({ value, other }: { value: number | null; other: number | null }) {
  if (value === null) return <span className="text-muted">—</span>;
  const ahead = other !== null && value > other;
  return (
    <span className={cn(ahead ? "text-good-deep" : "text-ink")}>
      {value}%{ahead && <Check className="ml-1 inline h-3.5 w-3.5" strokeWidth={3} />}
    </span>
  );
}

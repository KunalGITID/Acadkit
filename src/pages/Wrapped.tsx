import { useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Loader2, Share2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { AnimatedNumber } from "@/components/viz/animated-number";
import {
  useAttendance,
  useMarks,
  usePortalSnapshots,
  useSettings,
  useSubjects,
} from "@/hooks/useData";
import { computeOverallAttendance } from "@/lib/attendance";
import { buildEffectiveMap, semesterWindow } from "@/lib/calendar";
import { groupMarksBySubject } from "@/lib/grades";
import { computeSgpa } from "@/lib/plan";
import { buildWrapped, type Wrapped as WrappedData } from "@/lib/wrapped";
import { renderWrappedCard, shareCard } from "@/lib/shareCard";
import { say, VOICE } from "@/lib/voice";
import { useTone } from "@/hooks/useTone";
import { useSwipe } from "@/hooks/useSwipe";
import { useAppStore } from "@/store/app";
import { cn } from "@/lib/utils";
import { useDialog } from "@/components/ui/dialog";
import { clearAcademicData } from "@/api/queries";

/**
 * The semester as a set of cards you swipe through.
 *
 * The format only works if it is honest. Every figure here is a count of
 * something recorded — `buildWrapped` refuses to invent a superlative it
 * can't support, and returns null for anything unknowable, which is why
 * slides are filtered rather than rendered with a fallback. One made-up
 * stat makes the reader distrust the other nine.
 *
 * It is an occasion, not a destination. It plays once, straight after
 * you archive a semester in History — the one moment it means anything
 * — and then offers to clear the term and start the next. Opened any
 * other way it sends you to History: a recap you can pull up in week
 * three is furniture, and one you get at the end is a send-off.
 *
 * Starting fresh lives on the last card rather than in History because
 * clearing the term deletes what these cards are counted from. Asking
 * before the recap had played would have wiped it before you saw it.
 */

interface Slide {
  id: string;
  render: () => React.ReactNode;
}

export default function Wrapped() {
  const tone = useTone();
  const location = useLocation();
  // Set by History's archive flow; nothing else links here. Read once:
  // page transitions keep this page rendered while it animates out, and
  // it re-renders with the *next* location — whose state has no label —
  // so reading it live sent "start the new semester" to History instead
  // of Home.
  const [archived] = useState(
    () => (location.state as { archived?: string } | null)?.archived ?? null
  );
  const { data: subjects } = useSubjects();
  const { data: attendance } = useAttendance();
  const { data: snapshots } = usePortalSnapshots();
  const { data: marks } = useMarks();
  const { data: settings } = useSettings();
  const localName = useAppStore((s) => s.name);
  const name = (settings?.name || localName || "").trim();

  const overall = useMemo(
    () => computeOverallAttendance(subjects ?? [], attendance ?? [], snapshots ?? []),
    [subjects, attendance, snapshots]
  );
  const semStart = settings?.sem_start ?? null;
  const semEnd = settings?.sem_end ?? null;
  const effMap = useMemo(
    () =>
      buildEffectiveMap(
        settings?.declared_holidays ?? [],
        semesterWindow({ sem_start: semStart, sem_end: semEnd })
      ),
    [settings?.declared_holidays, semStart, semEnd]
  );

  const data = useMemo(
    () => buildWrapped(overall.subjects, attendance ?? [], effMap, marks ?? [], subjects ?? []),
    [overall.subjects, attendance, effMap, marks, subjects]
  );
  const sgpa = useMemo(
    () => computeSgpa(subjects ?? [], groupMarksBySubject(marks ?? [])).sgpa,
    [subjects, marks]
  );

  const [index, setIndex] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);

  const slides = useMemo(
    () => buildSlides(data, sgpa, tone, name),
    [data, sgpa, tone, name]
  );

  const go = (delta: number) =>
    setIndex((i) => Math.min(slides.length - 1, Math.max(0, i + delta)));

  /**
   * A completed swipe still ends in a click on most browsers, and the
   * card advances on tap, so an unguarded swipe left moved two cards.
   * The flag is cleared on a timeout rather than in the click handler,
   * because the click that needs suppressing may never arrive.
   */
  const justSwiped = useRef(false);
  const swiped = (delta: number) => {
    justSwiped.current = true;
    setTimeout(() => (justSwiped.current = false), 400);
    go(delta);
  };
  const swipe = useSwipe(
    () => swiped(1),
    () => swiped(-1)
  );

  async function onShare() {
    setSharing(true);
    setShareNote(null);
    try {
      const blob = await renderWrappedCard({
        title: say(VOICE.wrappedTitle, tone),
        heroValue: String(data.hours),
        heroLabel: say(VOICE.wrappedHours, tone, data.hours),
        /**
         * Four slots, filled in priority order and truncated by the
         * renderer. The card summarises the page, and the page now covers
         * marks as well as attendance — a card that spent all four slots
         * on attendance was telling half the story it claimed to.
         *
         * Best result outranks the streak, and the streak outranks best
         * subject, so an account with no marks still fills the grid
         * rather than leaving a hole.
         */
        stats: [
          { value: String(data.attended), label: say(VOICE.wrappedAttended, tone), color: "#4ade80" },
          { value: String(data.missed), label: say(VOICE.wrappedMissed, tone), color: "#fb7185" },
          ...(data.bestResult
            ? [
                {
                  value: `${data.bestResult.obtained}/${data.bestResult.max}`,
                  label: `best: ${data.bestResult.subject}`,
                  color: data.bestResult.color,
                },
              ]
            : []),
          ...(data.cleanStreak > 0
            ? [{ value: String(data.cleanStreak), label: "day clean streak" }]
            : []),
          ...(data.best
            ? [
                {
                  value: `${Math.round(data.best.percentage)}%`,
                  label: data.best.name,
                  color: data.best.color,
                },
              ]
            : []),
        ],
        footer: "AcadKit",
      });
      const how = await shareCard(blob, "acadkit-wrapped.png");
      setShareNote(how === "shared" ? "Shared." : "Saved to your downloads.");
    } catch (err) {
      setShareNote((err as Error)?.message ?? "Couldn't make the image.");
    } finally {
      setSharing(false);
    }
  }

  if (!archived) return <Navigate to="/history" replace />;

  if (data.empty) {
    return (
      <div className="space-y-4">
        <BackLink />
        <EmptyState
          icon={Share2}
          title={say(VOICE.wrappedTitle, tone)}
          description={say(VOICE.wrappedEmpty, tone)}
        />
        <StartFresh label={archived} />
      </div>
    );
  }

  const current = slides[Math.min(index, slides.length - 1)];

  return (
    <div className="space-y-4">
      <BackLink />
      <p className="flex items-center gap-1.5 px-1 text-xs font-bold uppercase tracking-widest text-muted">
        <Sparkles className="h-3.5 w-3.5 text-accent" /> {archived} · that's a wrap
      </p>

      {/* Story progress: one segment per slide, filled up to where you
          are. Tapping a segment jumps, which is the only affordance a
          story format reliably teaches.

          The bar is 4px but the button is not: padding gives each
          segment a finger-sized target without thickening the rule.
          Drawn at its real height it was unhittable, and taps fell
          through to whatever sat behind it. */}
      <div className="-my-2 flex gap-1.5 px-1">
        {slides.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setIndex(i)}
            aria-label={`Card ${i + 1} of ${slides.length}`}
            aria-current={i === index}
            className="group flex-1 py-2"
          >
            <span className="block h-1 overflow-hidden rounded-full bg-ink/10">
              <motion.span
                className="block h-full rounded-full bg-accent"
                initial={false}
                animate={{ scaleX: i <= index ? 1 : 0 }}
                style={{ originX: 0 }}
                transition={{ type: "spring", stiffness: 220, damping: 28 }}
              />
            </span>
          </button>
        ))}
      </div>

      <div
        {...swipe}
        className="relative min-h-[22rem] touch-pan-y select-none"
        onClick={() => {
          if (!justSwiped.current) go(1);
        }}
      >
        <AnimatePresence mode="wait">
          <motion.section
            key={current.id}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="card flex min-h-[22rem] flex-col justify-center p-7"
          >
            {current.render()}
          </motion.section>
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-2 px-1">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => go(-1)}
          disabled={index === 0}
        >
          Back
        </Button>
        {index < slides.length - 1 ? (
          <Button className="flex-1" onClick={() => go(1)}>
            Next
          </Button>
        ) : (
          <Button className="flex-1" onClick={onShare} disabled={sharing}>
            <Share2 className="h-4 w-4" />
            {sharing ? "Rendering…" : say(VOICE.wrappedShare, tone)}
          </Button>
        )}
      </div>
      {shareNote && (
        <p className="px-1 text-center text-xs font-semibold text-muted">{shareNote}</p>
      )}
      {/* Only after the last card: the recap first, then the goodbye. */}
      {index === slides.length - 1 && <StartFresh label={archived} />}
    </div>
  );
}

/**
 * The step archiving used to ask straight away. It clears the term the
 * cards above were counted from, so it waits until they've been seen.
 */
function StartFresh({ label }: { label: string }) {
  const tone = useTone();
  const { confirm } = useDialog();
  const pin = useAppStore((s) => s.pin)!;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function start() {
    const ok = await confirm({
      title: "Start the new semester?",
      body: `${label} is saved in History. This clears its subjects, timetable, attendance and marks — and this recap with them.`,
      confirmLabel: "Clear and start fresh",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await clearAcademicData(pin);
      // Leave before the refetch, so the recap isn't seen emptying out.
      navigate("/", { replace: true });
      toast.success(say(VOICE.semesterCleared, tone));
      await qc.invalidateQueries();
    } catch (err) {
      toast.error("Couldn't clear the semester", {
        description: err instanceof Error ? err.message : undefined,
      });
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-3 p-5">
      <p className="text-sm font-semibold text-muted">
        Screenshot what you want to keep — this recap goes when the new semester starts.
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={() => navigate("/history")}>
          Not yet
        </Button>
        <Button className="flex-1" onClick={start} disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Start the new semester
        </Button>
      </div>
    </section>
  );
}

function BackLink() {
  return (
    <Link
      to="/history"
      className="inline-flex items-center gap-1.5 px-1 text-sm font-semibold text-muted"
    >
      <ArrowLeft className="h-4 w-4" /> History
    </Link>
  );
}

/**
 * Slides are built from what exists.
 *
 * A slide with no data isn't rendered with a dash — it's absent. Nine
 * true cards beat twelve with three shrugs in them.
 */
function buildSlides(
  data: WrappedData,
  sgpa: number | null,
  tone: ReturnType<typeof useTone>,
  name: string
): Slide[] {
  const slides: Slide[] = [
    {
      id: "intro",
      render: () => (
        <>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-muted">
            {say(VOICE.wrappedTitle, tone)}
          </p>
          <h2 className="mt-3 text-4xl font-extrabold leading-tight">
            {name ? `${name},` : ""}
          </h2>
          <p className="mt-1 text-2xl font-bold text-muted">{say(VOICE.wrappedIntro, tone)}</p>
        </>
      ),
    },
    {
      id: "hours",
      render: () => (
        <Big
          value={data.hours}
          label={say(VOICE.wrappedHours, tone, data.hours)}
          detail={`${data.attended} classes × 50 minutes`}
        />
      ),
    },
    {
      id: "split",
      render: () => (
        <>
          <Big value={data.attended} label={say(VOICE.wrappedAttended, tone)} tint="text-good-deep" />
          <div className="mt-6 border-t pt-5">
            <Big
              value={data.missed}
              label={say(VOICE.wrappedMissed, tone)}
              tint="text-bad-deep"
              small
            />
          </div>
        </>
      ),
    },
  ];

  if (data.best && data.worst) {
    slides.push({
      id: "subjects",
      render: () => (
        <>
          <Highlight
            heading={say(VOICE.wrappedBest, tone)}
            name={data.best!.name}
            pct={data.best!.percentage}
            color={data.best!.color}
          />
          <div className="mt-6 border-t pt-5">
            <Highlight
              heading={say(VOICE.wrappedWorst, tone)}
              name={data.worst!.name}
              pct={data.worst!.percentage}
              color={data.worst!.color}
            />
          </div>
        </>
      ),
    });
  }

  if (data.cleanStreak > 0) {
    slides.push({
      id: "streak",
      render: () => (
        <Big
          value={data.cleanStreak}
          label={say(VOICE.wrappedStreak, tone, data.cleanStreak)}
          detail={`across ${data.daysMarked} days you marked`}
        />
      ),
    });
  }

  slides.push({
    id: "worst-day",
    render: () =>
      data.worstDayOrder ? (
        <Big
          value={data.worstDayOrder.missed}
          label={say(VOICE.wrappedWorstDay, tone, data.worstDayOrder.dayOrder, data.worstDayOrder.missed)}
          detail={`classes missed on Day ${data.worstDayOrder.dayOrder}`}
        />
      ) : (
        <p className="text-3xl font-extrabold leading-tight">
          {say(VOICE.wrappedNoAbsence, tone)}
        </p>
      ),
  });

  if (data.bestResult) {
    slides.push({
      id: "best-result",
      render: () => {
        const r = data.bestResult!;
        return (
          <>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-muted">
              {say(VOICE.wrappedBestResult, tone)}
            </p>
            <p className="mt-3 text-6xl font-extrabold tabular">
              {r.obtained}
              <span className="text-2xl text-muted">/{r.max}</span>
            </p>
            <p className="mt-2 flex items-start gap-2.5 text-xl font-extrabold">
              <span
                aria-hidden
                className="mt-2 h-3 w-3 shrink-0 rounded-full"
                style={{ background: r.color }}
              />
              <span className="line-clamp-2">{r.subject}</span>
            </p>
            <p className="mt-1 text-xs font-medium text-muted">
              {r.label} · {Math.round(r.percentage)}%
            </p>
          </>
        );
      },
    });
  }

  if (data.marksTotal) {
    slides.push({
      id: "marks-total",
      render: () => (
        <Big
          value={data.marksTotal!.obtained}
          label={say(VOICE.wrappedTotalMarks, tone)}
          detail={`out of ${data.marksTotal!.max} across ${data.componentsGraded} component${
            data.componentsGraded === 1 ? "" : "s"
          }`}
        />
      ),
    });
  }

  if (sgpa !== null) {
    slides.push({
      id: "sgpa",
      render: () => (
        <Big value={sgpa} decimals={2} label="predicted SGPA" detail="from internals so far" />
      ),
    });
  }

  return slides;
}

function Big({
  value,
  label,
  detail,
  tint,
  decimals = 0,
  small,
}: {
  value: number;
  label: string;
  detail?: string;
  tint?: string;
  decimals?: number;
  small?: boolean;
}) {
  return (
    <div>
      <p className={cn("font-extrabold tabular", small ? "text-5xl" : "text-7xl", tint)}>
        <AnimatedNumber value={value} decimals={decimals} />
      </p>
      <p className={cn("mt-1 font-bold", small ? "text-base" : "text-xl")}>{label}</p>
      {detail && <p className="mt-1 text-xs font-medium text-muted">{detail}</p>}
    </div>
  );
}

function Highlight({
  heading,
  name,
  pct,
  color,
}: {
  heading: string;
  name: string;
  pct: number;
  color: string;
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">{heading}</p>
      <p className="mt-1.5 flex items-start gap-2.5 text-2xl font-extrabold">
        <span
          aria-hidden
          className="mt-2 h-3 w-3 shrink-0 rounded-full"
          style={{ background: color }}
        />
        <span className="line-clamp-2">{name}</span>
      </p>
      <p className="mt-1 text-3xl font-extrabold tabular">{Math.round(pct)}%</p>
    </div>
  );
}

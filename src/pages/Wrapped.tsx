import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Share2 } from "lucide-react";
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
import { computeSgpa, groupMarksBySubject } from "@/lib/grades";
import { buildWrapped, type Wrapped as WrappedData } from "@/lib/wrapped";
import { renderWrappedCard, shareCard } from "@/lib/shareCard";
import { say, VOICE } from "@/lib/voice";
import { useTone } from "@/hooks/useTone";
import { useSwipe } from "@/hooks/useSwipe";
import { useAppStore } from "@/store/app";
import { cn } from "@/lib/utils";

/**
 * The semester as a set of cards you swipe through.
 *
 * The format only works if it is honest. Every figure here is a count of
 * something recorded — `buildWrapped` refuses to invent a superlative it
 * can't support, and returns null for anything unknowable, which is why
 * slides are filtered rather than rendered with a fallback. One made-up
 * stat makes the reader distrust the other nine.
 *
 * It lives outside the tab bar because it is an occasion, not a
 * destination: reached from Settings or a dashboard link, read once, and
 * shared. Putting it in the nav would make it furniture.
 */

interface Slide {
  id: string;
  render: () => React.ReactNode;
}

export default function Wrapped() {
  const tone = useTone();
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
        stats: [
          { value: String(data.attended), label: say(VOICE.wrappedAttended, tone), color: "#4ade80" },
          { value: String(data.missed), label: say(VOICE.wrappedMissed, tone), color: "#fb7185" },
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

  if (data.empty) {
    return (
      <div className="space-y-4">
        <BackLink />
        <EmptyState
          icon={Share2}
          title={say(VOICE.wrappedTitle, tone)}
          description={say(VOICE.wrappedEmpty, tone)}
        />
      </div>
    );
  }

  const current = slides[Math.min(index, slides.length - 1)];

  return (
    <div className="space-y-4">
      <BackLink />

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
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/settings"
      className="inline-flex items-center gap-1.5 px-1 text-sm font-semibold text-muted"
    >
      <ArrowLeft className="h-4 w-4" /> Settings
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
